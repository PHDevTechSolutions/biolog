// components/ProtectedPageWrapper.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ProtectedPageWrapper({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      console.log("[ProtectedPageWrapper] Starting session check...");
      
      // ── Offline fast-path ────────────────────────────────────────────────
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        console.log("[ProtectedPageWrapper] Browser offline, checking offline session...");
        try {
          const { getOfflineSession } = await import("@/lib/offline-auth");
          const userId = await getOfflineSession();
          console.log("[ProtectedPageWrapper] Offline session userId:", userId);
          if (userId) {
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error("[ProtectedPageWrapper] Error getting offline session:", err);
        }
        console.log("[ProtectedPageWrapper] No offline session, redirecting to login...");
        router.push("/Login");
        return;
      }

      // ── Online path ──────────────────────────────────────────────────────
      try {
        const deviceId = localStorage.getItem("deviceId") || "";
        console.log("[ProtectedPageWrapper] Online, checking session with deviceId:", deviceId);
        const res = await fetch("/api/check-session", {
          headers: { "x-device-id": deviceId },
        });

        console.log("[ProtectedPageWrapper] check-session response status:", res.status);
        
        if (res.status !== 200) {
          console.log("[ProtectedPageWrapper] Session invalid, redirecting to login...");
          try {
            const { clearOfflineSession } = await import("@/lib/offline-auth");
            await clearOfflineSession();
          } catch (err) {
            console.error("[ProtectedPageWrapper] Error clearing offline session:", err);
          }
          router.push("/Login");
          return;
        }

        console.log("[ProtectedPageWrapper] Session valid!");
        setLoading(false);
      } catch (err) {
        console.error("[ProtectedPageWrapper] Network error checking session:", err);
        try {
          const { getOfflineSession } = await import("@/lib/offline-auth");
          const userId = await getOfflineSession();
          console.log("[ProtectedPageWrapper] Fallback offline session userId:", userId);
          if (userId) {
            setLoading(false);
            return;
          }
        } catch (err2) {
          console.error("[ProtectedPageWrapper] Error getting fallback offline session:", err2);
        }
        console.log("[ProtectedPageWrapper] No fallback session, redirecting to login...");
        router.push("/Login");
      }
    };

    checkSession();
  }, [router]);

  useEffect(() => {
    // Apply theme — gracefully skip if offline
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    fetch("/api/admin/settings")
      .then(r => r.json())
      .then(data => {
        if (data.themeColor) {
          document.documentElement.setAttribute("data-theme", data.themeColor);
        }
      })
      .catch(() => { /* silent — offline */ });
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-[#CC1318] rounded-full animate-spin" />
          <p className="text-[12px] text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
