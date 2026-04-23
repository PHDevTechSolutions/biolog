// lib/offline-auth.ts
// Offline credential + session cache.
// Primary: IndexedDB. Fallback: localStorage (for private browsing / iOS quirks).

const DB_NAME       = "acculog-auth";
const DB_VERSION    = 5;
const AUTH_STORE    = "credentials";
const USER_STORE    = "users";
const SESSION_STORE = "session";

const CRED_TTL_MS    = 1000 * 60 * 60 * 24 * 30; // 30 days
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;  // 7 days

// ── localStorage keys (fallback) ─────────────────────────────────────────────
const LS_CRED_PREFIX   = "acculog_cred_";
const LS_SESSION_KEY   = "acculog_session";
const LS_USER_PREFIX   = "acculog_user_";

export interface CachedCredential {
  key: string;
  email: string;
  hash: string;
  isPinLogin: boolean;
  userId: string;
  cachedAt: number;
}

export interface CachedUser {
  userId: string;
  data: Record<string, unknown>;
  cachedAt: number;
}

export interface OfflineSession {
  id: "current";
  userId: string;
  cachedAt: number;
}

// ── Crypto ────────────────────────────────────────────────────────────────────

async function sha256(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hashCredential(email: string, secret: string): Promise<string> {
  return sha256(`${email.toLowerCase()}::${secret}`);
}

function credKey(email: string, isPinLogin: boolean): string {
  return `${email.toLowerCase()}:${isPinLogin ? "pin" : "password"}`;
}

// ── IndexedDB open ────────────────────────────────────────────────────────────

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      _dbPromise = null;
      reject(new Error("IndexedDB unavailable"));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;

      // credentials store — always drop & recreate to ensure correct key format
      if (db.objectStoreNames.contains(AUTH_STORE)) {
        db.deleteObjectStore(AUTH_STORE);
      }
      db.createObjectStore(AUTH_STORE, { keyPath: "key" });

      if (!db.objectStoreNames.contains(USER_STORE)) {
        db.createObjectStore(USER_STORE, { keyPath: "userId" });
      }
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: "id" });
      }
    };

    req.onsuccess = () => resolve(req.result);

    req.onerror = () => {
      _dbPromise = null;
      reject(req.error);
    };

    req.onblocked = () => {
      _dbPromise = null;
      reject(new Error("IndexedDB blocked — close other tabs and retry"));
    };
  });

  return _dbPromise;
}

// ── localStorage fallback helpers ─────────────────────────────────────────────

function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota exceeded or private mode */ }
}

function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function lsDel(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

// ── Credential cache ──────────────────────────────────────────────────────────

export async function cacheCredential(args: {
  email: string;
  secret: string;
  isPinLogin: boolean;
  userId: string;
}): Promise<void> {
  const hash  = await hashCredential(args.email, args.secret);
  const key   = credKey(args.email, args.isPinLogin);
  const entry: CachedCredential = {
    key,
    email:      args.email,
    hash,
    isPinLogin: args.isPinLogin,
    userId:     args.userId,
    cachedAt:   Date.now(),
  };

  // Try IndexedDB first
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx    = db.transaction(AUTH_STORE, "readwrite");
      const store = tx.objectStore(AUTH_STORE);
      store.put(entry);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror    = () => { db.close(); reject(tx.error); };
    });
    // Also mirror to localStorage so it survives IDB quirks
    lsSet(`${LS_CRED_PREFIX}${key}`, entry);
    return;
  } catch (idbErr) {
    console.warn("[offline-auth] IDB cacheCredential failed, using localStorage:", idbErr);
  }

  // Fallback: localStorage only
  lsSet(`${LS_CRED_PREFIX}${key}`, entry);
}

export async function verifyOfflineCredential(args: {
  email: string;
  secret: string;
  isPinLogin: boolean;
}): Promise<{ userId: string } | null> {
  const key           = credKey(args.email, args.isPinLogin);
  const candidateHash = await hashCredential(args.email, args.secret);

  // Try IndexedDB first
  try {
    const db = await openDB();
    const cached = await new Promise<CachedCredential | undefined>((resolve, reject) => {
      const tx    = db.transaction(AUTH_STORE, "readonly");
      const store = tx.objectStore(AUTH_STORE);
      const req   = store.get(key);
      tx.oncomplete = () => db.close();
      req.onsuccess = () => resolve(req.result as CachedCredential | undefined);
      req.onerror   = () => { db.close(); reject(req.error); };
    });

    if (cached && Date.now() - cached.cachedAt <= CRED_TTL_MS && cached.hash === candidateHash) {
      return { userId: cached.userId };
    }
  } catch (idbErr) {
    console.warn("[offline-auth] IDB verifyOfflineCredential failed, trying localStorage:", idbErr);
  }

  // Fallback: localStorage
  const lsCached = lsGet<CachedCredential>(`${LS_CRED_PREFIX}${key}`);
  if (lsCached && Date.now() - lsCached.cachedAt <= CRED_TTL_MS && lsCached.hash === candidateHash) {
    return { userId: lsCached.userId };
  }

  return null;
}

// ── User profile cache ────────────────────────────────────────────────────────

export async function cacheUser(userId: string, data: Record<string, unknown>): Promise<void> {
  const entry: CachedUser = { userId, data, cachedAt: Date.now() };

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx    = db.transaction(USER_STORE, "readwrite");
      const store = tx.objectStore(USER_STORE);
      store.put(entry);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror    = () => { db.close(); reject(tx.error); };
    });
    lsSet(`${LS_USER_PREFIX}${userId}`, entry);
  } catch {
    lsSet(`${LS_USER_PREFIX}${userId}`, entry);
  }
}

export async function getCachedUser(userId: string): Promise<Record<string, unknown> | null> {
  try {
    const db = await openDB();
    const result = await new Promise<CachedUser | undefined>((resolve, reject) => {
      const tx    = db.transaction(USER_STORE, "readonly");
      const store = tx.objectStore(USER_STORE);
      const req   = store.get(userId);
      tx.oncomplete = () => db.close();
      req.onsuccess = () => resolve(req.result as CachedUser | undefined);
      req.onerror   = () => { db.close(); reject(req.error); };
    });
    if (result) return result.data;
  } catch {
    // fall through to localStorage
  }

  const lsResult = lsGet<CachedUser>(`${LS_USER_PREFIX}${userId}`);
  return lsResult ? lsResult.data : null;
}

// ── Offline Session ───────────────────────────────────────────────────────────

export async function setOfflineSession(userId: string): Promise<void> {
  const entry: OfflineSession = { id: "current", userId, cachedAt: Date.now() };

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx    = db.transaction(SESSION_STORE, "readwrite");
      const store = tx.objectStore(SESSION_STORE);
      store.put(entry);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror    = () => { db.close(); reject(tx.error); };
    });
    lsSet(LS_SESSION_KEY, entry);
  } catch {
    lsSet(LS_SESSION_KEY, entry);
  }
}

export async function getOfflineSession(): Promise<string | null> {
  // Try IndexedDB
  try {
    const db = await openDB();
    const session = await new Promise<OfflineSession | undefined>((resolve, reject) => {
      const tx    = db.transaction(SESSION_STORE, "readonly");
      const store = tx.objectStore(SESSION_STORE);
      const req   = store.get("current");
      tx.oncomplete = () => db.close();
      req.onsuccess = () => resolve(req.result as OfflineSession | undefined);
      req.onerror   = () => { db.close(); reject(req.error); };
    });
    if (session && Date.now() - session.cachedAt <= SESSION_TTL_MS) {
      return session.userId;
    }
  } catch {
    // fall through
  }

  // Fallback: localStorage
  const lsSession = lsGet<OfflineSession>(LS_SESSION_KEY);
  if (lsSession && Date.now() - lsSession.cachedAt <= SESSION_TTL_MS) {
    return lsSession.userId;
  }

  return null;
}

export async function clearOfflineSession(): Promise<void> {
  lsDel(LS_SESSION_KEY);

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx    = db.transaction(SESSION_STORE, "readwrite");
      const store = tx.objectStore(SESSION_STORE);
      store.delete("current");
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror    = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // localStorage already cleared above
  }
}
