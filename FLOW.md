# Savaari B2B — End-to-End Flow Reference

> **Purpose:** Map every user-facing screen to the exact APIs it fires, in order, with file:line anchors. Read alongside `CLAUDE.md` (which is the architectural/codebase reference). This file is the **runtime/behavioural** reference.
>
> **Two big sections below:**
> - **Part A — End-to-End Flows** (what fires on each user action, with code anchors)
> - **Part B — Beta HAR Reference** (canonical request/response shapes from `b2bcab.betasavaari.com_this_is_final_try.har`, April 2026)
>
> **Token cheat sheet:**
> - **Partner JWT (HMAC HS512)** → stored as `SavaariToken`. Used on `/partner-api/*`, `/payment-api/*`, `/system-bookings-api/*`, `/settlement-api/*`, `/analytics-api/*`. Sent as `?token=<jwt>` query param.
> - **B2B JWT (RSA RS256)** → stored as `loginUserToken`. Used on `/b2b-api/*` and `/wallet-api/*`. Sent as `?token=<jwt>` for b2b APIs, and as `Authorization: Bearer <jwt>` header for wallet APIs.
>
> **Date format for ALL booking APIs:** `DD-MM-YYYY` (date) and `DD-MM-YYYY HH:mm` (datetime). See `src/app/core/utils/date-format.util.ts`.

---

# PART A — END-TO-END FLOWS

## Flow 1 — Login + Session Bootstrap

**File:** `src/app/features/auth/login/login.ts`
**Service:** `src/app/core/services/auth.service.ts`

### Step-by-step

```
User enters email + password → submit
  │
  ▼
[1] AuthService.login(email, password)
    └─→ POST /b2b-api/user/login
        • Content-Type: text/plain (HAR-confirmed; backend rejects application/json)
        • Body (raw JSON as text/plain): { userEmail, password, isAgent: true }
        • No token (login is unauthenticated)
        • Response: { statusCode: 200, token: <B2B JWT>, user: UserProfile, userGst: UserGst, ... }
  │
  ▼
[2] AuthService stores in localStorage:
    • loginUserToken      = response.token
    • loggedUserDetail    = response.user
    • userGst             = response.userGst
    • clearUserScopedStorage() runs FIRST to wipe previous user's PII
        (booking registry, settled-payments cache, agent logo, analytics session)
  │
  ▼
[3] AuthService.fetchPartnerToken() (fire-and-forget)
    └─→ GET /partner-api/auth/webtoken
        • No params, no token
        • Response: { token: <Partner JWT> }
        • Stored as SavaariToken
  │
  ▼
[4] Router → /dashboard
```

### Edge cases
- **B2B token expired during a browser session:** `AuthService.autoLogin()` is invoked on app init (`AppComponent.ngOnInit`) using stored `loginUserToken` to refresh it. Endpoint: `POST /b2b-api/user/autologin` with body `{ userEmail, logintoken }` as `text/plain`.
- **Partner token stale:** Dashboard's `ngOnInit` calls `fetchPartnerToken()` again to ensure freshness.
- **Forgot password:** `POST /partner-api/forgot_password` (form-encoded) — see `auth.service.ts`.

---

## Flow 2 — Dashboard Search (4 Trip-Type Tabs)

**File:** `src/app/features/dashboard/dashboard.ts` + `dashboard.html`
**Services used:** `CityService`, `AddressAutocompleteService`, `TripTypeService`, `AvailabilityService`, `BookingStateService`

### Page load
```
DashboardComponent.ngOnInit()
  ├─→ AuthService.fetchPartnerToken() (refresh if missing)
  ├─→ TripTypeService.getTripTypes() → GET /partner-api/trip-types
  └─→ CommissionService.getCommission() → GET /b2b-api/user/get-commission
       (response field is `commision` — typo from backend, normalized in service)
```

### Per-tab user input

| Tab | Required fields | Optional |
|-----|-----------------|----------|
| **One Way** | sourceCity, destCity, pickupDate, pickupTime, pickupAddress | dropAddress |
| **Round Trip** | sourceCity, destCity (+ extraDestinations[]), pickupDate, pickupTime, returnDate | pickupAddress |
| **Local** | sourceCity, pickupDate, pickupTime, pickupAddress | — (no destCity, no drop) |
| **Airport** | sourceCity, tripType (`drop`/`pickup`), airport, pickupDate, pickupTime, pickupAddress | — |

### Address autocomplete (per field)
```
User types in pickupAddress / dropAddress
  │
  ▼
AddressAutocompleteService.searchAddress(query, sourceCityName)
  └─→ GET /address-api/autocomplete/info.php?query=...&rsource=b2b
      Response: predictions[] with description, place_id, structured_formatting
  │
  ▼
User picks a suggestion
  │
  ▼
AddressAutocompleteService.getPlaceDetails(place_id)
  └─→ GET /address-api/place_id/info.php?place_id=...&rsource=b2b
      Response: { result: { geometry: {lat,lng}, address_components, source_city_map_info, name } }
  │
  ▼
BookingStateService stashes:
  • pickupLatLong / dropLatLong (lat,lng)
  • locality / dropLocality (extracted from address_components)
  • alias_source_city_id / alias_dest_city_id (from city_map_info — but these are NOT sent to /booking, see Flow 4)
```

### City autocomplete (sourceCity / destCity dropdowns)
```
User types in city field
  │
  ▼
CityService.searchCities(query, tripParams)
  └─→ GET /partner-api/cities (or trip-type specific endpoint)
      Response: City[] with cityId, cityName, state
```

### "Explore Cabs" click
```
DashboardComponent.exploreCabs()
  │
  ▼
TripTypeService.mapUiTabToApiParams(activeTab, formData)
  → builds: { tripType, subTripType, duration, ... }
  │
  ▼
AvailabilityService.checkAvailability(params)
  └─→ GET /partner-api/availabilities
      Params (cleaned via cleanParams — empty strings KEPT, null/undefined dropped):
        • rate_source = web
        • rate_type = premium       ← OUTSTATION ONLY
        • sourceCity = <id>
        • tripType = outstation|local|airport
        • subTripType = oneWay|roundTrip|''|drop|pickup
        • pickupDateTime = DD-MM-YYYY HH:mm
        • duration = 1
        • destinationCity = <id>    ← omitted for local & airport
        • token = <Partner JWT>
        • agentId = btoa(userId)
        • api_source = b2b
        • customerLatLong = ''      ← intentionally empty (not omitted)
      Response: Car[] with carTypeId, packageId, price, fareDetails, inclusions[], exclusions[]
  │
  ▼
Router → /select-car (cars + searchParams in BookingStateService)
```

### Edge cases
- **Round Trip multicity:** `extraDestinations[]` is preserved through state and added to availability + booking calls.
- **Airport tab default:** `tripType = 'drop'` (Drop to Airport).
- **Local tab:** sends `subTripType = ''` (empty string — kept by `cleanParams`) and `duration = 1` to receive ALL packages (R1/R2/R3) so user picks on `/select-car`.

---

## Flow 3 — Select Car

**File:** `src/app/features/select-car/select-car.ts` + `select-car.html`
**Modal:** `select-car-modify-search-modal.html` (in same folder)

### On page load
```
SelectCarComponent.ngOnInit()
  ├─→ Read cars + searchParams from BookingStateService
  ├─→ CommissionService.getCommission() → GET /b2b-api/user/get-commission
  └─→ Render car grid with:
        • Image (left)
        • Name + "or equivalent" (same line)
        • Inclusion pills (sky-blue icons, decoded via decodeUnicode for ₹)
        • Tabs inside each card: Inclusions / Exclusions / Facilities / T&C
```

### "Modify Search" click → modal opens
```
PrimeNG AutoComplete fields for FROM / TO:
  └─→ CityService.searchCities() on each keystroke (300ms debounce)

15-min interval time picker (custom)

"Explore Cabs" inside modal:
  └─→ tripTypeService.mapUiTabToApiParams() (same as dashboard)
  └─→ AvailabilityService.checkAvailability()
  └─→ Refreshes car list inline (no route change)
```

### "SELECT CAR" click
```
SelectCarComponent.onSelectCar(car)
  ├─→ BookingStateService.setSelectedCar(car)
  └─→ Router → /booking
```

### bookingGuard (`src/app/core/guards/booking.guard.ts`)
```
Before /booking activates:
  if (!BookingStateService.hasSelectedCar()) → redirect to /dashboard
```

---

## Flow 4 — Booking Step 1 (Trip Details)

**File:** `src/app/features/booking/booking.ts` (Step 1 lives in lines ~1-360)

### On page load (3 APIs fire in parallel)
```
BookingComponent.ngOnInit()
  ├─→ CountryCodeService.getCountryCodes()
  │     └─→ GET /b2b-api/country-code
  │         Response: { "91|IND": {...}, "1|USA": {...}, ... } 225 entries
  ├─→ CommissionService.getCommission()
  │     └─→ GET /b2b-api/user/get-commission
  ├─→ LocalityService.getLocalities(sourceCityId)
  │     └─→ GET /partner-api/localities?sourceCity=<id>
  │         (only for source city dropdown — not used for free-text addr search)
  └─→ PaymentService.advancePaymentCheck(carDetails)
        └─→ POST /payment-api/payment_confirmation/advance_payment_check.php
            Body (form-encoded):
              t_id=3 (outstation/local) | t_id=5 (airport)
              t_s_id=7 (oneWay) | 1 (roundTrip) | 4 (subType 880 etc.)
              c_id, pick_date, pick_time, car_id, package_id, tot_amt, drop_city_id
              b_src=0, IsPremium=0, reverse_dynamic_oneway=0
            Response: { advance_payment_status, advance_percent: [25], advance_percent_ids: [8], rule_set_no, fixed_pay_flag, fixed_pay_amount }
```

### User fills Step 1 form
- **Customer info:** title (Mr/Mrs/Ms), firstName, lastName, mobile (10-digit + country code default `91|IND`), email
- **Pickup address** (already from dashboard, can be edited via autocomplete)
- **Drop address** — HIDDEN for Local + Round Trip; shown only for One Way + Airport
- **GST checkbox** ("Need GST Invoice?"):
  - If `AuthService.getGstNumber()` exists → checkbox auto-ticked + green "GST Applied" pill
  - If not → "Add GST in Settings" link → `/account-settings`

### "Proceed to Payment" click → Step 2
```
BookingComponent.proceedToPayment()  [line 362]
  │
  ▼
[1] BookingApiService.createBooking(payload)
    └─→ POST /partner-api/booking?token=<Partner JWT>
        • Content-Type: application/x-www-form-urlencoded
        • Body fields (every one matters — see Part B for full list):
            sourceCity, tripType, subTripType, pickupDateTime, duration,
            pickupAddress, customerLatLong, locality,
            dropLatLong, dropLocality, dropAddress,
            app_user_id, customerTitle, customerName, customerEmail, customerMobile,
            countryCode='91|IND' (NOT '+91'),
            carType, premiumFlag=0, couponCode='' (empty kept),
            destinationCity, source='WEB',
            agentId=btoa(userId), api_source='b2b', device='MOBILE'
        • DELIBERATELY OMITTED:
            - prePayment       (sending it sets book_flag=1 prematurely → confirmation.php breaks)
            - alias_source_city_id / alias_dest_city_id (place_id only returns city IDs;
              backend expects locality IDs, so wrong IDs trigger "Bangalore (Dhanaulti)" fallback;
              omitting → backend renders plain city names cleanly)
        Response (201, can be object OR array depending on prePayment):
          {
            status: "success",
            data: {
              bookingId, reservationId, travelId, totalFare, prePayment, cashToCollect,
              order_id (= savaari_payment_id),
              paymentOptions: [{
                payment_gateway_code, title,
                parameters: { amount25per, amountFull, amountAdv, ... },
                parametersEncoded: { amount25perEncoded, amountFullEncoded, ... }
              }]
            }
          }
        (201 returned for soft-validation errors too — must check data.status_code)
  │
  ▼
[2] Stash booking response in BookingStateService
    Render Step 2 (3 payment option cards)
```

### Edge cases
- `countryCode` MUST be `91|IND`. Sending `+91` or `91` causes `402 Incorrect mobile number`.
- `couponCode` sent as **empty string** (not omitted) — `cleanParams` keeps empty strings.
- Local + Round Trip: drop address fields cleared from payload before send (no drop concept for these).

---

## Flow 5 — Booking Step 2 (Payment Options)

**File:** `src/app/features/booking/booking.ts` (Step 2: lines ~360-2000)
**HTML:** `src/app/features/booking/booking.html` (3 payment option cards)

### 3 Payment Option Cards

| # | Title | What agent pays now | What happens later | Buffer | invoice_payer |
|---|-------|---------------------|---------------------|--------|---------------|
| **1** | Pay Any Amount Now | 25–100% of fare (slider) | Driver collects rest in cash from customer | None | `pay_by_customer` |
| **2** | Pay 25% Now, Rest Auto-Deducted | 25% of fare | 75% auto-deducted from agent's wallet 48 hrs before trip (backend cron) | None | `pay_by_customer` |
| **3** | Zero Cash — Full Wallet (Recommended) | 100% fare + 20% buffer | Buffer refunded post-trip in 5–7 working days; any used portion stays with Savaari | 20% of fare | `pay_by_agent` |

### User clicks an option
```
BookingComponent.setPaymentOption(option: 1|2|3)  [line 805]
  │
  ▼
[1] BookingApiService.updateInvoicePayerInfo(bookingId, invoicePayer)
    └─→ POST /partner-api/booking/update_invoice_payer_info?token=<Partner JWT>
        Body (form-encoded):
          token = <Partner JWT>     (yes, also in body)
          invoice_payer = pay_by_customer | pay_by_agent
          booking_id = <bookingId>
        (Per backend team direction April 2026 — option 1/2 → customer, option 3 → agent)
  │
  ▼
[2] Toggle "Pay via Wallet" / "Pay via Razorpay" UI
  │
  ▼
[3] Compute payNow:
    Option 1 → fare × sliderPercent / 100
    Option 2 → fare × 0.25
    Option 3 → fare × 1.20
```

### "Proceed to Pay" click → branches based on payment method

#### Branch A: Wallet
```
BookingComponent.processWalletPayment(payNow)  [line 1573]
  │
  ▼
[1] WalletService.getBalance() → check sufficient funds
    └─→ POST /wallet-api/wallet/balance
        • Authorization: Bearer <B2B JWT>
        • Body: { agentId: userId } (JSON)
  │
  ▼
[2] If insufficient → show top-up modal (see Flow 9)
    If sufficient → continue
  │
  ▼
[3] WalletService.payForBooking({ amount: payNow, bookingId, savaariPaymentId })
    └─→ POST /wallet-api/wallet/pay-booking
        Response: { transaction_id, balance, ... }
        (Self-heals "Wallet not found" via wallet/create + retry once)
  │
  ▼
[4] PaymentService.confirmPayment({
        savaariPaymentId,
        paymentId: 'WALLET_<transaction_id>',
        advancedAmount: payNow,
        source: 'B2B_WALLET'
    })
    └─→ POST /payment_confirmation/confirmation.php  (NO /payment-api prefix — backend team rule)
        Body (form-encoded):
          paymentmode = savaariwebsite
          orderId = <savaari_payment_id>
          paymentId = WALLET_<transaction_id>
          advancedAmount = <payNow>
          source = B2B_WALLET
        Response: { status_code: "101", status_description: "SUCCESS", order_id }
  │
  ▼
[5] BookingApiService.sendBookingEmail(bookingId)
    └─→ POST /partner-api/email_sent (form-encoded, body: { booking_id })
  │
  ▼
[6] AuthService.autoLogin()  → refresh B2B JWT
  │
  ▼
[7] BookingRegistryService.add(bookingId, snapshot)  → cache for bookings list
  │
  ▼
[8] Router → /bookings (success toast)
```

#### Branch B: Razorpay
```
BookingComponent.processRazorpayPayment(payNow)  [line 1089]
  │
  ▼
[1] PaymentService.createRazorpayOrder({
        amount: payNow,
        encodedAmount: paymentOption.parametersEncoded.amount<25per|Full>Encoded,
        savaariPaymentId
    })
    └─→ POST /payment-api/razor_createorder.php
        Body (form-encoded):
          amount = <payNow>
          encoded_amount = <encoded from booking response>
          savaari_payment_id = <savaari_payment_id>
        Response: { response_id: 101, order_id: 'order_xxx', response_msg }
  │
  ▼
[2] Open Razorpay SDK checkout (client-side)
    Key: rzp_test_SWAcB744ApXvsB
    Amount in paise (× 100)
    Order ID from createorder response
    Prefill: customer email + phone
    handler: onRazorpaySuccess(razorpayPayload)
  │
  ▼
[3] On success callback → onRazorpaySuccess()
    │
    ▼
[3a] PaymentService.checkHash({ razorpay_payment_id, razorpay_order_id, razorpay_signature, savaari_pay_id, selectedAmount })
     └─→ POST /payment-api/razor_checkhash.php
         Content-Type: multipart/form-data (NOT urlencoded — HAR-confirmed)
    │
    ▼
[3b] PaymentService.confirmPayment({
        savaariPaymentId,
        paymentId: razorpay_payment_id,
        advancedAmount: payNow,
        source: 'B2B_RAZORPAY'
     })
     └─→ POST /payment_confirmation/confirmation.php  (no prefix)
         Body (form-encoded):
           paymentmode = savaariwebsite
           orderId, paymentId, advancedAmount, source = B2B_RAZORPAY
    │
    ▼
[3c] AuthService.autoLogin() → refresh B2B JWT
[3d] BookingApiService.sendBookingEmail(bookingId)  (×2 in beta — once with charset, once without)
[3e] BookingRegistryService.add(bookingId, snapshot)
[3f] Router → /bookings
```

### Edge cases
- **Razorpay modal closed without paying:** show "Payment cancelled" banner, booking stays in pending state (not yet confirmed).
- **`checkHash` fails:** still call `confirmation.php` so backend marks payment received (signature mismatch is logged but doesn't block UX — backend reconciles).
- **`confirmation.php` 500/network error:** payment is still captured by Razorpay; backend cron reconciles. Surface friendly "We're confirming your booking" message.
- **Token expired mid-Razorpay-flow:** `autoLogin()` refreshes both tokens.

---

## Flow 6 — Bookings List + Cancel + Settle

**File:** `src/app/features/bookings/bookings.ts` + `bookings.html`
**View-model:** `BookingCard` interface (defined in `bookings.ts`, not in core/models)

### Page load
```
BookingsComponent.ngOnInit()
  │
  ▼
BookingApiService.getAllBookings()
  └─→ GET /b2b-api/booking-details?token=<B2B JWT>
      Response: { bookingDetails: { bookingUpcoming: [], bookingCompleted: [], bookingCancelled: [] } }
  │
  ▼
Tag each row with `_bucket` field (preserves backend's pre-categorization):
  • upcoming   → goes to Upcoming tab
  • completed  → goes to Completed tab
  • cancelled  → goes to Cancelled tab
  │
  ▼
mapToBookingCard(raw) for each → produces BookingCard
  • snake_case → camelCase
  • balance_paid_status (0|1) → balancePaidStatus  (CANONICAL settled flag)
  • payment_option (1|2|3)
  • paid_via (wallet|razorpay)
  • buffer_amount → bufferAmount
  • Plus 30+ other fields (route, customer, driver, vehicle, dates, addresses, etc.)
```

### Tabs (3) — Upcoming / Completed / Cancelled
- Each tab shows count badge.
- Cards display: route line, customer info, car/driver, amount pills, payment status pills.

### Cancel modal
```
User clicks "Cancel Booking" → modal opens
  ├─→ Reason dropdown (matches live b2bcab.in):
  │     • "Customer changed plans"
  │     • "Wrong booking created"
  └─→ Optional comments textarea

User clicks Confirm:
  │
  ▼
BookingApiService.cancelBooking(payload)
  └─→ POST /system-bookings-api/cancellation.php
      Body (form-encoded):
        booking_id, reservation_id, reason, comments, booking_key, booking_type=1
      ⚠️ SYNCHRONOUS — backend sends email BEFORE returning. Can take 20–30 seconds.
      Response: { status_code: 101, status_description: "SUCCESS" }
  │
  ▼
Show success popup, refresh booking list
```

#### Cancel gate (client-side)
- Hidden if pickup is < 1 hour away.
- Backend ALSO enforces server-side (so client gate is just UX courtesy).
- `cancelDateTime` from API shown as tooltip on the cancel button.

### "Settle Now" button
- Shown ONLY when `balancePaidStatus !== 1`.
- ⚠️ NEVER trust `pay_now_amt` / `pay_bal_amt` in isolation — they can stay stale after settlement runs.
- Click → opens settlement modal (Razorpay flow, similar to Flow 5 Branch B but on `/settlement-api/booking/settlement-payment`).

### Trip Settlement Block (Option 3 + Completed tab only)
Hidden everywhere else. Shows two cards:
- **Buffer Used** (orange) → `getBufferUsed(booking)` = `min(fare - paid + buffer, buffer)`
- **Refund Due** (emerald) → `getRefundDue(booking)` = `buffer - bufferUsed` with helper text "Refund in 5-7 working days"

Note: Balance Due is HIDDEN for completed Option 3 bookings (it doesn't apply post-trip). This is the `!(activeTab === 'completed' && booking.paymentOption === 3)` guard added in commit `bee3dad`.

### "Receipt" button
```
BookingsComponent.viewReceipt(booking)
  └─→ Router.navigate(['/receipt'], { state: { booking } })
```

---

## Flow 7 — Booking Receipt (Print/Download)

**File:** `src/app/features/booking-receipt/booking-receipt.ts` + `booking-receipt.html`

### Page load
```
BookingReceiptComponent.ngOnInit()
  │
  ▼
[1] booking = history.state.booking
    if (!booking?.bookingId) → redirect to /bookings
  │
  ▼
[2] Pull agent info from AuthService:
    • agentName    = profile.firstname + ' ' + profile.lastname
    • agentEmail   = profile.email
    • agentGst     = userGst.gst_number
    • agentCompany = profile.companyname
  │
  ▼
[3] Render print-optimized layout
```

### Layout (top → bottom)
1. **Action bar** (hidden on print): "Back to Bookings" link + "Download / Print" button (calls `window.print()`)
2. **Header strip:** B2B CAB logo + receipt date
3. **Booking info banner:** Booking ID, Reservation ID, Trip Type, Pickup Date+Time
4. **Agent box** (Billed By) | **Customer box** — side by side
5. **Trip Details table:** Route, Via Stops (if any), Pickup Point, Vehicle, Kms Included, Driver
6. **Payment Breakdown table:**
   - Total Fare (full fare)
   - Paid via Wallet (− amount, emerald) — if `paidVia === 'wallet'`
   - Paid via Razorpay (− amount, blue) — if `paidVia === 'razorpay'`
   - Cash to Driver (amber) — if `cashToCollect > 0`
7. **Total bar (dark):** "Total Charged to Agent = booking.prePayment"
   - ⚠️ Kept simple per commit `3c9e685`. Earlier attempt to add buffer here caused double-counting and was reverted.
8. **Payment Method pill** (e.g. "Payment Option: Pay Any Amount Now")
9. **Footer:** "This is a computer-generated receipt. No signature required."

### `@media print` styles
- Hide action bar
- Force light mode colors
- Remove shadows for cleaner print

---

## Flow 8 — Wallet Top-Up

**File:** `src/app/features/wallet-dashboard/wallet-dashboard.ts`
**Service:** `src/app/core/services/wallet.service.ts`

### Page load
```
WalletDashboardComponent.ngOnInit()
  ├─→ WalletService.loadBalance()
  │     └─→ POST /wallet-api/wallet/balance
  │         Headers: Authorization: Bearer <B2B JWT>
  │         Body: { agentId: userId }
  │         Self-heals "Wallet not found" via /wallet/create + retry
  │
  └─→ WalletService.loadHistory()
        └─→ POST /wallet-api/wallet/history
            Body: { agentId, page, pageSize }
            Mapped to typed Transaction[] (debit/credit + type classification)
```

### Top-Up modal
```
User enters amount (e.g. ₹5000) → click "Top Up Wallet"
  │
  ▼
WalletService.initiateTopup(amount)
  └─→ POST /wallet-api/wallet/topup/initiate
      Body: { agentId, amount }
      Response: { razorpay_order_id, amount, currency, ... }
      (Self-heals "Wallet not found" by calling /wallet/create + retrying once)
  │
  ▼
Open Razorpay SDK checkout (key: rzp_test_SWAcB744ApXvsB)
  │
  ▼
On success → WalletService.verifyTopup({ razorpay_payment_id, order_id, signature, amount })
  └─→ POST /wallet-api/wallet/topup/verify
      Body: { agentId, razorpay_payment_id, order_id, signature, amount }
      ⚠️ FALLBACK: If this fails (network/500), WalletService credits balance LOCALLY in-memory
         so UI reflects successful Razorpay payment. Backend reconciles later.
  │
  ▼
WalletService.loadBalance() + loadHistory() refresh
```

### Edge cases
- **First-time login wallet:** `wallet/create` returns `400 "Already Exists"` if backend auto-created at registration → service treats this as success.
- **Verify-topup fails:** in-memory credit shown; backend cron reconciles within ~5 minutes.
- **Refund:** `WalletService.refund(transactionId)` → `POST /wallet-api/wallet/refund` (currently triggered backend-side post-trip for Option 3 buffer).

---

## Flow 9 — GST + Profile (Account Settings)

**File:** `src/app/features/account-settings/account-settings.ts`

### Page load
```
AccountSettingsComponent.ngOnInit()
  │
  ▼
Pull from AuthService:
  • profile  = AuthService.getUserProfile()
  • gst      = AuthService.getUserGst()
  • countryCodes = CountryCodeService.getCountryCodes()
```

### GST entry flow
```
User types 15-char GSTIN
  │
  ▼
[1] Client-side decode via gstin-decoder.ts:
    • State (38 states from state code chars 1-2)
    • PAN (chars 3-12)
    • Entity Type (10 categories — Individual/Company/HUF/Trust/etc.)
    • Name initial (char 14)
    Auto-fills profile fields with decoded info.
  │
  ▼
[2] Optional: Verify with backend (alpha-only)
    └─→ GET /reg-api/general/gst_verification.php?gstin=<gst>
        (Returns confirmed company name, address from MCA records)
  │
  ▼
[3] User clicks Save:
    AuthService.updateGst({ gst_number, pan_number, ... })
      └─→ POST /b2b-api/user/update-profile (form-encoded — HAR-confirmed shape)
  │
  ▼
[4] GST locks ("Contact support to change") — UI prevents edits after first save
```

### Logo upload
```
User picks file (PNG/JPEG/WebP/GIF, ≤ 1 MB validated client-side)
  │
  ▼
Read as base64 data URL → store as `agentLogo` in localStorage
(Backend endpoint not 100% confirmed yet — currently localStorage-only)
```

### Profile update
```
User edits firstName/lastName/address/etc. → Save
  └─→ POST /b2b-api/user/update-profile  (form-encoded)
      Body: profile fields (NOT password — that section was removed per fix)
```

---

## Flow 10 — Registration Wizard (Multi-Step, alpha-only flow)

**File:** `src/app/features/auth/register-wizard/register-wizard.ts`
**Toggled by:** `environment.newRegistrationFlow` (when true → wizard, when false → legacy `RegisterComponent`)
**Service:** `src/app/core/services/registration.service.ts`

### Step 1 — GST Verification (optional for non-GST users)
```
User enters 15-char GSTIN → Verify
  │
  ▼
RegistrationService.verifyGst(gstin)
  └─→ GET /reg-api/general/gst_verification.php?gstin=<gst>
      Response: { company_name, address, state, ... }
  │
  ▼
Auto-populate company fields. User confirms or skips.
```

### Step 2 — Mobile OTP
```
User enters mobile + country code → Send OTP
  │
  ▼
RegistrationService.sendOtp({ mobile, countryCode })
  └─→ POST /reg-api/user/send-otp  (form-encoded)
  │
  ▼
User enters 6-digit OTP → Verify
  │
  ▼
RegistrationService.verifyOtp({ mobile, otp, otpToken })
  └─→ POST /reg-api/user/verify-otp  (form-encoded)
      Response: { verified: true, otpToken }
```

### Step 3 — Profile Submit
```
User fills email, name, password, address → Create Account
  │
  ▼
RegistrationService.createUser(formData)
  └─→ POST /b2b-api/user  (multipart/form-data)
      Body: full registration payload + verified GST + OTP token
  │
  ▼
[Auto-login on success]
  └─→ AuthService.login() (Flow 1)
  │
  ▼
Router → /dashboard
```

---

## Flow 11 — Reports

**File:** `src/app/features/reports/reports.ts`

```
ReportsComponent.ngOnInit()
  │
  ▼
ReportApiService.getBookingReports(filters)
  └─→ GET /b2b-api/booking-details-report?token=<B2B JWT>&...filters
      Returns 204 No Content when no records (handled gracefully).
  │
  ▼
Render table:
  • Hide dangling arrow in route column for Local + Airport
    (both have dest === source — fix in commit d0fa3f2)
```

---

# PART B — BETA HAR REFERENCE (Canonical API Shapes)

> Extracted from HAR file `b2bcab.betasavaari.com_this_is_final_try.har` (April 2026).
> This is the **exact wire format** every API call must match.

---

## PAGE 1: LOGIN

### API 1 — POST /user/login
- **Host:** api23.betasavaari.com
- **Content-Type:** text/plain
- **Body (raw JSON as text/plain — NOT application/json):**
```json
{"userEmail":"bincy.joseph@savaari.com","password":"<password>","isAgent":true}
```
- **Response:** `{ statusCode: 200, message: "Success.", token: "<B2B JWT RS256>", user: {...}, userGst: {...} }`
- **Stores:** `loginUserToken` in localStorage

---

## PAGE 2: DASHBOARD (after login)

### API 2 — GET /auth/webtoken (called 5 TIMES on dashboard load)
- **Host:** api.betasavaari.com
- **Path:** /partner_api/public/auth/webtoken
- **Params:** NONE (no query params)
- **Response:** `{ token: "<Partner JWT HS512>" }`
- **Stores:** `SavaariToken` in localStorage
- **NOTE:** Beta site calls this 5 times in parallel on dashboard init. We call it once — that's fine.

### API 3 — GET /web-trip-types
- **Host:** api.betasavaari.com
- **Path:** /partner_api/public/web-trip-types
- **Params:** `?token=<Partner JWT>`
- **NOTE:** Beta site uses `web-trip-types`. We use `trip-types` (different format). Either works but response format differs.

### API 4 — GET /user/get-commission (called 2+ times)
- **Host:** api23.betasavaari.com
- **Path:** /user/get-commission
- **Params:** `?userEmail=bincy.joseph@savaari.com&token=<B2B JWT>`
- **Response:** `{ commision: { flat_commision: "0", percent_commision: "10", ... } }` (note: API typo "commision")

---

## PAGE 3: SELECT CAR (after "Explore Cabs" click)

### URL Format (beta site):
```
/select_cars?from_city_name=Bengaluru,%20Bangalore&from_city_id=377&trip_sub_type=oneWay&trip_type=outstation&pickup_date=11-04-2026&pickup_time=19:30&drop_date=&destCityId=1222&destCityName=Mysore%20(Mysuru)
```

### API 5 — GET /availabilities
- **Host:** api.betasavaari.com
- **Path:** /partner_api/public/availabilities
- **Params:**
```
rate_source = web
rate_type = premium                    ← ONLY for outstation
sourceCity = 377
tripType = outstation
subTripType = oneWay
pickupDateTime = 11-04-2026 19:30      ← DD-MM-YYYY HH:mm
duration = 1
destinationCity = 1222
token = <Partner JWT>
agentId = Mjg3NTg0                     ← btoa(userId) = btoa("287584")
api_source = b2b
```
- **NOT sent:** `customerLatLong` (sent as empty string), `subTripType` as empty, `rate_type` for non-outstation
- **Response:** Array of car objects with carTypeId, price, packageId, etc.

### API 6 — GET /user/get-commission (again, on select-car page)
- Same as API 4

---

## PAGE 4: BOOKING PAGE (after car selection)

### On Page Load (3 APIs fire simultaneously):

### API 7 — GET /country-code
- **Host:** api23.betasavaari.com
- **Path:** /country-code
- **Params:** NONE
- **Response:** `{ "91|IND": { name: "India", ... }, "1|USA": {...}, ... }` — 225 countries

### API 8 — GET /user/get-commission (again)
- Same as API 4

### API 9 — GET /localities
- **Host:** api.betasavaari.com
- **Path:** /partner_api/public/localities
- **Params:** `?sourceCity=377&token=<Partner JWT>`
- **Response:** Array of locality objects for source city
- **NOTE:** Used for locality dropdown, NOT for autocomplete address search

### API 10 — POST /advance_payment_check
- **Host:** b2bcab.betasavaari.com
- **Path:** /payment_confirmation/advance_payment_check.php
- **Content-Type:** application/x-www-form-urlencoded
- **Body:**
```
t_id = 3                               ← tripType mapping: outstation=3, local=3, airport=5
t_s_id = 7                             ← subTripType mapping: oneWay=7, roundTrip=1, 880=4
c_id = 377                             ← source city ID
pick_date = 11-04-2026                 ← DD-MM-YYYY
car_id = 3                             ← carTypeId from selected car
package_id = 45925                     ← packageId from selected car
tot_amt = 2552                         ← total price from selected car
b_src = 0
pick_time = 19:30                      ← HH:mm
IsPremium = 0
drop_city_id = 1222                    ← destination city ID
reverse_dynamic_oneway = 0
```
- **Response:**
```json
{
  "advance_payment_status": 1,
  "advance_percent": [25],
  "advance_percent_ids": [8],
  "rule_set_no": 0,
  "fixed_pay_flag": 0,
  "fixed_pay_amount": 0
}
```
- **Calculation:** `advance_amount = tot_amt × advance_percent[0] / 100 = 2552 × 25 / 100 = 638`. But actual amount sent was 576 — this includes commission discount (2552 - 10% commission = 2297, then 25% = 574 ≈ 576). Need to verify exact calculation.

---

### On "Proceed to Next" Click (2 APIs fire sequentially):

### API 11 — POST /booking (BOOKING CREATE)
- **Host:** api.betasavaari.com
- **Path:** /partner_api/public/booking
- **Token:** `?token=<Partner JWT>` as query param
- **Content-Type:** application/x-www-form-urlencoded
- **Body (EVERY field, exact order):**
```
sourceCity = 377
tripType = outstation
subTripType = oneWay
pickupDateTime = 11-04-2026 19:30
duration = 1
pickupAddress = Koramangala, Koramangala, Bengaluru, Karnataka
customerLatLong = 12.9352403,77.624532
locality = Koramangala
alias_source_city_id = 414             ← from place_id API response (NOT sent by us — see below)
dropLatLong = 12.305163,76.65517489999999
dropLocality = Chamrajpura
dropAddress = Mysuru Palace, Agrahara, Chamrajpura, Mysuru, Karnataka 570001
alias_dest_city_id = 280               ← from place_id API response (NOT sent by us — see below)
app_user_id = 287584                   ← user_id from login response
customerTitle = Mr
customerName = pranav
customerEmail = bincy.joseph@savaari.com
customerMobile = 7030343566
countryCode = 91|IND                   ← FULL format with pipe and country code, NOT just "91"
carType = 3
premiumFlag = 0
couponCode =                           ← empty string, SENT as empty
destinationCity = 1222
source = WEB
agentId = Mjg3NTg0                     ← btoa(userId)
api_source = b2b
device = MOBILE
```
- **Response (201 Created):**
```json
{
  "status": "success",
  "data": {
    "bookingId": 2361706,
    "reservationId": "S0426-2361706",
    "travelId": 106047,
    "sourceCity": "Bangalore, Karnataka",
    "tripType": "Outstation",
    "subTripType": "Outstation (Oneway)",
    "pickupDate": "2026-04-02",
    "pickupTime": "14:15:00",
    "totalFare": 2370,
    "prePayment": 0,
    "cashToCollect": 2370,
    "order_id": "SW35004S0426-2361706",
    "paymentOptions": [
      {
        "payment_gateway_code": 15,
        "title": "PayPay",
        "parameters": {
          "amount25per": 593,
          "amountFull": 2370,
          "amountAdv": 170
        },
        "parametersEncoded": {
          "amount25perEncoded": "112482a18632d9f343f718f16062f82fe0abf778",
          "amountFullEncoded": "af1c5a6f41bfd213a606dc1423ee9b8e5ab633fe"
        }
      }
    ]
  }
}
```
- **CRITICAL — from this response, extract:**
  - `data.order_id` → **savaari_payment_id** (e.g. "SW35004S0426-2361706")
  - `data.bookingId` → **booking_id** (e.g. 2361706)
  - `data.paymentOptions[*].parameters.amount25per` → **advance_amount** (e.g. 593)
  - `data.paymentOptions[*].parametersEncoded.amount25perEncoded` → **encoded_amount** (e.g. "112482a1...")
  - These three values are passed to razor_createorder.php

- **CRITICAL NOTES:**
  - `countryCode` must be `91|IND` NOT `91` (caused 402 error before)
  - `alias_source_city_id` and `alias_dest_city_id` are **NOT sent by us** — backend expects locality IDs but place_id API returns city IDs, so wrong IDs trigger an alphabetical-first fallback (e.g. "Bangalore (Dhanaulti)"). Omitting them → backend renders plain city names cleanly.
  - `prePayment` is **NOT sent by us** — sending it sets `book_flag=1` prematurely, which breaks `confirmation.php`'s update logic.
  - `locality` = place_name from place_id API (e.g. "Koramangala") — NOT full address
  - `dropLocality` = sublocality from place_id API address_components (e.g. "Chamrajpura")
  - `customerLatLong` is pickup lat,lng from place_id API
  - `dropLatLong` is drop lat,lng from place_id API
  - `couponCode` sent as EMPTY string (not omitted) — `cleanParams` keeps empty strings
  - `app_user_id` = user_id from login response

### API 12 — POST /booking/update_invoice_payer_info
- **Host:** api.betasavaari.com
- **Path:** /partner_api/public/booking/update_invoice_payer_info
- **Token:** `?token=<Partner JWT>` as query param
- **Content-Type:** application/x-www-form-urlencoded
- **Body:**
```
token = <Partner JWT>                  ← ALSO in body (duplicated from query)
invoice_payer = pay_by_customer        ← OR pay_by_agent (for Option 3)
booking_id = 2361705                   ← from booking create response
```
- **NOTE:** We call this from Step 2 `setPaymentOption()` — Option 1/2 → `pay_by_customer`, Option 3 → `pay_by_agent` (per backend team April 2026).

---

### Payment Flow (after booking create success):

### API 13 — POST /razor_createorder.php
- **Host:** b2bcab.betasavaari.com
- **Path:** //razor_createorder.php (note: double slash in beta — quirk)
- **Content-Type:** application/x-www-form-urlencoded
- **Body:**
```
amount = 576                           ← advance amount (calculated from advance_percent)
encoded_amount = 8d24f2d86aaa62003c195f5eba711e85c598d52e   ← from booking create response
savaari_payment_id = SW16994S0426-2361705                   ← from booking create response
```
- **Response:**
```json
{
  "response_id": 101,
  "response_msg": "Order Id created is : order_SYGeAe7DjbHasL",
  "order_id": "order_SYGeAe7DjbHasL"
}
```

### API 14 — Razorpay SDK (client-side, handled by SDK)
- Opens Razorpay checkout modal
- Key: `rzp_test_SWAcB744ApXvsB` (current — earlier `rzp_test_dsrBANLbHxlwZb` rotated April 2026)
- Amount: 57600 (paise = 576 × 100)
- Order ID: from razor_createorder response
- Description: e.g. "Outstation Oneway | Bangalore"
- Prefill: customer email + phone

### API 15 — POST /razor_checkhash.php (after Razorpay payment success callback)
- **Host:** b2bcab.betasavaari.com
- **Path:** //razor_checkhash.php
- **Content-Type:** multipart/form-data
- **Body:**
```
razorpay_payment_id = pay_SYGeIygy6bHi9W    ← from Razorpay callback
razorpay_order_id = order_SYGeAe7DjbHasL     ← from Razorpay callback
razorpay_signature = e6b837e39...             ← from Razorpay callback
savaari_pay_id = SW16994S0426-2361705        ← our stored savaari_payment_id
selectedAmount = 576                          ← advance amount
```

### API 16 — POST /user/autologin (token refresh after payment)
- **Host:** api23.betasavaari.com
- **Path:** /user/autologin
- **Content-Type:** text/plain
- **Body (raw JSON as text/plain):**
```json
{"userEmail":"bincy.joseph@savaari.com","logintoken":"<B2B JWT>"}
```
- **Response:** `{ statusCode: 200, token: "<new B2B JWT>", user: {...}, userGst: {...} }`
- **Purpose:** Refresh B2B token after payment (token may have expired during Razorpay flow)

### API 17 — POST /email_sent (called TWICE)
- **Host:** api.betasavaari.com
- **Path:** /partner_api/public/email_sent
- **Content-Type:** application/x-www-form-urlencoded (1st call) and application/x-www-form-urlencoded;charset=UTF-8 (2nd call)
- **Body:**
```
booking_id = 2361705
```
- **Response:** `{ status: "success", data: { sentemail: "", payment_gateway: "16" } }`
- **NOTE:** Called TWICE — once without charset, once with charset. Both identical otherwise.

### API 18 — POST /confirmation.php (FINAL — marks booking as paid)
- **Host:** b2bcab.betasavaari.com
- **Path:** //payment_confirmation/confirmation.php
- **Content-Type:** application/x-www-form-urlencoded
- **Body:**
```
paymentmode = savaariwebsite
orderId = SW16994S0426-2361705         ← savaari_payment_id
paymentId = pay_SYGeIygy6bHi9W        ← razorpay_payment_id (or WALLET_<txn_id> for wallet)
advancedAmount = 576                   ← advance amount paid
source = B2B_RAZORPAY                  ← OR B2B_WALLET (we add this; HAR didn't show it)
```
- **Response:**
```json
{
  "status_code": "101",
  "status_description": "SUCCESS",
  "order_id": "S0426-2361705"
}
```
- **CRITICAL:** Our service calls this WITHOUT the `/payment-api` prefix (uses `paymentPostDirect`). Per backend team — adding the prefix breaks wallet callbacks.

---

## COMPLETE FLOW SEQUENCE (18 API calls, excluding Razorpay SDK internals)

```
LOGIN PAGE:
  1. POST /user/login                    → get B2B JWT + user data

DASHBOARD PAGE:
  2. GET  /auth/webtoken                 → get Partner JWT (called 5× but 1× is fine)
  3. GET  /web-trip-types                → get trip type list
  4. GET  /user/get-commission           → get commission rates

SELECT CAR PAGE:
  5. GET  /availabilities                → get car list with prices
  6. GET  /user/get-commission           → commission (again)

BOOKING PAGE (on load):
  7. GET  /country-code                  → country code dropdown
  8. GET  /user/get-commission           → commission (again)
  9. GET  /localities                    → locality list for source city
  10. POST /advance_payment_check        → get advance payment percentage

BOOKING PAGE (on "Proceed to Next"):
  11. POST /booking                      → CREATE BOOKING → get booking_id, savaari_payment_id, encoded_amount
  12. POST /update_invoice_payer_info    → set invoice payer (pay_by_customer / pay_by_agent)

PAYMENT (Razorpay flow):
  13. POST /razor_createorder.php        → create Razorpay order
  14. [Razorpay SDK checkout]            → customer pays
  15. POST /razor_checkhash.php          → verify payment hash (multipart/form-data)

POST-PAYMENT:
  16. POST /user/autologin               → refresh B2B token
  17. POST /email_sent                   → send confirmation email (×2)
  18. POST /confirmation.php             → mark booking as confirmed/paid
```

---

## WALLET ALTERNATIVE FLOW (replaces APIs 13-15 + 18 above)

```
For Wallet Payment instead of Razorpay:
  13'. POST /wallet-api/wallet/balance   → check sufficient balance
  14'. POST /wallet-api/wallet/pay-booking → debit wallet, get transaction_id
  15'. POST /confirmation.php            → source=B2B_WALLET, paymentId=WALLET_<txn_id>
  16'. POST /user/autologin              → refresh B2B token
  17'. POST /email_sent                  → confirmation email
```

---

## CANCELLATION FLOW (independent of booking creation)

```
On cancel button click → modal → confirm:
  POST /system-bookings-api/cancellation.php
    Body: { booking_id, reservation_id, reason, comments, booking_key, booking_type=1 }
    ⚠️ Synchronous, 20-30 seconds (sends email before returning)
    Response: { status_code: 101, status_description: "SUCCESS" }
```

---

## SETTLEMENT FLOW (alpha-only, when balance_paid_status=0 post-trip)

```
On "Settle Now" click:
  POST /settlement-api/booking/settlement-payment
    Body: form-encoded settlement payload
    (Runs Razorpay flow similar to APIs 13-18 above)
```

---

## KEY DIFFERENCES FROM OUR IMPLEMENTATION (Historical — most resolved)

### RESOLVED:
1. ✅ **countryCode format:** Now `91|IND` (was `91` — caused 402 error)
2. ✅ **razor_checkhash.php:** Now called (was skipped)
3. ✅ **Content-Type for razor_checkhash:** multipart/form-data (was urlencoded)
4. ✅ **app_user_id:** Now sent (= user_id from login response)
5. ✅ **locality / dropLocality:** Extracted from place_id API
6. ✅ **update_invoice_payer_info:** Token in both query + body
7. ✅ **autologin after payment:** Now refreshes B2B JWT
8. ✅ **confirmation.php:** Always called as final step (with source=B2B_RAZORPAY or B2B_WALLET)
9. ✅ **email_sent:** Called once (we don't double-call like beta does — both work)
10. ✅ **advance_payment_check on page load** (correct order)

### DELIBERATELY DIFFERENT:
- **`alias_source_city_id` / `alias_dest_city_id` NOT sent** — place_id returns city IDs, backend expects locality IDs. Sending wrong IDs causes alphabetical-first fallback ("Bangalore (Dhanaulti)"). Omitting → clean city names.
- **`prePayment` NOT sent in /booking** — sending sets book_flag=1 prematurely, breaks confirmation.php update logic.

### QUIRKS WE'VE NORMALIZED:
- Beta calls `/auth/webtoken` 5× on dashboard load. We call once.
- Beta uses `/web-trip-types`. We use `/trip-types` (different format).
- Beta uses double slashes (`//razor_createorder.php`). Both work — server accepts either.

---

# PAYMENT OPTIONS — SUMMARY TABLE

| # | Title | Now | Later | Buffer | invoice_payer | Backend cron |
|---|-------|-----|-------|--------|---------------|--------------|
| 1 | Pay Any Amount Now | 25–100% (slider) | Driver collects rest in cash | None | `pay_by_customer` | — |
| 2 | Pay 25% Now, Rest Auto-Deducted | 25% | 75% from wallet, 48 hrs before trip | None | `pay_by_customer` | `cron_wallet_auto_pay_balance.php` (alpha-only) |
| 3 | Zero Cash — Full Wallet (Recommended) | 100% fare + 20% buffer | Refund post-trip in 5–7 days | 20% | `pay_by_agent` | Buffer reconciliation cron |

### Buffer math (Option 3 only)
```typescript
// In bookings.ts:
getBalanceDue(booking) {
  if (paymentOption === 3) return (fare + buffer) - paid   // includes buffer in due
  return fare - paid
}

getBufferUsed(booking) {
  if (paymentOption !== 3) return 0
  const used = max(0, fare - paid + buffer)
  return min(used, buffer)
}

getRefundDue(booking) {
  return buffer - getBufferUsed(booking)
}
```

---

# KEY TAKEAWAYS FOR A NEW DEVELOPER / NEW LLM

1. **Two tokens, two domains** — Partner JWT for `/partner-api/*`, `/payment-api/*`, etc. B2B JWT for `/b2b-api/*`, `/wallet-api/*`. Wallet is the only one using `Authorization: Bearer` header — everything else uses `?token=` query param.

2. **Date format is universal** — `DD-MM-YYYY` and `DD-MM-YYYY HH:mm`. Use `formatDateForApi()` and `formatDateTimeForApi()` from `core/utils/date-format.util.ts`.

3. **`countryCode` is `91|IND`** — never `+91` or `91`. Causes 402 error.

4. **`prePayment` is NEVER sent in `/booking`** — sending it breaks the confirmation flow. The advance amount goes through `razor_createorder.php` separately.

5. **`alias_*_city_id` is NEVER sent in `/booking`** — wrong IDs cause locality fallback bugs.

6. **`balance_paid_status` is the canonical settled flag** — never trust `pay_now_amt` / `pay_bal_amt` in isolation.

7. **`_bucket` field preserves backend's pre-categorization** — don't re-derive Upcoming/Completed/Cancelled from `status` (was fragile, dropped unknown statuses).

8. **`cleanParams` keeps empty strings** — only strips `null` and `undefined`. Beta site sends empty `customerLatLong=`, `subTripType=` etc.

9. **`confirmation.php` uses `paymentPostDirect` (NO `/payment-api` prefix)** — backend team rule, wallet callbacks break with the prefix.

10. **`OnPush` everywhere** — call `cdr.markForCheck()` after every async resolution.

11. **Lucide icons must be registered** in `app.config.ts` — kebab-case in templates, PascalCase in TS. Adding a new icon without registration = "icon not found".

12. **`BookingCard` view-model lives in `bookings.ts`** (not `core/models/`) — single source of truth used by bookings list, expanded view, and receipt page.

13. **Wallet self-heals** — "Wallet not found" triggers `/wallet/create` + retry. `verify-topup` failures fall back to in-memory credit.

14. **Cancellation is synchronous, 20–30s** — backend sends email before returning. Show spinner + helpful message.

15. **Print/Receipt total = `prePayment` only** (kept simple) — earlier attempt to add buffer caused double-counting and was reverted in commit `3c9e685`.

16. **3 Strict Guard Rails (read CLAUDE.md):**
    - No push without per-message approval
    - No teammate names anywhere public (commits/comments/PRs/markdown)
    - Never upload `proxy.php` to alpha server (`deploy_alpha.py` SKIP_FILES enforces this — never remove)
