// lib/offline-auth.ts
// IndexedDB-based offline authentication cache.
// Stores hashed credentials + user objects so the user can sign in
// and load their profile while disconnected.

const DB_NAME      = "acculog-auth";
const DB_VERSION   = 1;
const AUTH_STORE   = "credentials";
const USER_STORE   = "users";

const CRED_TTL_MS  = 1000 * 60 * 60 * 24 * 30; // 30 days

export interface CachedCredential {
  key: string;            // primary key: lowercased email
  email: string;
  hash: string;           // sha-256(password|pin) salted with email
  isPinLogin: boolean;
  userId: string;
  cachedAt: number;
}

export interface CachedUser {
  userId: string;
  data: Record<string, unknown>;
  cachedAt: number;
}

// ── IndexedDB helpers ────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AUTH_STORE)) {
        db.createObjectStore(AUTH_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(USER_STORE)) {
        db.createObjectStore(USER_STORE, { keyPath: "userId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function sha256(input: string): Promise<string> {
  const enc  = new TextEncoder().encode(input);
  const buf  = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hashCredential(email: string, secret: string): Promise<string> {
  return sha256(`${email.toLowerCase()}::${secret}`);
}

// ── Credential cache ─────────────────────────────────────────────────────────

export async function cacheCredential(args: {
  email: string;
  secret: string;        // password or pin (raw)
  isPinLogin: boolean;
  userId: string;
}): Promise<void> {
  try {
    const db   = await openDB();
    const hash = await hashCredential(args.email, args.secret);
    const entry: CachedCredential = {
      key:        args.email.toLowerCase(),
      email:      args.email,
      hash,
      isPinLogin: args.isPinLogin,
      userId:     args.userId,
      cachedAt:   Date.now(),
    };
    await new Promise<void>((resolve, reject) => {
      const tx    = db.transaction(AUTH_STORE, "readwrite");
      const store = tx.objectStore(AUTH_STORE);
      const req   = store.put(entry);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    // Storage unavailable — fail silently, online login still works.
  }
}

/** Try to verify credentials from the offline cache. Returns userId on match. */
export async function verifyOfflineCredential(args: {
  email: string;
  secret: string;
  isPinLogin: boolean;
}): Promise<{ userId: string } | null> {
  try {
    const db = await openDB();
    const cached = await new Promise<CachedCredential | undefined>((resolve, reject) => {
      const tx    = db.transaction(AUTH_STORE, "readonly");
      const store = tx.objectStore(AUTH_STORE);
      const req   = store.get(args.email.toLowerCase());
      req.onsuccess = () => resolve(req.result as CachedCredential | undefined);
      req.onerror   = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });

    if (!cached) return null;
    if (cached.isPinLogin !== args.isPinLogin) return null;
    if (Date.now() - cached.cachedAt > CRED_TTL_MS) return null;

    const candidateHash = await hashCredential(args.email, args.secret);
    if (candidateHash !== cached.hash) return null;

    return { userId: cached.userId };
  } catch {
    return null;
  }
}

// ── User profile cache ───────────────────────────────────────────────────────

export async function cacheUser(userId: string, data: Record<string, unknown>): Promise<void> {
  try {
    const db = await openDB();
    const entry: CachedUser = { userId, data, cachedAt: Date.now() };
    await new Promise<void>((resolve, reject) => {
      const tx    = db.transaction(USER_STORE, "readwrite");
      const store = tx.objectStore(USER_STORE);
      const req   = store.put(entry);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    // ignore
  }
}

export async function getCachedUser(userId: string): Promise<Record<string, unknown> | null> {
  try {
    const db = await openDB();
    return await new Promise<Record<string, unknown> | null>((resolve, reject) => {
      const tx    = db.transaction(USER_STORE, "readonly");
      const store = tx.objectStore(USER_STORE);
      const req   = store.get(userId);
      req.onsuccess = () => {
        const result = req.result as CachedUser | undefined;
        resolve(result ? result.data : null);
      };
      req.onerror   = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}
