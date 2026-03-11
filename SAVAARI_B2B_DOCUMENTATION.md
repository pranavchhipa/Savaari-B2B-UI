# Savaari B2B Portal — Technical & Product Documentation

**Document Version:** 1.0
**Date:** March 2026
**Prepared by:** Development Team
**Status:** Current Implementation

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [System Architecture](#3-system-architecture)
4. [Application Screens & Features](#4-application-screens--features)
   - 4.1 Login
   - 4.2 Dashboard (Booking Search)
   - 4.3 Select Car
   - 4.4 Booking Form
   - 4.5 Bookings History
   - 4.6 Reports
   - 4.7 Markup Settings
   - 4.8 Wallet Dashboard
   - 4.9 Account Settings
   - 4.10 Header & Navigation
5. [New Implementations (vs. Old b2bcab.in Website)](#5-new-implementations-vs-old-b2bcabin-website)
6. [API Integration Reference](#6-api-integration-reference)
7. [Authentication & Security](#7-authentication--security)
8. [Payment System — Wallet Architecture](#8-payment-system--wallet-architecture)
9. [Services Reference](#9-services-reference)
10. [Data Models](#10-data-models)
11. [Known Backend Issues & Blockers](#11-known-backend-issues--blockers)
12. [End-to-End Verification Status (March 2026)](#12-end-to-end-verification-status-march-2026)
13. [Next Steps & Roadmap](#13-next-steps--roadmap)

---

## 1. Project Overview

The **Savaari B2B Portal** is a white-label travel agent management platform that enables registered travel partners and agents to:

- Search cab availability across 3,500+ Indian cities
- Create outstation, local, round trip, and airport transfer bookings
- Manage bookings with real-time status tracking
- Fund and use an internal wallet system to make pre-payments
- View and download trip-wise financial reports
- Configure per-service markup settings to set selling prices
- Manage company profile and account credentials
- View commission structures from Savaari

### Business Context

Travel agents (B2B partners) book cabs on behalf of their customers through Savaari's backend fleet. The agent makes partial or full payment from their internal wallet at the time of booking. The remaining fare is either collected from the passenger by the driver or auto-deducted from the wallet 48 hours before the trip.

The platform replaces and upgrades the older [b2bcab.in](https://b2bcab.in) Angular 4 application with a modern, maintainable Angular 21 codebase.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Framework | Angular 21 (standalone components, no NgModules) |
| Language | TypeScript |
| UI Components | PrimeNG (AutoComplete, DatePicker, Select dropdowns) |
| Icons | Lucide Angular (consistent icon library) |
| Styling | Tailwind CSS (utility-first, dark mode support) |
| Change Detection | OnPush throughout for performance |
| HTTP | Angular HttpClient with two-proxy setup |
| State Management | Service-level BehaviorSubjects (no external state library) |
| Build Tool | Angular CLI (esbuild) |
| Dev Server | `ng serve` with `proxy.conf.json` |

---

## 3. System Architecture

### 3.1 Two-API Architecture

The Savaari backend exposes two separate API domains. Both are proxied locally during development to avoid CORS issues.

```
Browser (Angular App)
        │
        ├── /partner-api/* ──proxy──▶ https://api.savaari.com/partner_api/public/
        │                               Used for: cities, availability, booking creation
        │
        └── /b2b-api/*    ──proxy──▶ https://api23.savaari.com/
                                        Used for: login, bookings list, reports, commission, wallet
```

**Development Proxy** (`proxy.conf.json`):
```json
{
  "/partner-api": { "target": "https://api.savaari.com/partner_api/public", "changeOrigin": true },
  "/b2b-api":     { "target": "https://api23.savaari.com", "changeOrigin": true }
}
```

**Production** (`environment.production.ts`): Same mock flag enabled for demo builds; both API base URLs configured to point to production endpoints.

### 3.2 Authentication Flow

Two tokens are required for full functionality:

```
1. Agent logs in
   POST /b2b-api/user/login
   ──▶ B2B Token (RSA RS256 JWT)     → stored as 'loginUserToken' in localStorage
   ──▶ User profile JSON              → stored as 'loggedUserDetail' in localStorage

2. Partner token auto-fetched (no auth required)
   GET /partner-api/auth/webtoken
   ──▶ Partner HMAC HS512 Token      → stored as 'SavaariToken' in localStorage
```

Both tokens are passed as `?token=<jwt>` query parameters on subsequent API calls, NOT as Authorization headers.

### 3.3 Application Routes

| Route | Component | Auth Required |
|---|---|---|
| `/login` | LoginComponent | No |
| `/register` | RegisterComponent | No |
| `/` | DashboardComponent | Yes |
| `/select-car` | SelectCarComponent | Yes |
| `/booking` | BookingComponent | Yes |
| `/bookings` | BookingsComponent | Yes |
| `/reports` | ReportsComponent | Yes |
| `/markup-settings` | MarkupSettingsComponent | Yes |
| `/wallet` | WalletDashboardComponent | Yes |
| `/account-settings` | AccountSettingsComponent | Yes |

An `AuthGuard` on all protected routes redirects to `/login` if no valid tokens are found in localStorage.

### 3.4 Booking Flow (End-to-End)

```
Dashboard
  ├─ Select trip type (One Way / Round Trip / Local / Airport)
  ├─ Select source city (PrimeNG AutoComplete, 3,582 cities)
  ├─ Select destination city (for outstation)
  ├─ Pick date, time (PrimeNG DatePicker)
  └─ Click "Explore Cabs"
        │
        ▼
  GET /availabilities (Partner API)
        │
        ▼
  Select Car page
  ├─ Grid of available cabs with real prices
  ├─ Local car images (mapped from assets/images/cars/)
  └─ Click "Select"
        │
        ▼
  Booking Form
  ├─ Guest info (name, phone, email)
  ├─ Pickup/drop address (PrimeNG AutoComplete from localities API)
  ├─ Country code dropdown (225 countries)
  ├─ Coupon code validation
  ├─ Value Added Services (Luggage Carrier, Preferred Driver)
  ├─ Payment option selection (3 options)
  └─ "Book Now" → POST /booking (Partner API)
        │
        ▼
  Booking Confirmation screen
  └─ Booking ID displayed
```

---

## 4. Application Screens & Features

### 4.1 Login

**Route:** `/login`

**What it does:**
- Accepts agent email and password
- Calls `POST /user/login` on the B2B API
- On success, fetches the Partner API token automatically
- Stores both tokens and user profile in localStorage
- Redirects to Dashboard

**Key fields:**
- Email (required)
- Password (required, toggle visibility)
- "Remember me" checkbox (UI only)
- Link to Registration page

**Error handling:** Invalid credentials → inline error message from API response.

---

### 4.2 Dashboard (Booking Search)

**Route:** `/`

**What it does:**
The primary booking initiation screen. Agents configure trip parameters and search for available cabs.

**Four trip type tabs:**

| Tab | API Trip Type | API Sub-Type |
|---|---|---|
| One Way | outstation | oneWay |
| Round Trip | outstation | roundTrip |
| Local | local | 880 (8hr), 1200 (12hr) |
| Airport | airport | drop / pickup |

**Form fields:**
- **From City** — PrimeNG AutoComplete, fetches from `/source-cities` (3,582 cities)
- **To City** — PrimeNG AutoComplete, fetches from `/destination-cities` based on selected source
- **Pickup Date** — PrimeNG DatePicker, minimum: today
- **Return Date** — (Round Trip only) auto-adjusted to be at least 1 day after pickup
- **Pickup Time** — PrimeNG TimePicker, defaults to 6:00 PM
- **Trip Type** — (Airport only) Drop to Airport / Pickup from Airport
- **Pickup Address** — (Airport only) Free text

**Smart behaviors:**
- Changing pickup date auto-pushes return date forward if needed
- Airport subtab shows city as the hub (no destination needed)
- Local tab hides destination field entirely
- Round trip shows drop time: "09:45 PM (No extra cost — night charges apply after)"

**Availability check:** On "Explore Cabs" click, calls the availability API and navigates to `/select-car` with results.

---

### 4.3 Select Car

**Route:** `/select-car`

**What it does:**
Displays all available cab options for the searched itinerary with real-time pricing from the Savaari Partner API.

**Display per car:**
- Car name and type
- **Local car image** (mapped from `assets/images/cars/` — etios, ertiga, wagonr, innova, crysta)
- Capacity (passengers)
- Luggage capacity
- Fare (with GST)
- Regular fare (non-discounted base fare — used for pre-payment calculations)
- Features (AC, GPS, etc.)
- "Select" button

**Car image mapping logic:**

The app maps car type IDs and name keywords to 5 local asset images instead of using CDN URLs from the API (which can be slow/broken):

| Car Type | Image Used |
|---|---|
| Toyota Etios, Dzire, Sedan | etios.png |
| Ertiga, 6+1 SUVs, Kia, Creta | ertiga.png |
| Wagon R, Hatchback | wagonr.png |
| Innova, Tempo Traveller, Minibus | innova.png |
| Innova Crysta | crysta.png |

**Sort order:** As returned by the Savaari API (no client-side resorting applied).

---

### 4.4 Booking Form

**Route:** `/booking`

**What it does:**
The main booking creation form. Collects passenger details and processes payment via the wallet.

**Step 1 — Passenger Details:**
- Guest Name (required)
- Guest Email (optional)
- Agent Email (read-only, auto-filled from logged-in agent's account)
- Phone Number with country code dropdown (225 countries, India shown first)
- Pickup Address — PrimeNG AutoComplete from `/localities` API
- Drop Address — PrimeNG AutoComplete from `/localities` API (only for cities that appear in source list)
- Landmark (optional free text)

**Step 2 — Payment Options:**

Three B2B payment models:

| Option | Description | Pay Now | Auto-Deducted 48h Before |
|---|---|---|---|
| **Option 1** — Flexible | Agent pays chosen % (slider: 25–100%), driver collects rest from passenger | Slider % of fare | None |
| **Option 2** — Full Agent | Agent covers 100% from wallet | 25% now | 75% at 48h mark |
| **Option 3** — Full Agent + Buffer | Same as Option 2 plus 20% buffer for extras | 25% now | 95% at 48h mark |

> **Urgent Booking Rule (< 48 hours):** Options 2 and 3 require 100% payment upfront if pickup is within 48 hours.

> **6-Hour Minimum Rule:** Bookings must be placed at least 6 hours before pickup time. A validation error is shown otherwise.

**Coupon Code:**
- Input field with "Apply" button
- Calls `GET /coupon-code` on Partner API
- Shows discount amount on success
- Shows specific error from API on failure (e.g., "Coupon expired", "Minimum amount not met")

**Value Added Services (VAS) modal:**
- Luggage Carrier toggle
- Preferred Driver toggle
- These are UI selections only — not yet wired to booking API payload

**Booking Confirmation:**
After successful `POST /booking`, shows a confirmation screen with the Booking ID.

**Pre-payment validation:**
The API validates `prePayment >= 25% of internal totalFare`. Our app uses `regularPrice` (non-discounted fare from availability API) as the base to ensure this minimum is always satisfied, even when a promotional price is displayed.

---

### 4.5 Bookings History

**Route:** `/bookings`

**What it does:**
Shows all past and current bookings for the logged-in agent, fetched from the B2B API.

**Three tabs:**
- Upcoming (confirmed, assigned, pending)
- Cancelled
- Completed

**Per booking card displays:**
- Booking ID
- Reservation ID
- Source city
- Trip type and usage name
- Pickup date and time
- Status badge (color-coded)
- Fare
- Customer name
- Driver name, mobile, car number (when assigned)

**Search:** Real-time filter by Booking ID or city name.

**Actions:**
- Cancel booking (upcoming only) — calls cancel API
- Refresh button to reload from API

**Status mapping from API:**
```
API "CANCEL" → "cancelled"
API "CONFIRMED" → "confirmed"
API "COMPLETED" → "completed"
```

---

### 4.6 Reports

**Route:** `/reports`

**What it does:**
Date-range based trip report with summary statistics and CSV export.

**Inputs:**
- Start date (defaults to 1st of current month)
- End date (defaults to today)
- "View Report" button

**Report table columns:**
- Trip ID
- Date
- Passenger name
- Pickup city → Drop city
- Trip type
- Status
- Fare (₹)

**Summary cards:**
- Total Revenue (completed trips only)
- Completed trips count
- Cancelled trips count

**CSV Export:** Downloads a formatted CSV file named `trip-report-{start}-to-{end}.csv`.

**API behavior:** Returns HTTP 204 (No Content) when no trips exist in the date range — handled gracefully with "No reports found" empty state.

---

### 4.7 Markup Settings

**Route:** `/markup-settings`

**What it does:**
Allows agents to set their selling markup above Savaari's base rates. Settings are stored client-side (localStorage) and applied when displaying prices to customers.

**Three sections (tab-based navigation):**

**1. Markup Configuration**

Per-service type markup:

| Service | Markup Type Options |
|---|---|
| Airport Transfers | Percentage or Fixed Amount |
| Local Rentals | Percentage or Fixed Amount |
| Outstation | Percentage or Fixed Amount |
| One Way | Percentage or Fixed Amount |

- Toggle between % and fixed ₹ mode per service
- Save persists to `localStorage` via MarkupService
- Success confirmation banner appears for 3 seconds after save
- Reset to Default button

**2. Commission (from Savaari)**

Read-only view of the agent's commission structure from the Savaari B2B API:

- Commission % per trip type
- Commission fixed amount per trip type
- Rate bump-up % (how much Savaari prices up for this agent)
- Rate bump-up fixed amount
- Which trip types are enabled/disabled for this agent

Fetched live from `GET /user/get-commission`.

**3. Preferences** (UI placeholder, future use)

---

### 4.8 Wallet Dashboard

**Route:** `/wallet`

**What it does:**
The internal agent wallet for pre-paying Savaari bookings. All booking payments are deducted from this wallet.

**Display:**
- Current wallet balance (₹)
- Wallet status (Active / Frozen)
- Transaction history table (date, type, description, amount, balance after)

**Top-Up flow:**
1. Click "Add Funds" → modal with amount input (minimum ₹100)
2. Currently: simulates Razorpay payment flow (1.5s delay, mock credit)
3. When live: will open Razorpay SDK with `orderId` from `POST /wallet/topup/initiate`

**Transaction types:**
- TOPUP (green) — wallet top-up
- BOOKING_PAYMENT (red) — booking pre-payment deducted
- REFUND (blue) — refund from cancelled booking

**Status:** Wallet APIs are under active development. Current behavior gracefully falls back to ₹0 balance with "Active" status when APIs return 404.

---

### 4.9 Account Settings

**Route:** `/account-settings`

**What it does:**
View and update agent profile information and change password.

**Personal Info section:**
- Title (Mr/Mrs/Ms)
- First Name, Last Name
- Company Name
- Email (read-only)
- Company Address
- City
- Mobile, Phone
- PAN Number
- Website
- Other emails, other phone
- Company Logo upload (preview shown inline)

All fields are pre-populated from the login response stored in localStorage.

**Save Profile** — `POST /user` to B2B API to persist changes.

**Change Password section:**
- Current password
- New password (min 8 characters)
- Confirm new password
- `POST /user/change-password` to B2B API

> **Note:** The `POST /user` endpoint currently returns HTTP 400 "Please enter your name." regardless of input — this is a **backend bug** (see Section 11).

---

### 4.10 Header & Navigation

- Agent name and company name displayed in top right
- Wallet balance shown live (reactive, updated on every booking)
- "Top Up Now" link to Wallet Dashboard
- Dark mode toggle (persists preference)
- Logout button (clears all tokens and localStorage)
- Navigation links: Dashboard, Bookings, Reports, Markup Settings, Wallet, Account, Help

---

## 5. New Implementations (vs. Old b2bcab.in Website)

The following features are **new to this version** and were not present in the original Angular 4 b2bcab.in website:

### 5.1 Modern Tech Stack
- Angular 21 (was Angular 4)
- Standalone components (no NgModules)
- Full OnPush change detection for performance
- Tailwind CSS (was Bootstrap)
- PrimeNG v17+ components
- Lucide Icons (consistent icon system)

### 5.2 Dark Mode
Complete dark mode support across all screens, toggleable from the header. Preference persisted in localStorage.

### 5.3 Locality-Based Address Autocomplete
- Pickup and drop addresses now use PrimeNG AutoComplete
- Fetches real locality data from `GET /localities` API (14,000+ localities for Bangalore)
- Cached per city — subsequent lookups are instant
- Falls back gracefully to free-text input for destination-only cities (small towns not in source list)
- Country code dropdown with 225 ISD codes

### 5.4 Three-Tier Payment Options
Old website had a simple pre-payment model. New portal has three distinct options:
- **Option 1:** Flexible slider (25–100%)
- **Option 2:** 25% now / 75% auto-deducted 48h before
- **Option 3:** 25% now / 95% auto-deducted 48h before (with 20% buffer for extras)

Includes urgent booking detection (< 48h window) with automatic escalation to 100% upfront.

### 5.5 Coupon Code Validation
Real-time coupon validation against the Savaari API with specific error messages (expired, minimum amount not met, trip type mismatch, etc.).

### 5.6 Value Added Services (VAS) Modal
UI for selecting:
- Luggage Carrier add-on
- Preferred Driver (language preference)

### 5.7 Wallet System (Full Architecture)
Complete wallet service with 7 API endpoints mapped:
- Create wallet
- Check balance
- View transaction history
- Initiate top-up (Razorpay)
- Verify top-up payment
- Pay for booking
- Refund on cancellation

Integrated with BehaviorSubject observables for real-time balance display across all screens.

### 5.8 Markup Settings
Agents can now independently set markup amounts per service type (airport, local, outstation, one way) in both percentage and fixed-amount modes. Settings persist in localStorage.

### 5.9 Commission Visibility
Agents can now see their Savaari commission structure directly in the portal (previously not visible), including:
- Commission percentages and fixed amounts per trip type
- Rate bump-up details
- Which trip types are enabled

### 5.10 Reports with CSV Export
Date-range reports with summary statistics and one-click CSV download.

### 5.11 Local Car Images
Consistent branded car images using local assets instead of external CDN URLs. Five car category images mapped by car type ID and name keywords.

### 5.12 Round Trip Drop Time
Round trip bookings now clearly display the standard drop time (09:45 PM) with the tooltip "Keep the cab till 9:45 PM at no extra cost. Night charges will apply post that."

### 5.13 Standardized Loading Spinners
All loading states use `<lucide-icon name="loader-2" class="animate-spin">` — consistent appearance across the entire application.

---

## 6. API Integration Reference

### 6.1 Partner API (api.savaari.com/partner_api/public)

All endpoints use `GET` with query parameters. Token passed as `?token=<partnerJWT>`.

#### GET /auth/webtoken
Fetch HMAC HS512 partner token (no auth required).

**Response:**
```json
{
  "data": {
    "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzUxMiJ9..."
  }
}
```

#### GET /source-cities
Fetch all source cities for a given trip type.

**Query params:** `token`, `tripType`, `subTripType`
**Response:** Array of `{ id, name }` objects (3,582 cities verified)

#### GET /destination-cities
Fetch available destination cities from a given source.

**Query params:** `token`, `tripType`, `subTripType`, `sourceCity`
**Response:** Array of `{ id, name }` objects

#### GET /availabilities
Check cab availability and pricing.

**Query params:** `token`, `sourceCity`, `tripType`, `subTripType`, `pickupDateTime`, `destinationCity` (optional), `duration`
**Response:** Array of car availability objects with:
- `carName`, `carType` (type ID), `carImage`
- `totalFare` (final price shown to customer)
- `regularFare` (non-discounted base fare — used for pre-payment calculation)
- `capacity`, `luggageCapacity`, `carFeatures`

#### POST /booking
Create a booking (form-encoded body, token as query param).

**Critical fields:**
```
sourceCity, tripType, subTripType, pickupDateTime, duration
pickupAddress, dropAddress
customerName, customerMobile, countryCode (must be '91', NOT '+91')
carType, prePayment
agentId (base64-encoded)
```

**Response (201 Created):**
```json
{
  "status": "success",
  "data": [{ "booking_id": "10243232", "reservation_id": "..." }]
}
```

> **Important:** Error responses also return HTTP 201. Check `data[0].status_code` for errors.

**Known error codes from API:**
- `402` — "Incorrect mobile number" (caused by `+91` prefix instead of `91`)
- `402` — "Minimum pre-payment amount required" (prePayment below 25% threshold)

#### POST /booking/update_invoice_payer_info
Update invoice payer details after booking creation.

**Body:** `booking_id`, `reservation_id`, `invoice_payer_name`, `invoice_payer_email`, `invoice_payer_phone`

#### GET /localities
Fetch locality/area suggestions for a city.

**Query params:** `token`, `cityId`
**Response:** Array of locality objects with `{ id, name }` (14,289 localities for Bangalore)

#### GET /coupon-code
Validate a coupon code.

**Query params:** `token`, `couponCode`, `sourceCity`, `tripType`, `subTripType`, `bookingAmount`, `carType`, `pickupDateTime`
**Success (200):** `{ couponCode, discountAmount, message }`
**Failure (400):** `{ message: "Coupon expired" }` or specific error

---

### 6.2 B2B API (api23.savaari.com)

All endpoints use either GET (reports/data) or POST (mutations/login). Token passed as query param or in body.

#### POST /user/login
Agent authentication.

**Body (JSON):**
```json
{ "userEmail": "agent@example.com", "password": "...", "isAgent": true }
```
**Response:**
```json
{
  "statusCode": 200,
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...",
  "user": { "user_id": 983680, "email": "...", "firstname": "...", ... }
}
```

#### GET /booking-details
Fetch all bookings for the agent.

**Query params:** `token`, `userEmail`
**Response:** Wrapped array: `{ data: { booking_details: [...] } }`

Key response fields per booking:
- `booking_id`, `reservation_id`
- `booking_status` — "CANCEL", "CONFIRMED", "COMPLETED"
- `start_date_time` — "YYYY-MM-DD HH:MM:SS"
- `pick_city`, `pick_loc`
- `trip_type`, `usagename`
- `gross_amount`
- `customer_name`
- `driver_details` — object or empty array `[]`

#### GET /booking-details-report
Fetch bookings within a date range.

**Query params:** `token`, `userEmail`, `fromDate` (Unix timestamp), `toDate` (Unix timestamp)
**Returns 204** when no data in range — handled as empty state (not an error).

#### GET /user/get-commission
Fetch agent commission structure.

**Query params:** `token`, `userEmail`
**Response:** Wrapped object:
```json
{
  "statusCode": 200,
  "data": {
    "outstation_commision": "8",
    "outstation_commission_amount": "0",
    "outstation_rate_bump_up": "-5",
    "local_commision": "10",
    "airport_commision": "8",
    "enable_outstation": "1",
    "enable_local": "1",
    "enable_airport": "0"
  }
}
```
> Note: API uses typo "commision" (one `s`) — this is handled in code.

#### GET /country-code
Fetch all ISD country codes.

**Query params:** `token`, `userEmail`
**Response:** Keyed object of 225 countries:
```json
{ "IN": { "name": "India", "dial_code": "91", "code": "IN" }, ... }
```

#### POST /user
Update agent profile.

**Body:** `userEmail`, `token`, `firstname`, `lastname`, `companyname`, `billingaddress`, `city`, `phone`, `mobileno`, `pan_number`, etc.
**⚠️ BLOCKED:** Currently returns HTTP 400 "Please enter your name." regardless of input. Backend bug.

#### POST /user/change-password
Change agent password.

**Body:** `userEmail`, `token`, `currentPassword`, `newPassword`

#### Wallet Endpoints (under development)

All `POST` to `/b2b-api/wallet/*`:
- `/wallet/create` — Initialize wallet
- `/wallet/balance` — Get balance + status
- `/wallet/history` — Get transaction ledger
- `/wallet/topup/initiate` — Create Razorpay order
- `/wallet/topup/verify` — Verify Razorpay payment
- `/wallet/pay-booking` — Deduct for booking
- `/wallet/refund` — Refund on cancellation

**Status:** All return 404 (not yet deployed). App falls back gracefully to ₹0 balance.

---

## 7. Authentication & Security

### 7.1 Token Lifecycle

| Token | Type | Storage Key | Used For |
|---|---|---|---|
| B2B Token | RSA RS256 JWT | `loginUserToken` | B2B API calls (booking-details, reports, commission) |
| Partner Token | HMAC HS512 JWT | `SavaariToken` | Partner API calls (cities, availability, booking creation) |

Both tokens are stored in `localStorage` and restored on page refresh.

### 7.2 Auth Guard

An `AuthGuard` (route guard) checks for both tokens before activating protected routes. If either token is missing, redirects to `/login`.

### 7.3 Interceptor

An `AuthInterceptor` attaches the appropriate token as a `?token=` query parameter to outgoing HTTP requests, based on whether the request targets the partner API or B2B API URL prefix.

### 7.4 Logout

Clears all localStorage keys: `loginUserToken`, `SavaariToken`, `loggedUserDetail`, `commission`, `commission_amt`.

---

## 8. Payment System — Wallet Architecture

### 8.1 Business Flow

```
Agent funds wallet via Razorpay
    ↓
Agent creates booking → selects payment option
    ↓
pre-payment deducted from wallet immediately (via POST /wallet/pay-booking)
    ↓
If Option 2 or 3: remaining balance auto-deducted 48h before trip (backend-scheduled)
    ↓
Trip completes → driver collects any driver-collected portion from passenger
    ↓
If cancelled: refund credited back (via POST /wallet/refund)
```

### 8.2 Three Payment Options

**Option 1 — Flexible Agent Payment:**
- Agent sets slider from 25% to 100% of total fare
- Remainder collected by driver from passenger at trip end
- No 48-hour auto-deduction
- Best for agents who want customer to pay most of the fare

**Option 2 — Full Agent Coverage (25/75):**
- Agent pays 25% now from wallet
- 75% auto-deducted 48 hours before trip
- Full 100% deducted immediately if booking is within 48 hours
- Agent bears full responsibility for fare

**Option 3 — Full Agent + 20% Buffer:**
- Same as Option 2 but with an additional 20% buffer
- Total agent commitment = 120% of fare
- Buffer covers driver extras, night charges, tolls
- Excess refunded after trip completion (future feature)

### 8.3 Pre-Payment Calculation Logic

```typescript
prePayBase = selectedCar.regularPrice || selectedCar.price;
// Uses regularPrice (non-discounted) to ensure API minimum (25% of internal fare) is met

Option 1: prePayment = prePayBase × (sliderPercent / 100)
Option 2: prePayment = urgent ? price : prePayBase × 0.25
Option 3: prePayment = urgent ? prePayBase × 1.20 : prePayBase × 0.25
```

### 8.4 Razorpay Integration (Planned)

```javascript
// Wallet top-up flow (ready to enable when APIs go live)
const rzp = new Razorpay({
  key: orderDetails.razorpayKeyId,
  amount: orderDetails.amount,    // in paise
  currency: 'INR',
  order_id: orderDetails.orderId,
  handler: (response) => {
    walletService.verifyTopUp(orderId, paymentId, signature, amount)
  }
});
rzp.open();
```

---

## 9. Services Reference

| Service | File | Purpose |
|---|---|---|
| `ApiService` | `core/services/api.service.ts` | Base HTTP service (partnerGet, b2bGet, b2bPost, partnerPostForm) |
| `AuthService` | `core/services/auth.service.ts` | Login, token management, user profile |
| `CityService` | `core/services/city.service.ts` | Source/destination city fetch with caching |
| `AvailabilityService` | `core/services/availability.service.ts` | Cab availability check |
| `BookingApiService` | `core/services/booking-api.service.ts` | Create booking, cancel booking, get all bookings |
| `BookingStateService` | `core/services/booking-state.service.ts` | Cross-component state (itinerary, selected car) |
| `BookingRegistryService` | `core/services/booking-registry.service.ts` | Tracks booking IDs created in this session |
| `CommissionService` | `core/services/commission.service.ts` | Fetch/cache commission data from B2B API |
| `CouponService` | `core/services/coupon.service.ts` | Validate coupon codes |
| `CountryCodeService` | `core/services/country-code.service.ts` | Fetch 225 ISD codes, sorted India-first |
| `LocalityService` | `core/services/locality.service.ts` | Fetch localities per city, cached, client-side search |
| `MarkupService` | `core/services/markup.service.ts` | Read/write markup settings to localStorage |
| `ReportApiService` | `core/services/report-api.service.ts` | Fetch date-range booking reports |
| `TripTypeService` | `core/services/trip-type.service.ts` | Map UI tab names to API tripType/subTripType |
| `WalletService` | `core/services/wallet.service.ts` | Full wallet management (7 endpoints + BehaviorSubjects) |

---

## 10. Data Models

### Key Interfaces (TypeScript)

**UserProfile** — from login response:
```typescript
interface UserProfile {
  user_id: number;
  email: string;
  firstname: string;
  lastname: string;
  phone: string;
  mobileno: string;
  companyname: string;
  is_agent: number;
  user_type: number;
  user_active: number;
  billingaddress: string;
  city: string;
  title: string;
}
```

**Itinerary** — booking search state:
```typescript
interface Itinerary {
  fromCity: string;
  fromCityId: number;
  toCity: string;
  toCityId: number;
  toCitySourceId?: number;    // Only set when destination is also a source city
  pickupDate: Date;
  pickupTime: string;
  tripType: string;
  subTripType: string;
  returnDate?: Date;
  duration?: number;
  airportSubType?: string;
  pickupAddress?: string;
  dropAirport?: string;
}
```

**SelectedCar** — selected from availability:
```typescript
interface SelectedCar {
  carName: string;
  carTypeId: number;
  price: number;           // Discounted/final price shown to customer
  regularPrice: number;    // Non-discounted base price (pre-payment basis)
  originalPrice: number;
  capacity: number;
  features: string[];
}
```

**CommissionData** — from GET /user/get-commission:
```typescript
interface CommissionData {
  outstation_commision: string;    // Note: API typo (one 's')
  outstation_commission_amount: string;
  outstation_rate_bump_up: string;
  local_commision: string;
  airport_commision: string;
  enable_outstation: string;       // '1' or '0'
  enable_local: string;
  enable_airport: string;
  [key: string]: string;
}
```

---

## 11. Known Backend Issues & Blockers

The following issues have been confirmed through live API testing and need backend team attention:

### 11.1 CRITICAL: POST /user — Profile Update Broken

**Endpoint:** `POST api23.savaari.com/user`
**Issue:** Returns HTTP 400 `{"statusCode": 400, "message": "Please enter your name."}` for **all** payloads, including payloads that include `firstname`, `name`, and `fullName`.
**Tested payloads:** JSON body, form-encoded body, all field name variations.
**Impact:** Account Settings "Save Profile" never succeeds.
**Action required:** Fix server-side field validation — accept `firstname` as the name field.

### 11.2 CRITICAL: Wallet APIs Not Deployed

**Endpoints:** All `/wallet/*` endpoints on `api23.savaari.com`
**Issue:** All return HTTP 404 (not found / not yet deployed).
**Impact:** Wallet balance always shows ₹0. Top-up flow cannot complete in production.
**Action required:** Deploy the 7 wallet API endpoints per the TRD specification.

### 11.3 IMPORTANT: Razorpay Integration Pending

**Issue:** Razorpay SDK integration is ready on frontend (code is written and commented out). Requires live Razorpay credentials and working `/wallet/topup/initiate` + `/wallet/topup/verify` endpoints.
**Action required:** Provide Razorpay API key and deploy wallet top-up endpoints.

### 11.4 Airport Pricing Not Configured for Test Account

**Account:** bincy.joseph@savaari.com
**Issue:** `GET /availabilities` for Airport trip type returns 0 results — not a code bug. Commission API shows `enable_airport: "0"` for this account.
**Action required:** Enable airport pricing on backend for the test account, or provide a test account that has airport access.

### 11.5 Savaari Webhook Callbacks — Not Yet Configured

**Issue:** Savaari pushes driver assignment, cancellation, and trip completion events to a callback URL. The B2B portal backend URL for these webhooks has not been registered with Savaari.
**Impact:** Driver assignment updates, cancellations initiated by Savaari, and trip completion notifications will not be received.
**Action required:** Register callback endpoint with Savaari team. Models already defined (see `booking.model.ts` — `DriverAssignmentPayload`, `SavaariCancellationPayload`, `TripCompletedPayload`).

---

## 12. End-to-End Verification Status (March 2026)

The following flows have been verified with live API calls:

| Feature | Status | Notes |
|---|---|---|
| Login (real API) | ✅ Working | Both tokens obtained correctly |
| Source cities (3,582) | ✅ Working | |
| Destination cities | ✅ Working | |
| Availability — One Way | ✅ Working | Real pricing returned |
| Availability — Round Trip | ✅ Working | Bangalore→Mysore: 9 cabs |
| Availability — Local | ✅ Working | Bangalore: 14 cabs |
| Availability — Airport | ❌ No results | Backend: enable_airport=0 for test account |
| Booking creation — One Way | ✅ Confirmed | IDs: 10243232, 10243266 |
| Booking creation — Local | ✅ Confirmed | ID: 10243689 |
| Booking creation — Round Trip | ✅ Working | |
| Coupon validation | ✅ Working | 400 errors handled with specific messages |
| Bookings list | ✅ Working | 144 cancelled bookings returned |
| Reports — with data | ✅ Working | |
| Reports — empty range | ✅ Working | 204 handled as empty state |
| Commission data | ✅ Working | |
| Country codes (225) | ✅ Working | |
| Localities (14,289 for Bangalore) | ✅ Working | |
| Account settings — display | ✅ Working | Real profile pre-populated |
| Account settings — save | ❌ Blocked | Backend bug: 400 on all payloads |
| Wallet — display | ✅ Working | ₹0 / Active shown gracefully |
| Wallet — top-up | ❌ Blocked | API 404 (not deployed) |
| Wallet — booking deduction | ⚠️ Mock only | In-memory deduction works |

---

## 13. Next Steps & Roadmap

### 13.1 Immediate (Requires Backend Action)

1. **Fix POST /user** — Profile updates must work. The `firstname` field validation is broken server-side.

2. **Deploy Wallet APIs** — All 7 `/wallet/*` endpoints need deployment so the payment system can go live.

3. **Integrate Razorpay** — Provide credentials and confirm `/wallet/topup/initiate` response format. Frontend code is already written and ready to activate.

4. **Enable Airport Pricing** — Configure the test agent account with airport trip type access.

5. **Register Webhook Callbacks** — Provide Savaari with the callback URL for driver assignment and trip completion events.

### 13.2 Frontend Enhancements

1. **VAS Booking Integration** — Connect Luggage Carrier and Preferred Driver selections to the booking API payload (`vas_luggage_carrier`, `vas_language_driver` fields).

2. **Booking Detail View** — Click into an individual booking to see full details (driver, car number, fare breakdown, cancellation policy).

3. **Real-Time Driver Tracking** — Map view showing driver's live location (requires Savaari webhook + WebSocket or polling).

4. **Cancellation Policy Display** — Show cancellation charge before confirming cancellation.

5. **Invoice Generation** — PDF invoice for completed trips (requires backend support).

6. **Multiple Passenger Support** — Bulk booking for group trips.

7. **Booking Amendments** — Allow changing pickup time or passenger details for upcoming bookings.

8. **Notification System** — In-app notifications when driver is assigned, trip starts, or completes.

### 13.3 Business Features

1. **Sub-Agent Management** — Allow agents to create and manage sub-agents under their account.

2. **Credit Limit** — Allow bookings up to a credit limit without wallet funds (post-billing).

3. **Automated Statements** — Monthly email reports with fare breakdown, commission, and outstanding dues.

4. **Markup Sync to API** — Currently markup is stored client-side only. Backend should store and apply markup server-side so it's consistent across devices.

5. **GST Invoice Module** — Auto-generate GST-compliant invoices for corporate clients.

6. **Multi-Currency Support** — For agents booking international customers.

### 13.4 Technical Improvements

1. **Token Refresh** — Auto-refresh Partner and B2B tokens before expiry (30-min refresh cycle recommended).

2. **Error Monitoring** — Integrate Sentry or similar for production error tracking.

3. **E2E Test Suite** — Playwright/Cypress tests for the critical booking flow.

4. **PWA Support** — Add service worker for offline capability on mobile agents.

5. **API Response Caching** — Commission and city data rarely change — add server-side caching headers.

---

## Appendix A: Trip Type API Mapping

| UI Tab | API tripType | API subTripType |
|---|---|---|
| One Way | outstation | oneWay |
| Round Trip | outstation | roundTrip |
| Local (8hr) | local | 880 |
| Local (12hr) | local | 1200 |
| Airport — Drop | airport | airportDrop |
| Airport — Pickup | airport | airportPickup |

---

## Appendix B: Key Configuration Files

| File | Purpose |
|---|---|
| `proxy.conf.json` | Dev server proxy for both API domains |
| `src/environments/environment.ts` | Dev config (useMockData, API URLs) |
| `src/environments/environment.production.ts` | Prod config |
| `.claude/launch.json` | Dev server launch config (port 4200) |
| `src/app/app.routes.ts` | All application routes |
| `src/app/app.config.ts` | App-level providers (HTTP, routing) |

---

## Appendix C: Local Car Image Assets

| File | Mapped To |
|---|---|
| `assets/images/cars/etios.png` | Sedan (Toyota Etios, Dzire, default) |
| `assets/images/cars/ertiga.png` | SUV/6+1 (Ertiga, Kia Carens, Creta) |
| `assets/images/cars/wagonr.png` | Hatchback (Wagon R) |
| `assets/images/cars/innova.png` | MUV/Tempo (Innova, Traveller) |
| `assets/images/cars/crysta.png` | Premium MUV (Innova Crysta) |

---

*End of Document*

*For questions or clarifications, contact the development team.*
