# Booking Validation, Wallet Top-Up & Booking Share — Design Doc

**Date:** 2026-03-12
**Status:** Approved

---

## Feature 1: Mandatory Pickup Details Validation

### Required Fields
- **Customer Name** (`guestName`) — min 2 characters
- **Phone Number** (`phone`) — min 10 digits
- **Pickup Address** (`pickupAddress`) — min 3 characters

### Optional Fields
- Customer Email (`guestEmail`)
- Landmark (`landmark`)

### Behavior
- Red asterisk (`*`) next to required field labels
- Inline red error text below each field when empty/invalid on blur or submit attempt
- "Book Now" button **disabled** until all 3 required fields pass validation
- Phone: digits only, minimum 10 characters
- Validation runs on blur and on Book Now click

### Files to Modify
- `src/app/features/booking/booking.html` — add asterisks, error messages, disable logic
- `src/app/features/booking/booking.ts` — add validation methods and state

---

## Feature 2: Inline Wallet Top-Up on Booking Page

### Trigger
Wallet balance < `getPayNowAmount()` for the selected payment option.

### UI
- Below wallet balance display in payment section
- Amber "Insufficient Balance" warning banner
- Amount input field (number)
- Preset quick-add buttons: ₹5,000 / ₹10,000 / ₹25,000 / ₹50,000
- "Add Funds" button
- Processing spinner during mock payment (2 seconds)
- Success message + updated balance after top-up

### Logic (Mock)
- On "Add Funds": validate amount > 0, show spinner for 2s, add amount to local `walletBalance$`
- `WalletService` gets a new `mockTopUp(amount)` method that updates the BehaviorSubject
- After top-up, `hasSufficientWalletBalance()` re-evaluates, enabling Book Now if sufficient

### Book Now Disabled States
- `paymentOption === 0` (no option selected)
- `!isPickupDetailsValid()` (missing required fields)
- `!hasSufficientWalletBalance()` (insufficient wallet)
- `isProcessingWallet` (booking in progress)

### Files to Modify
- `src/app/features/booking/booking.html` — top-up section in payment area
- `src/app/features/booking/booking.ts` — top-up logic, validation gating
- `src/app/core/services/wallet.service.ts` — `mockTopUp()` method

---

## Feature 3: WhatsApp Share + Printable Voucher

### View Bookings Page — WhatsApp Share
- "Share" button (WhatsApp icon) on each booking card
- Opens `https://wa.me/?text=<encoded-message>` in new tab
- Message format:
  ```
  *Booking Confirmation - Savaari*
  Booking ID: {bookingId}
  Trip: {sourceCity} ({tripType})
  Pickup: {date}, {time}
  Address: {pickupAddress}
  Fare: ₹{fare}
  Status: {status}
  Driver: {driverName} - {driverMobile} (if assigned)
  ```

### Booking Confirmation Screen — WhatsApp + Print Voucher
- "Share on WhatsApp" button — same message format
- "Print Voucher" button — triggers `window.print()`
- Print-friendly voucher layout with `@media print` CSS:
  - Savaari branding at top
  - Booking details table
  - Hides sidebar, header, footer, non-voucher UI
  - Clean, professional layout

### Files to Modify
- `src/app/features/bookings/bookings.html` — add share button to cards
- `src/app/features/bookings/bookings.ts` — `shareOnWhatsApp(booking)` method
- `src/app/features/booking/booking.html` — add buttons to confirmation screen
- `src/app/features/booking/booking.ts` — share + print methods
- `src/app/features/booking/booking.css` — `@media print` styles for voucher
