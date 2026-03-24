# Savaari B2B Cab Portal — Agent Instructions

## Project
Angular 21 B2B cab booking portal (standalone components, OnPush change detection).
White-labeled as "B2B CAB". Travel agents book cabs across India via Savaari APIs.

## Tech Stack
- Angular 21, Tailwind CSS 4, PrimeNG, Lucide Angular icons, Razorpay
- Dev: localhost:4200 with proxy.conf.json → beta Savaari servers
- Prod: Vercel with vercel.json rewrites → production Savaari servers

## IMPORTANT: Before Using Any Lucide Icon
Check `src/app/app.config.ts` — icon MUST be registered there. If not, import and add it.
Template usage: `<lucide-icon name="kebab-case-name">`. Config import: `PascalCaseName`.

## IMPORTANT: Change Detection
All components use `ChangeDetectionStrategy.OnPush`. After any async operation (subscribe, setTimeout, API call), you MUST call `this.cdr.markForCheck()` or the UI won't update.

## IMPORTANT: Production Safety
`environment.production.ts` has `useMockData: true`. This means ALL API operations return mock data on Vercel. NEVER set this to false without explicit approval — it would create real bookings on production Savaari servers.

## Project Structure
```
src/app/core/services/   — API services (auth, booking-api, wallet, availability, etc.)
src/app/core/utils/      — gstin-decoder.ts, date-format.util.ts
src/app/features/        — Feature modules (booking, bookings, dashboard, wallet, etc.)
src/app/components/      — Shared layout components (header, footer)
src/environments/        — Dev and production environment configs
public/assets/cars/      — 20 studio car images
proxy.conf.json          — Dev API proxy config
vercel.json              — Vercel deployment + API rewrites
```

## Payment System
Three options with these EXACT names (used on booking page and bookings list):
1. "Pay any amount now" — Agent pays 25-100% via slider
2. "Pay 25% now, rest auto-deducted" — 25% now, 75% auto-deducted 48h before trip
3. "Zero cash — full wallet" — Full fare + 20% buffer (recommended)

## GST Flow
- GSTIN auto-decode from 15-char number: state, PAN, entity type, name initial
- GST field locks permanently after first save — "Contact support to change"
- Booking page: auto-ticked if GST exists, redirects to profile if not

## Dev Commands
```bash
ng serve                              # Dev server with proxy
ng build --configuration=production   # Production build (must be zero errors)
```

## Commit Convention
```
feat: description / fix: description
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```
