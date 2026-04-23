// hooks/useOfflineSync.ts
"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { toast } from "sonner";
import {
  getAllPendingLogs,
  removePendingLog,
  incrementRetry,
  getPendingCount,
} from "@/lib/offline-store";
import { uploadToCloudinary } from "@/lib/cloudinary";

const MAX_RETRIES = 5;

export function useOfflineSync(onSyncComplete?: () => void) {
  const syncingRef = useRef(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const onSyncCompleteRef = useRef(onSyncComplete);
  useEffect(() => {
    onSyncCompleteRef.current = onSyncComplete;
  }, [onSyncComplete]);

  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  // ── Refresh badge count ───────────────────────────────────────────────────

  const refreshCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch {
      // IndexedDB unavailable (SSR, private mode) — fail silently
    }
  }, []);

  // ── Core sync loop ────────────────────────────────────────────────────────

  const syncNow = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;

    syncingRef.current = true;
    setIsSyncing(true);

    let logs;
    try {
      logs = await getAllPendingLogs();
    } catch {
      // Always release the lock — even if reading the queue fails
      syncingRef.current = false;
      setIsSyncing(false);
      return;
    }

    if (logs.length === 0) {
      syncingRef.current = false;
      setIsSyncing(false);
      return;
    }

    let successCount = 0;
    let failCount    = 0;

    for (const log of logs) {
      // Permanently discard logs that have failed too many times
      if (log.retries >= MAX_RETRIES) {
        await removePendingLog(log.id).catch(() => {});
        continue;
      }

      try {
        const payload = { ...log.payload } as any;

        // ① Upload base64 photo to Cloudinary if not yet uploaded
        if (payload.PhotoURL && typeof payload.PhotoURL === "string" && payload.PhotoURL.startsWith("data:image/")) {
          try {
            const uploadedUrl = await uploadToCloudinary(payload.PhotoURL);
            payload.PhotoURL = uploadedUrl;
          } catch {
            // Cloudinary upload failed — increment retry and skip
            await incrementRetry(log.id).catch(() => {});
            failCount++;
            continue;
          }
        }

        // ② Submit to the API
        const res = await fetch("/api/ModuleSales/Activity/AddLog", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        });

        if (res.ok || res.status === 409) {
          // 409 = duplicate already on server — safe to remove
          await removePendingLog(log.id).catch(() => {});
          successCount++;
        } else {
          await incrementRetry(log.id).catch(() => {});
          failCount++;
        }
      } catch {
        // Network error mid-loop — increment retry, keep going
        await incrementRetry(log.id).catch(() => {});
        failCount++;
      }
    }

    // Always release the lock
    syncingRef.current = false;
    setIsSyncing(false);
    await refreshCount();

    if (successCount > 0) {
      toast.success(
        `${successCount} offline log${successCount > 1 ? "s" : ""} synced!`
      );
      onSyncCompleteRef.current?.();
    }

    if (failCount > 0) {
      toast.error(
        `${failCount} log${failCount > 1 ? "s" : ""} failed to sync. Will retry when online.`
      );
    }
  }, [refreshCount]);

  // ── Event listeners ───────────────────────────────────────────────────────

  useEffect(() => {
    refreshCount();

    const handleOnline  = () => { setIsOnline(true);  syncNow(); };
    const handleOffline = () => setIsOnline(false);
    const handleSWSync  = () => syncNow();

    window.addEventListener("online",       handleOnline);
    window.addEventListener("offline",      handleOffline);
    window.addEventListener("acculog:sync", handleSWSync);

    // Attempt sync on mount if already online
    if (navigator.onLine) syncNow();

    return () => {
      window.removeEventListener("online",       handleOnline);
      window.removeEventListener("offline",      handleOffline);
      window.removeEventListener("acculog:sync", handleSWSync);
    };
  }, [syncNow, refreshCount]);

  return { pendingCount, isOnline, isSyncing, syncNow };
}
