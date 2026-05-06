# Registration Flow — New Session Handoff
**Date:** 2026-04-09 | **Branch:** main | **Last commit:** `46e067a`

---

## 🏁 Current Git State

```
46e067a fix: wallet debit/credit mislabelling + bookings mixing from stale registry
1d33206 sync: restore gitlab improvements — cancel booking, razorpay hardening, wallet, dashboard
93eb9d4 fix: rename GST skip button to 'Proceed — I don't have a GST number'
fb0a10d fix: register-wizard friendlier progress + sticky left branding panel
...7 register-wizard commits today...
```

**Uncommitted working tree (DO NOT OVERWRITE):**
- `src/app/features/auth/register-wizard/register-wizard.html` — OTP resend buttons + verifying spinners
- `src/app/features/auth/register-wizard/register-wizard.ts` — resend cooldown logic, RegistrationService wired

---

## 📁 Registration-Related Files

| File | Status | Purpose |
|------|--------|---------|
| `src/app/features/auth/register-wizard/register-wizard.ts` | ✅ 715 lines, partially uncommitted | Main wizard component |
| `src/app/features/auth/register-wizard/register-wizard.html` | ✅ 755 lines, partially uncommitted | Wizard template |
| `src/app/features/auth/register-wizard/register-wizard.css` | ✅ 25 lines committed | Animations |
| `src/app/core/services/registration.service.ts` | ✅ 446 lines committed | API calls (GST, OTP, register) |
| `src/app/features/auth/login/login.ts` | ✅ committed | Pre-fills email/password after registration |
| `src/app/features/auth/login/login.html` | ✅ committed | Success banner after registration |
| `src/app/app.routes.ts` | ✅ | `/register` → `RegisterWizardComponent` |
| `src/environments/environment.ts` | ✅ | `newRegistrationFlow: true`, `registrationApiBaseUrl: '/reg-api'` |
| `proxy.conf.json` | ✅ | `/reg-api` → `https://api.alphasavaari.com` |

---

## 🧩 Wizard Architecture

**6 steps, single-page progressive reveal (step collapses to summary row after completion):**

```
Step 1 — Name       → firstName + lastName
Step 2 — Contact    → mobile + email → Send OTPs → side-by-side OTP verify
Step 3 — GST        → optional GSTIN → auto-fills PAN + company if valid
Step 4 — PAN        → skipped if GST succeeded; manual if GST skipped
Step 5 — Company    → companyName (always UPPERCASE) + companyAddress (autocomplete or locked)
Step 6 — Password   → password + confirmPassword → register API → redirect to /login
```

**Key state variables (register-wizard.ts):**
```typescript
currentStep: StepKey    // 'name' | 'contact' | 'gst' | 'pan' | 'company' | 'password'
completedSteps: Set<StepKey>

// Contact OTP state
contactPhase: 'entry' | 'otp' | 'verified'
mobileOtp: string[]         // 4-digit boxes
emailOtp: string[]
mobileOtpVerified: boolean
emailOtpVerified: boolean
mobileVerificationToken: string   // returned by verify-otp API
emailVerificationToken: string
mobileResendCooldown: number      // 30s countdown
emailResendCooldown: number
mobileVerifying: boolean          // in-flight spinner
emailVerifying: boolean

// GST state
gstSkipped: boolean
gstError: string
gstLookupLoading: boolean

// Company autocomplete (only when GST skipped)
companyAddressInput: string          // ngModel for p-autoComplete
filteredCompanyAddresses: AddressSuggestion[]
companyAutoFilled: boolean           // true = locked (from GST)

// Submit
isSubmitting: boolean
registerError: string
```

---

## 🔌 RegistrationService API (src/app/core/services/registration.service.ts)

```typescript
// Methods:
verifyGst(gstNumber: string): Observable<GstVerificationResult>
sendOtps(mobile, email, countryCode): Observable<SendOtpResult>
resendOtp(channel: 'mobile'|'email', contact, countryCode): Observable<SendOtpResult>
verifyOtp(channel: 'mobile'|'email', contact, otp): Observable<VerifyOtpResult>
registerAccount(payload: RegisterPayload): Observable<RegisterResult>
```

**RegisterPayload:**
```typescript
{
  firstName, lastName, mobile, email, countryCode: '91',
  gstNumber?,   // empty string if skipped
  panNumber, companyName, companyAddress, password,
  mobileVerificationToken?, emailVerificationToken?
}
```

---

## 🌐 API Endpoints (alpha-hosted)

| Endpoint | Status | Notes |
|----------|--------|-------|
| `POST /reg-api/general/gst_verification.php` | ✅ Ready | Returns `{ status: true, data: { fields: { legal_name, pan_number, address, gstin_status } } }` |
| `POST /reg-api/user/send-otp` | ⏳ Pending | Body: `{ mobile, email, countryCode, channel: 'both' }` |
| `POST /reg-api/user/verify-otp` | ⏳ Pending | Body: `{ channel, otp, mobile/email }` → returns `verificationToken` |
| `POST /b2b-api/user` (multipart) | ✅ Existing | Existing register endpoint — may need `mobileVerificationToken` + `emailVerificationToken` fields added |

---

## ✅ What's Working (Committed)

1. **Left branding panel** — sticky on desktop, testimonial carousel, B2B CAB logo
2. **Step 1 (Name)** — firstName + lastName with validation, collapses to summary row
3. **Step 2 (Contact)** — mobile + email entry phase, Send OTP button, side-by-side OTP boxes
4. **Step 2 OTP verify** — auto-verify on 4th digit, per-channel errors, verified checkmark
5. **Step 2 Resend** — 30s cooldown, "Resend in Xs" countdown, per-channel (HTML has it, working tree)
6. **Step 2 Verifying spinner** — `mobileVerifying`/`emailVerifying` in-flight state (working tree)
7. **Step 3 (GST)** — GSTIN input, verify button, auto-fills PAN + company on success, skip option
8. **Step 4 (PAN)** — shown only if GST skipped; hidden if GST succeeded (PAN auto-filled)
9. **Step 5 (Company)** — UPPERCASE companyName, PrimeNG AutoComplete for address (skip-GST path), locked textarea (GST path)
10. **Step 6 (Password)** — strength checklist, confirm match, submit → `/login?registered=1`
11. **Post-registration** — stores `b2bcab.pendingLogin` in localStorage → login page pre-fills email+password
12. **Progress indicator** — 6 segmented dots, human-readable label (not "Step X of Y")
13. **Animations** — slide-up + fade-in per step, collapse animation on completion

---

## ❌ What's NOT Done / Needs Work

### 1. Real OTP flow needs end-to-end testing
- `send-otp` and `verify-otp` endpoints are pending on backend
- Need to test with real endpoints once deployed

### 2. `registerAccount` final API hookup
- Currently calls `POST /b2b-api/user` (existing endpoint)
- May need `mobileVerificationToken` + `emailVerificationToken` in payload
- Test with real account creation once OTP endpoints live

### 3. City field in Company step
- Company address autocomplete uses Savaari `address-api` (not Google Maps)
- When GST provides address, it's locked — no autocomplete
- When GST skipped, autocomplete searches Savaari places API
- **Issue**: Savaari autocomplete may return city-level only, not street address — fallback textarea mode handled

### 4. GST step UX polish (Shivam feedback — deferred)
- "Good morning what if its company name?" — greeting check
- GST add/remove option after registration (account settings)

### 5. Registration API response mapping
- Backend `registerAccount` response format not confirmed
- Service has defensive mapping but needs real test

### 6. Error scenarios
- Phone already registered → specific error message
- Email already registered → specific error message
- Currently shows generic `result.message`

---

## 🔒 STRICT GUARD RAILS (NON-NEGOTIABLE)

1. **NO push/deploy/upload without fresh "push kar de" / "haan kar de" in current message**
2. **NO teammate names** (Shubhendu, Jibin, Alex, Bincy, Shivam) in code/comments/commits — use "backend team"
3. **NEVER upload proxy.php to alpha server** — alpha has its own managed proxy.php

---

## 🖥️ Dev Environment

```bash
ng serve          # Dev server port 4200 with proxy.conf.json
# Environments:
# - Dev/Local:  real beta APIs via proxy.conf.json
# - Alpha:      real alpha APIs via .htaccess + proxy.php

# Alpha production build:
ng build --configuration=production

# After editing, commit (NO push without approval):
git add <files>
git commit -m "feat/fix: description"
```

**Registration accessible at:** `http://localhost:4200/register`  
**Flag:** `environment.newRegistrationFlow: true`

---

## 📋 Alpha proxy.php note

Alpha's proxy.php is MISSING `/system-bookings-api` route — cancellation won't work on alpha until someone SSHs in and adds:
```php
} elseif (preg_match('#^/system-bookings-api/(.*)$#', $uri, $m)) {
    $target = 'https://api.betasavaari.com/system_bookings/' . $m[1];
```
**Do NOT upload repo's proxy.php to alpha — it routes payment-api to beta, breaking Razorpay.**

---

## 🏷️ Commit convention

```
feat: short description
fix: short description
```
**NEVER add Co-Authored-By in commits.**
