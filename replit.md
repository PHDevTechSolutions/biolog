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
