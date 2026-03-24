# Savaari B2B Cab Portal — CLAUDE.md

## Project Overview
B2B Cab booking portal built on Angular 21 (standalone components). Agents (travel agents) book cabs for their customers across 2,000+ Indian cities via Savaari's APIs. White-labeled as "B2B CAB".

## Tech Stack
- **Framework:** Angular 21 (standalone components, `ChangeDetectionStrategy.OnPush`)
- **Styling:** Tailwind CSS 4 with dark mode (`dark:` prefix)
- **Icons:** Lucide Angular — ALL icons must be registered in `src/app/app.config.ts`
- **UI Library:** PrimeNG (AutoComplete for address inputs)
- **Payments:** Razorpay SDK (wallet top-up)
- **Build:** `ng build --configuration=production`
- **Dev Server:** `ng serve` on port 4200 with `proxy.conf.json`
- **Deployment:** Vercel (vercel.json with API rewrites)
- **Repo:** https://github.com/pranavchhipa/Savaari-B2B-UI.git

## Architecture

### API Proxying
Three Savaari API domains, proxied to avoid CORS:

| Prefix | Dev (proxy.conf.json) | Prod (vercel.json) |
|--------|----------------------|-------------------|
| `/partner-api` | api.betasavaari.com | api.savaari.com |
| `/b2b-api` | api23.betasavaari.com | api23.savaari.com |
| `/wallet-api` | apiext.alphasavaari.com | apiext.savaari.com |
| `/analytics-api` | apiext.betasavaari.com | — |

### Environment Files
- `src/environments/environment.ts` — Dev: `useMockData: false`, hits beta servers via proxy
- `src/environments/environment.production.ts` — Prod: `useMockData: true`, ALL operations mocked, no real bookings possible

### Mock Data System
Every service checks `environment.useMockData` before API calls. When `true`:
- Login returns mock user (Bincy Joseph, agent 983680)
- Bookings return mock data
- Wallet top-up skips Razorpay, credits directly
- No real API calls are made

## Project Structure
```
src/app/
├── core/
│   ├── services/        # All API services (auth, booking-api, wallet, etc.)
│   ├── utils/           # gstin-decoder.ts, date-format.util.ts
│   ├── interceptors/    # auth.interceptor.ts
│   └── mocks/           # Mock data for services
├── components/
│   └── layout/          # header, footer, sidebar
├── features/
│   ├── auth/            # login, register
│   ├── landing/         # Public landing page
│   ├── dashboard/       # Agent dashboard
│   ├── booking/         # New booking (Step 1: details, Step 2: payment)
│   ├── bookings/        # Booking list (upcoming/completed/cancelled)
│   ├── select-car/      # Car selection with 20 studio photos
│   ├── wallet-dashboard/ # Wallet balance, top-up, transaction history
│   ├── account-settings/ # Profile, GST, PAN, logo upload
│   ├── markup-settings/ # Commission/markup configuration
│   └── reports/         # Booking reports
└── app.config.ts        # Icon registration, providers, routing
```

## Key Conventions

### Change Detection
- All components use `ChangeDetectionStrategy.OnPush`
- Must call `this.cdr.markForCheck()` after async operations
- `Math = Math;` exposed as class property when needed in templates

### Icons
- **CRITICAL:** Every Lucide icon used in templates MUST be registered in `app.config.ts`
- Icon names are kebab-case in templates: `<lucide-icon name="alert-triangle">`
- Import names are PascalCase in config: `AlertTriangle`

### Styling
- Tailwind CSS classes, no custom CSS unless absolutely necessary
- Dark mode via `dark:` prefix
- B2B CAB brand color: `bg-primary` (cyan/sky blue), skewed pill: `skew-x-[-10deg]`

### Security
- CSP headers in `index.html`
- XSS: Use DOMParser instead of innerHTML
- File uploads: PNG/JPEG/WebP/GIF only, max 1MB
- Console logs gated behind `!environment.production`
- No secrets in environment.ts (apiKey/appId empty, obtained from JWT)

## Payment System (3 Options)
1. **"Pay any amount now"** — Slider 25-100%, driver collects rest
2. **"Pay 25% now, rest auto-deducted"** — 25% now, 75% auto-deducted 48h before trip (backend cron needed)
3. **"Zero cash — full wallet"** — Full fare + 20% buffer, buffer refunded post-trip (recommended)

## GST Invoice Flow
- Booking page: "Need GST Invoice?" checkbox
- If GST in profile → auto-ticked with green "GST Applied" card
- If no GST → redirect to Account Settings to fill GST
- GSTIN auto-decode: state, PAN, entity type, name initial (all 38 states, 10 entity types)
- GST field locks after first save — "Contact support to change"

## Beta Test Credentials
- Email: `bincy.joseph@savaari.com`
- Password: `aMuWysE@YgAVa5aPagYR`
- VPN required for beta servers

## Known Backend Dependencies (Not Yet Implemented)
- Airport pricing not configured for test account (404)
- Analytics API not deployed on beta (400)
- Booking settlement API doesn't persist payment status
- Payment Option 2 auto-deduct needs backend cron job
- Payment Option 3 buffer refund needs backend trigger
- Booking cancellation endpoint unconfirmed
- Profile logo upload API not confirmed

## Dev Commands
```bash
ng serve                           # Dev server (port 4200, proxy to beta)
ng build --configuration=production # Production build
git push origin main               # Deploy to Vercel
```

## Preview Server
- Name: `savaari-b2b-dev`
- Port: 4200
- Config in `.claude/launch.json`

## Commit Style
```
feat: short description
fix: short description

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```
