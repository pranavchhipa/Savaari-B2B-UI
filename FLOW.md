# Beta Site (b2bcab.betasavaari.com) — Complete API Flow

> Extracted from HAR file `b2bcab.betasavaari.com_this_is_final_try.har` (April 2026)
> This is the SINGLE SOURCE OF TRUTH. Every API call must match this exactly.

---

## PAGE 1: LOGIN

### API 1 — POST /user/login
- **Host:** api23.betasavaari.com
- **Content-Type:** text/plain
- **Body (raw JSON as text/plain — NOT application/json):**
```json
{"userEmail":"bincy.joseph@savaari.com","password":"aMuWysE@YgAVa5aPagYR","isAgent":true}
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
- **NOT sent:** `customerLatLong`, `subTripType` as empty, `rate_type` for non-outstation
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
- **Calculation:** advance_amount = tot_amt × advance_percent[0] / 100 = 2552 × 25 / 100 = 638. But actual amount sent was 576 — this includes commission discount (2552 - 10% commission = 2297, then 25% = 574 ≈ 576). Need to verify exact calculation.

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
alias_source_city_id = 414             ← from place_id API response → source_city_map_info.city_id
dropLatLong = 12.305163,76.65517489999999
dropLocality = Chamrajpura
dropAddress = Mysuru Palace, Agrahara, Chamrajpura, Mysuru, Karnataka 570001
alias_dest_city_id = 280               ← from place_id API response → destination_city_map_info.city_id
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
  - `alias_source_city_id` and `alias_dest_city_id` come from place_id API `source_city_map_info` / `destination_city_map_info`
  - `locality` = place_name from place_id API (e.g. "Koramangala") — NOT full address
  - `dropLocality` = sublocality from place_id API address_components (e.g. "Chamrajpura")
  - `customerLatLong` is pickup lat,lng from place_id API
  - `dropLatLong` is drop lat,lng from place_id API
  - `couponCode` sent as EMPTY string (not omitted)
  - `app_user_id` = user_id from login response

### API 12 — POST /booking/update_invoice_payer_info
- **Host:** api.betasavaari.com
- **Path:** /partner_api/public/booking/update_invoice_payer_info
- **Token:** `?token=<Partner JWT>` as query param
- **Content-Type:** application/x-www-form-urlencoded
- **Body:**
```
token = <Partner JWT>                  ← ALSO in body (duplicated from query)
invoice_payer = pay_by_customer
booking_id = 2361705                   ← from booking create response
```

---

### Payment Flow (after booking create success):

### API 13 — POST /razor_createorder.php
- **Host:** b2bcab.betasavaari.com
- **Path:** //razor_createorder.php (note: double slash in beta)
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
- Key: `rzp_test_dsrBANLbHxlwZb`
- Amount: 57600 (paise = 576 × 100)
- Order ID: from razor_createorder response
- Description: "Outstation Oneway | Bangalore"
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
- **NOTE:** This IS called in the flow (previous analysis said it wasn't — WRONG)

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
paymentId = pay_SYGeIygy6bHi9W        ← razorpay_payment_id
advancedAmount = 576                   ← advance amount paid
```
- **Response:**
```json
{
  "status_code": "101",
  "status_description": "SUCCESS",
  "order_id": "S0426-2361705"
}
```

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
  12. POST /update_invoice_payer_info    → set invoice payer

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

## KEY DIFFERENCES FROM OUR IMPLEMENTATION

### MUST FIX:
1. **countryCode format:** We send `91`, beta sends `91|IND` — CAUSES 402 ERROR
2. **razor_checkhash.php:** We SKIPPED this. Beta DOES call it. Must add back.
3. **Content-Type for razor_checkhash:** Must be `multipart/form-data` (FormData), NOT urlencoded
4. **alias_source_city_id / alias_dest_city_id:** From place_id API response's city_map_info. We may not be sending these.
5. **app_user_id:** Must be user_id from login response (287584). Verify we send this.
6. **locality / dropLocality:** Extracted from autocomplete result main_text. Verify format.
7. **update_invoice_payer_info:** Token sent BOTH as query param AND in body. Verify.
8. **autologin after payment:** Must refresh B2B JWT token. Verify we do this.
9. **confirmation.php:** Must be called as final step. Verify.
10. **email_sent × 2:** Called twice with same params. Verify.
11. **advance_payment_check on page load** (not on Proceed click)

### VERIFY:
- `device = MOBILE` in booking create (hardcoded?)
- `source = WEB` in booking create
- `premiumFlag = 0`
- `couponCode = ` (empty string, sent)
- Double slash in paths (`//razor_createorder.php`) — may be a beta quirk
