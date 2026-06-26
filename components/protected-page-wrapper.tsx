// components/ProtectedPageWrapper.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ProtectedPageWrapper({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      // ── Offline fast-path ────────────────────────────────────────────────
      // If the browser is offline, skip the network check and rely on the
      // locally-stored offline session instead.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        try {
          const { getOfflineSession } = await import("@/lib/offline-auth");
          const userId = await getOfflineSession();
          if (userId) {
            setLoading(false);
            return;
          }
        } catch {
          // IndexedDB unavailable — fall through to redirect
        }
        router.push("/Login");
        return;
      }

      // ── Online path ──────────────────────────────────────────────────────
      try {
        const deviceId = localStorage.getItem("deviceId") || "";
        const res = await fetch("/api/check-session", {
          headers: { "x-device-id": deviceId },
        });

        if (res.status !== 200) {
          // Clear stale offline session on explicit auth failure
          try {
            const { clearOfflineSession } = await import("@/lib/offline-auth");
            await clearOfflineSession();
          } catch { /* silent */ }
          router.push("/Login");
          return;
        }

        setLoading(false);
      } catch {
        // Network error — try offline session as fallback
        try {
          const { getOfflineSession } = await import("@/lib/offline-auth");
          const userId = await getOfflineSession();
          if (userId) {
            setLoading(false);
            return;
          }
        } catch { /* silent */ }
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
