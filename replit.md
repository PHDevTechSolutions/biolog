# EcoERP

Next.js 16 (App Router) application migrated from Vercel to Replit.

## Stack
- Next.js 16 + React 19 (Turbopack dev)
- TypeScript, Tailwind CSS
- MongoDB, Postgres (Neon), Supabase, Firebase clients available
- Capacitor (mobile shell)

## Replit Setup
- Dev server: `npm run dev` → `next dev -p 5000 -H 0.0.0.0`
- Production: `npm run start` → `next start -p 5000 -H 0.0.0.0`
- Workflow `Start application` runs the dev server on port 5000 (webview).
- `next.config.ts` includes `allowedDevOrigins` for Replit preview domains and uses `images.remotePatterns` (replacing the deprecated `images.domains`).

## Environment Variables
This project may require secrets (DATABASE_URL, MongoDB URI, Supabase, Firebase, Cloudinary, Twilio, SMTP, reCAPTCHA, etc.). Add any needed values in Replit Secrets — request them as features are exercised.

## Deployment
Use Replit Deployments (autoscale) with build `npm run build` and run `npm run start`.

## Customization & PWA Features (Activity Planner)
- `lib/preferences.ts` — localStorage prefs (`biolog_prefs_v1`) with `usePreferences()` hook + `getPreferences()` sync getter. Marked `"use client"`.
- `lib/haptics.ts` — `haptic("light"|"medium"|"heavy"|"success"|"warning"|"error")`, gated by `prefs.haptics`. Plain util module (not `"use client"`).
- `lib/notification-sound.ts` — `playNotificationSound()` Web Audio chime, gated by `prefs.notificationSound`. Plain util module.
- `ProfileTab` includes **Customize** panel (toggle haptics, sound, vibration, push, swipe-refresh, weather, offline banner) and **Install App on Phone** section (iOS Safari guide modal + Android beforeinstallprompt).
- `public/manifest.json` exposes PWA shortcuts: Clock In (`?shortcut=attendance`) and Site Visit (`?shortcut=sitevisit`); `ActivityPage` auto-opens the matching dialog on mount.
- Meeting time displays use `hour12: true` everywhere (page.tsx + dashboard-dialog.tsx).

### Known dev-mode warning
Browser console may log "Invalid hook call" at HMR connect on `/activity-planner` under Next.js 16 + React 19 + Turbopack. This is a benign HMR-runtime warning — production build passes, all routes return 200, hooks follow the Rules of Hooks (verified by stubbing). It does not appear in `next start`.
