# Booking Validation, Wallet Top-Up & Booking Share — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add mandatory field validation on pickup details, inline wallet top-up when balance is insufficient, WhatsApp share + printable voucher on booking confirmation and view bookings.

**Architecture:** All changes are in existing components — no new components or services. Validation is simple property checks in the booking component. Mock top-up uses the existing `WalletService.addTopUp()` method. WhatsApp sharing opens `wa.me` links. Print voucher uses `@media print` CSS and `window.print()`.

**Tech Stack:** Angular 21 standalone components, PrimeNG, Tailwind CSS, LucideAngular icons.

---

### Task 1: Add Mandatory Field Validation to Booking Component

**Files:**
- Modify: `src/app/features/booking/booking.ts` (lines 46-60 for form fields, line 145 for proceedToPayment, line 412 for bookNow)
- Modify: `src/app/features/booking/booking.html` (lines 100-255 for pickup details section)

**Step 1: Add validation state and methods to booking.ts**

Add these properties after line 88 (`bookingError = '';`):

```typescript
// Form validation
formSubmitAttempted = false;
```

Add these validation methods after `searchDropAddress()` (after line 201):

```typescript
/** Check if all mandatory pickup fields are filled */
isPickupDetailsValid(): boolean {
  return this.isGuestNameValid() && this.isPhoneValid() && this.isPickupAddressValid();
}

isGuestNameValid(): boolean {
  return this.guestName.trim().length >= 2;
}

isPhoneValid(): boolean {
  const digits = this.phone.replace(/\D/g, '');
  return digits.length >= 10;
}

isPickupAddressValid(): boolean {
  return (typeof this.pickupAddress === 'string' ? this.pickupAddress : String(this.pickupAddress || '')).trim().length >= 3;
}
```

**Step 2: Gate "Proceed to Payment" behind validation**

Replace the `proceedToPayment()` method (line 145-149):

```typescript
proceedToPayment() {
  this.formSubmitAttempted = true;
  this.cdr.markForCheck();

  if (!this.isPickupDetailsValid()) {
    return;
  }

  this.step1Complete = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  this.cdr.markForCheck();
}
```

**Step 3: Add red asterisks and error messages to booking.html**

For **Customer Name** field (around line 106-116), add asterisk to label and error below input:

Find the Customer Name label text and add ` *` after "Customer Name" in the floating label. Add error div after the input's closing tag:

```html
<!-- After the guestName input field closing tag -->
<div *ngIf="formSubmitAttempted && !isGuestNameValid()" class="text-xs text-red-500 mt-1 ml-4">
  Customer name is required (min 2 characters)
</div>
```

Also add red border class to the input: `[class.!border-red-400]="formSubmitAttempted && !isGuestNameValid()"`

For **Phone Number** field (around line 128-170), add asterisk and error:

```html
<!-- After the phone input closing tag -->
<div *ngIf="formSubmitAttempted && !isPhoneValid()" class="text-xs text-red-500 mt-1 ml-4">
  Valid phone number is required (min 10 digits)
</div>
```

For **Pickup Address** field (around line 176-198), add asterisk and error:

```html
<!-- After the p-autoComplete closing tag for pickup -->
<div *ngIf="formSubmitAttempted && !isPickupAddressValid()" class="text-xs text-red-500 mt-1 ml-4">
  Pickup address is required (min 3 characters)
</div>
```

Add ` <span class="text-red-500">*</span>` to the floating labels for Customer Name, Phone Number, and Pickup Address.

**Step 4: Disable "Proceed to Next Step" button when fields are empty (visual hint)**

Update the Proceed button (line 250-253). No disable — just let validation fire on click. The current behavior is fine.

**Step 5: Also gate bookNow() behind validation**

In `bookNow()` (line 412), add validation check at the top:

```typescript
bookNow() {
  this.bookingError = '';

  if (!this.isPickupDetailsValid()) {
    this.bookingError = 'Please fill in all required pickup details.';
    this.cdr.markForCheck();
    return;
  }

  if (!this.isBookingWindowValid()) {
    this.bookingError = 'Bookings must be made at least 6 hours before pickup time.';
    this.cdr.markForCheck();
    return;
  }

  this.processBooking();
}
```

---

### Task 2: Add Inline Wallet Top-Up on Booking Page

**Files:**
- Modify: `src/app/features/booking/booking.ts`
- Modify: `src/app/features/booking/booking.html` (lines 520-548, the wallet balance section)
- Modify: `src/app/core/services/wallet.service.ts` (add `mockTopUp` convenience method)

**Step 1: Add top-up state to booking.ts**

Add these properties after `bookingError = '';` (line 88):

```typescript
// Inline wallet top-up
topUpAmount: number = 0;
isProcessingTopUp = false;
topUpSuccess = false;
topUpPresets = [5000, 10000, 25000, 50000];
```

Add top-up methods after the VAS methods (after line 560):

```typescript
/** Set top-up amount from preset button */
setTopUpAmount(amount: number) {
  this.topUpAmount = amount;
  this.topUpSuccess = false;
  this.cdr.markForCheck();
}

/** Process mock wallet top-up */
processTopUp() {
  if (this.topUpAmount <= 0) return;
  this.isProcessingTopUp = true;
  this.topUpSuccess = false;
  this.cdr.markForCheck();

  // Simulate 2-second payment processing
  setTimeout(() => {
    this.walletService.addTopUp(this.topUpAmount, 'topup_' + Date.now());
    this.isProcessingTopUp = false;
    this.topUpSuccess = true;
    this.topUpAmount = 0;
    this.cdr.markForCheck();

    // Clear success message after 3 seconds
    setTimeout(() => {
      this.topUpSuccess = false;
      this.cdr.markForCheck();
    }, 3000);
  }, 2000);
}
```

**Step 2: Replace the wallet balance section in booking.html**

Replace lines 520-548 (the wallet balance check section) with:

```html
<!-- Wallet Balance + Inline Top-Up -->
<div class="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800">
  <div class="flex items-center justify-between mb-4">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
        <lucide-icon name="wallet" [size]="20" class="text-primary"></lucide-icon>
      </div>
      <div>
        <h5 class="text-xs font-bold text-slate-500 uppercase tracking-wider">Your Wallet Balance</h5>
        <div class="text-xl font-black text-slate-800 dark:text-slate-100">
          ₹{{ walletObj.balance | number:'1.0-0' }}
        </div>
      </div>
    </div>
  </div>

  <!-- Sufficient balance indicator -->
  <div *ngIf="paymentOption !== 0 && hasSufficientWalletBalance(walletObj.balance)"
    class="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/50 rounded-xl flex items-center gap-3">
    <lucide-icon name="check-circle" [size]="16" class="text-emerald-500"></lucide-icon>
    <p class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
      Sufficient balance for this booking.
    </p>
  </div>

  <!-- No payment selected yet -->
  <div *ngIf="paymentOption === 0"
    class="p-3 bg-slate-100 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl flex items-center gap-3">
    <lucide-icon name="info" [size]="16" class="text-slate-400"></lucide-icon>
    <p class="text-[11px] font-medium text-slate-500">
      Select a payment option to check wallet balance.
    </p>
  </div>

  <!-- Insufficient balance — show top-up -->
  <div *ngIf="paymentOption !== 0 && !hasSufficientWalletBalance(walletObj.balance)">
    <!-- Warning banner -->
    <div class="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl flex items-center gap-3 mb-4">
      <lucide-icon name="alert-triangle" [size]="16" class="text-amber-500"></lucide-icon>
      <div>
        <p class="text-xs font-bold text-amber-700 dark:text-amber-400">
          Insufficient Balance — Need ₹{{ getPayNowAmount() | number:'1.0-0' }}, have ₹{{ walletObj.balance | number:'1.0-0' }}
        </p>
        <p class="text-[10px] text-amber-600 dark:text-amber-500 mt-0.5">
          Top up at least ₹{{ (getPayNowAmount() - (walletObj.balance || 0)) | number:'1.0-0' }} to proceed.
        </p>
      </div>
    </div>

    <!-- Top-up section -->
    <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <h6 class="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
        <lucide-icon name="plus-circle" [size]="14" class="text-primary"></lucide-icon>
        Quick Top-Up
      </h6>

      <!-- Preset buttons -->
      <div class="grid grid-cols-4 gap-2 mb-3">
        <button *ngFor="let preset of topUpPresets"
          (click)="setTopUpAmount(preset)"
          [class.bg-primary]="topUpAmount === preset"
          [class.text-white]="topUpAmount === preset"
          [class.border-primary]="topUpAmount === preset"
          class="py-2 px-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 hover:border-primary transition-all text-center">
          ₹{{ preset | number:'1.0-0' }}
        </button>
      </div>

      <!-- Custom amount input -->
      <div class="flex gap-2">
        <div class="relative flex-1">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">₹</span>
          <input type="number" [(ngModel)]="topUpAmount" name="topUpAmount"
            placeholder="Enter amount"
            min="1"
            class="w-full pl-8 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary focus:border-transparent outline-none" />
        </div>
        <button (click)="processTopUp()"
          [disabled]="topUpAmount <= 0 || isProcessingTopUp"
          class="px-5 py-2.5 bg-primary hover:bg-sky-600 disabled:bg-slate-300 text-white font-bold text-sm rounded-xl transition-all disabled:cursor-not-allowed flex items-center gap-2">
          <lucide-icon *ngIf="isProcessingTopUp" name="loader-2" [size]="14" class="animate-spin"></lucide-icon>
          {{ isProcessingTopUp ? 'Processing...' : 'Add Funds' }}
        </button>
      </div>

      <!-- Success message -->
      <div *ngIf="topUpSuccess"
        class="mt-3 p-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center gap-2">
        <lucide-icon name="check-circle" [size]="14" class="text-emerald-500"></lucide-icon>
        <span class="text-xs font-bold text-emerald-600">Funds added successfully! Balance updated.</span>
      </div>
    </div>
  </div>
</div>
```

**Step 3: Update Book Now button disabled state**

Replace the Book Now button (line 625-632) — add wallet balance check:

```html
<button (click)="bookNow()"
  [disabled]="paymentOption === 0 || isProcessingWallet || !hasSufficientWalletBalance((walletBalance$ | async))"
  class="w-full py-4 bg-primary hover:bg-sky-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-bold text-lg rounded-xl shadow-lg shadow-sky-200 dark:shadow-none transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:transform-none disabled:shadow-none">
  <span *ngIf="isProcessingWallet" class="flex items-center justify-center gap-2">
    <lucide-icon name="loader-2" [size]="20" class="animate-spin"></lucide-icon>
    Creating Booking...
  </span>
  <ng-container *ngIf="!isProcessingWallet">
    <span *ngIf="paymentOption === 0">Select a Payment Option</span>
    <span *ngIf="paymentOption !== 0 && !hasSufficientWalletBalance((walletBalance$ | async))">Insufficient Wallet Balance</span>
    <span *ngIf="paymentOption !== 0 && hasSufficientWalletBalance((walletBalance$ | async))">Book Now</span>
  </ng-container>
</button>
```

---

### Task 3: Add WhatsApp Share + Print Voucher to Booking Confirmation

**Files:**
- Modify: `src/app/features/booking/booking.ts` (add share and print methods)
- Modify: `src/app/features/booking/booking.html` (lines 932-939, the confirmation buttons)
- Modify: `src/app/features/booking/booking.css` (add `@media print` styles)

**Step 1: Add share and print methods to booking.ts**

Add after the `toggleVasLanguage()` method (after line 560, or after the top-up methods if Task 2 is done):

```typescript
/** Share booking details via WhatsApp */
shareOnWhatsApp() {
  if (!this.itinerary || !this.selectedCar) return;

  const pickupDate = this.itinerary.pickupDate
    ? new Date(this.itinerary.pickupDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  let itineraryText = '';
  if (this.itinerary.tripType === 'Local') {
    itineraryText = `${this.itinerary.fromCity} (Local - ${this.itinerary.localPackage || '8hr/80km'})`;
  } else if (this.itinerary.tripType === 'Airport') {
    itineraryText = `${this.itinerary.fromCity} (Airport ${this.itinerary.airportSubType === 'pickup' ? 'Pickup' : 'Drop'})`;
  } else if (this.itinerary.tripType === 'Round Trip') {
    itineraryText = `${this.itinerary.fromCity} → ${this.itinerary.toCity} → ${this.itinerary.fromCity} (Round Trip)`;
  } else {
    itineraryText = `${this.itinerary.fromCity} → ${this.itinerary.toCity} (One Way)`;
  }

  const lines = [
    `*Booking Confirmation - Savaari*`,
    ``,
    `Booking ID: ${this.bookingId}`,
    `Trip: ${itineraryText}`,
    `Pickup: ${pickupDate}, ${this.itinerary.pickupTime || ''}`,
    this.pickupAddress ? `Address: ${this.pickupAddress}` : '',
    `Car: ${this.selectedCar.name || 'Sedan'}`,
    `Fare: ₹${(this.selectedCar.price || 0).toLocaleString('en-IN')}`,
    ``,
    `_Powered by Savaari - India's #1 Cab Service since 2006_`,
  ].filter(l => l !== undefined);

  const text = encodeURIComponent(lines.join('\n'));
  window.open(`https://wa.me/?text=${text}`, '_blank');
}

/** Print booking voucher */
printVoucher() {
  window.print();
}
```

**Step 2: Update confirmation buttons in booking.html**

Replace lines 932-939 (the confirmation action buttons) with:

```html
<div class="flex flex-col sm:flex-row gap-4 justify-center">
  <button (click)="shareOnWhatsApp()"
    class="px-6 py-3 bg-[#25D366] hover:bg-[#20BD5A] text-white font-bold rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2">
    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
    Share on WhatsApp
  </button>
  <button (click)="printVoucher()"
    class="px-6 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold rounded-lg shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2">
    <lucide-icon name="printer" [size]="18"></lucide-icon>
    Print Voucher
  </button>
  <button routerLink="/bookings"
    class="px-6 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold rounded-lg shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
    View Bookings
  </button>
  <button routerLink="/dashboard"
    class="px-6 py-3 bg-primary text-white font-bold rounded-lg shadow-sm hover:bg-sky-600 transition-colors">
    Book Another Cab
  </button>
</div>
```

**Step 3: Add print styles to booking.css**

Append to `src/app/features/booking/booking.css`:

```css
/* ===================================================================
 * Print Voucher Styles
 * Hides everything except the booking confirmation card.
 * =================================================================== */

@media print {
  /* Hide everything by default */
  body * {
    visibility: hidden;
  }

  /* Show only the booking confirmation section */
  .booking-voucher-print,
  .booking-voucher-print * {
    visibility: visible;
  }

  .booking-voucher-print {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    padding: 40px;
  }

  /* Hide action buttons in print */
  .no-print {
    display: none !important;
  }
}
```

**Step 4: Add print CSS classes to confirmation HTML**

Wrap the confirmation section (line 878) with a `booking-voucher-print` class:

Change `class="max-w-3xl mx-auto mt-4 mb-24 bg-white...` to include `booking-voucher-print`:
```html
class="max-w-3xl mx-auto mt-4 mb-24 bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 p-8 text-center animate-in zoom-in duration-300 booking-voucher-print"
```

Add `no-print` class to the buttons container:
```html
<div class="flex flex-col sm:flex-row gap-4 justify-center no-print">
```

---

### Task 4: Add WhatsApp Share to View Bookings Page

**Files:**
- Modify: `src/app/features/bookings/bookings.ts` (add shareOnWhatsApp method)
- Modify: `src/app/features/bookings/bookings.html` (add share button to booking cards, line 177-183)

**Step 1: Add share method to bookings.ts**

Add after the `cancelBooking()` method (after line 213):

```typescript
/** Share booking details via WhatsApp */
shareOnWhatsApp(booking: BookingCard) {
  const pickupDate = booking.pickupDate
    ? booking.pickupDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  const lines = [
    `*Booking Confirmation - Savaari*`,
    ``,
    `Booking ID: ${booking.bookingId}`,
    `Trip: ${booking.sourceCity} (${booking.usageName || booking.tripType})`,
    `Pickup: ${pickupDate}${booking.pickupTime ? ', ' + booking.pickupTime : ''}`,
    booking.pickupAddress ? `Address: ${booking.pickupAddress}` : '',
    booking.fare ? `Fare: ₹${booking.fare.toLocaleString('en-IN')}` : '',
    `Status: ${this.getStatusLabel(booking.status)}`,
    booking.driverName ? `Driver: ${booking.driverName}${booking.driverMobile ? ' - ' + booking.driverMobile : ''}` : '',
    booking.carNumber ? `Car No: ${booking.carNumber}` : '',
    ``,
    `_Powered by Savaari - India's #1 Cab Service since 2006_`,
  ].filter(l => l !== '' && l !== undefined);

  const text = encodeURIComponent(lines.join('\n'));
  window.open(`https://wa.me/?text=${text}`, '_blank');
}
```

**Step 2: Add share button to booking cards in bookings.html**

After the Cancel Booking button (line 178-182), add the WhatsApp share button:

```html
<!-- Share via WhatsApp -->
<button (click)="shareOnWhatsApp(booking)"
  class="mt-1 text-sm text-[#25D366] hover:text-[#20BD5A] font-medium flex items-center gap-1">
  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
  Share
</button>
```

This button should appear for ALL tabs (upcoming, cancelled, completed), not just upcoming.

---

### Task 5: Verify All Changes

**Step 1: Start dev server**

Use `preview_start` with name `savaari-b2b-dev`.

**Step 2: Verify build has zero errors**

Check `preview_logs` for compilation errors.

**Step 3: Test pickup validation**

Navigate to booking page. Try clicking "Proceed to Next Step" with empty fields. Verify red error messages appear. Fill fields, verify errors clear and proceed works.

**Step 4: Test wallet top-up**

On payment step, select a payment option. Verify insufficient balance warning appears. Use top-up with preset amount. Verify balance updates and Book Now enables.

**Step 5: Test booking + confirmation**

Complete a booking. On confirmation screen, verify WhatsApp and Print Voucher buttons are present. Click WhatsApp and verify wa.me opens with formatted message.

**Step 6: Test view bookings share**

Navigate to /bookings. Verify WhatsApp share button on each booking card. Click and verify wa.me opens.
