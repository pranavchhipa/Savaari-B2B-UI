import { Component, inject, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, FormsModule, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AutoCompleteModule, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { LucideAngularModule } from 'lucide-angular';
import { RegistrationService } from '../../../core/services/registration.service';
import { AddressAutocompleteService, AddressSuggestion } from '../../../core/services/address-autocomplete.service';

/** localStorage key shared with login page so it can pre-fill the freshly-registered email/password */
const PENDING_LOGIN_KEY = 'b2bcab.pendingLogin';

/** Resend-OTP cooldown in seconds — prevents rate-limit abuse. */
const RESEND_COOLDOWN_SECONDS = 30;

/** sessionStorage key — preserves wizard progress across page refresh. */
const WIZARD_STATE_KEY = 'b2bcab.registerWizardState';

/**
 * Multi-step registration wizard for B2B Cab Portal.
 *
 * Flow:
 *   Step 1 — Name (first + last)
 *   Step 2 — Contact (mobile + email, both OTP-verified)
 *   Step 3 — GST (optional, auto-fills PAN + company on success)
 *   Step 4 — PAN (only shown if GST was skipped or failed)
 *   Step 5 — Company (name + address; locked if auto-filled from GST)
 *   Step 6 — Password (+ confirm)
 *
 * All API calls go through RegistrationService which hits the alpha-hosted
 * registration endpoints (GST, OTP, register). Failures surface as user-facing
 * errors — no mock fallbacks.
 */
type StepKey = 'name' | 'contact' | 'gst' | 'pan' | 'company' | 'password';

@Component({
  selector: 'app-register-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, AutoCompleteModule, LucideAngularModule],
  templateUrl: './register-wizard.html',
  styleUrl: './register-wizard.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterWizardComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private registrationService = inject(RegistrationService);
  private addressAutocomplete = inject(AddressAutocompleteService);

  readonly STEP_ORDER: StepKey[] = ['name', 'contact', 'gst', 'pan', 'company', 'password'];
  currentStep: StepKey = 'name';
  completedSteps = new Set<StepKey>();

  // ── Step 1: Name ──
  nameForm = this.fb.group({
    firstName: ['', [Validators.required, Validators.maxLength(50), Validators.pattern(/^[a-zA-Z\s\-'.]+$/)]],
    lastName: ['', [Validators.required, Validators.maxLength(50), Validators.pattern(/^[a-zA-Z\s\-'.]+$/)]],
  });

  // ── Step 2: Contact (mobile + email + OTPs side by side) ──
  contactForm = this.fb.group({
    mobile: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
    email: ['', [Validators.required, Validators.email]],
  });
  contactPhase: 'entry' | 'otp' | 'verified' = 'entry';
  mobileOtp: string[] = ['', '', '', '', '', ''];
  emailOtp: string[] = ['', '', '', '', '', ''];
  mobileOtpError = '';
  emailOtpError = '';
  mobileOtpVerified = false;
  emailOtpVerified = false;
  sendingOtp = false;
  contactError = '';

  /** Per-channel verification tokens returned by the verify-otp API. */
  mobileVerificationToken = '';
  emailVerificationToken = '';

  /** Per-channel resend state — disables the button for RESEND_COOLDOWN_SECONDS. */
  mobileResendCooldown = 0;
  emailResendCooldown = 0;
  mobileResending = false;
  emailResending = false;
  private mobileCooldownInterval: any;
  private emailCooldownInterval: any;

  /** Per-channel OTP verification in-flight flags — prevents double-submit. */
  mobileVerifying = false;
  emailVerifying = false;

  // ── Step 3: GST (optional) ──
  gstForm = this.fb.group({
    gstNumber: ['', [Validators.pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)]],
  });
  gstSkipped = false;
  gstLookupLoading = false;
  gstError = '';

  // ── Step 4: PAN (auto-filled from GST or manual) ──
  panForm = this.fb.group({
    panNumber: ['', [Validators.required, Validators.pattern(/^[A-Z]{5}[0-9]{4}[A-Z]$/)]],
  });
  panAutoFilled = false;

  // ── Step 5: Company (name always uppercase) ──
  companyForm = this.fb.group({
    companyName: ['', [Validators.required, Validators.maxLength(100)]],
    companyAddress: ['', [Validators.required, Validators.minLength(10)]],
  });
  companyAutoFilled = false;

  /**
   * Skip-GST path only: Savaari address autocomplete state.
   *
   * When user skips GST verification they have to type their office address
   * manually. Rather than a free-text textarea we wire up the Savaari
   * autocomplete API (same Google Places dataset used by dashboard + booking)
   * so the agent gets real suggestions with lat/lng resolution.
   *
   * GST-filled path keeps the locked textarea — address comes from the
   * authoritative GST portal response and must not be editable.
   */
  companyAddressInput = '';                                         // Two-way ngModel bound to p-autoComplete
  filteredCompanyAddresses: AddressSuggestion[] = [];               // Current dropdown suggestions
  selectedCompanyPlaceDetails: { lat: number; lng: number; formatted_address: string; place_id: string; sublocality: string } | null = null;
  companyAddressFallbackMode = false;                               // true when API returns only city-level fallback (no exact street)
  companyAddressError = '';                                         // Inline validation error for skip-GST path
  companyAddressSearching = false;                                  // Shows loader in dropdown while API is in flight

  /** Resolved city/state for registration — populated from place_id API or GST address parsing */
  resolvedCity = '';
  resolvedState = '';
  resolvedCityId = 0;

  // ── Step 6: Password ──
  passwordForm = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(8), Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)]],
    confirmPassword: ['', Validators.required],
    rememberMe: [true],
  }, { validators: this.passwordMatchValidator });
  showPassword = false;
  showConfirmPassword = false;

  // Live password validation flags — drive the green checklist in the template
  get pwValue(): string { return this.passwordForm.get('password')?.value || ''; }
  get pwHasMinLength(): boolean { return this.pwValue.length >= 8; }
  get pwHasUpper(): boolean { return /[A-Z]/.test(this.pwValue); }
  get pwHasLower(): boolean { return /[a-z]/.test(this.pwValue); }
  get pwHasNumber(): boolean { return /\d/.test(this.pwValue); }

  isSubmitting = false;
  registerError = '';

  // ── Left-panel branding: testimonial carousel (matches old register page) ──
  testimonials = [
    { name: 'Rajesh Kumar', city: 'Mumbai', text: 'B2B CAB has transformed my travel agency. The commission structure is transparent and payouts are always on time.', rating: 5 },
    { name: 'Priya Sharma', city: 'Delhi', text: 'Zero cancellations means I never have to worry about letting my clients down. Best decision for my business.', rating: 5 },
    { name: 'Suresh Patel', city: 'Ahmedabad', text: 'I earn more with B2B CAB than any other platform. The dashboard makes managing bookings effortless.', rating: 4 },
    { name: 'Anita Verma', city: 'Bangalore', text: 'GST-ready invoices and instant booking confirmations. My clients love the professional service.', rating: 5 },
  ];
  activeTestimonial = 0;
  private testimonialInterval: any;

  ngOnInit(): void {
    this.restoreProgress();
    this.testimonialInterval = setInterval(() => {
      this.activeTestimonial = (this.activeTestimonial + 1) % this.testimonials.length;
      this.cdr.markForCheck();
    }, 4000);
  }

  ngOnDestroy(): void {
    if (this.testimonialInterval) clearInterval(this.testimonialInterval);
    if (this.mobileCooldownInterval) clearInterval(this.mobileCooldownInterval);
    if (this.emailCooldownInterval) clearInterval(this.emailCooldownInterval);
  }

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const pw = control.get('password')?.value;
    const cpw = control.get('confirmPassword')?.value;
    return !cpw || pw === cpw ? null : { mismatch: true };
  }

  // ── Step navigation helpers ──

  isCompleted(step: StepKey): boolean { return this.completedSteps.has(step); }
  isCurrent(step: StepKey): boolean { return this.currentStep === step; }
  isVisible(step: StepKey): boolean {
    return this.isCurrent(step) || this.isCompleted(step);
  }

  get progressPercent(): number {
    return (this.completedSteps.size / this.STEP_ORDER.length) * 100;
  }

  get progressLabel(): string {
    // Friendly, motivating stage text — never "Step X of Y" / "0%"
    const done = this.completedSteps.size;
    if (done === 0) return "Let's get you started";
    if (done === 1) return "Off to a great start";
    if (done === 2) return "Picking up speed";
    if (done === 3) return "Halfway there";
    if (done === 4) return "Almost done";
    if (done === 5) return "Just one more step";
    return "All set!";
  }

  private advanceTo(next: StepKey, completed: StepKey) {
    this.completedSteps.add(completed);
    this.currentStep = next;
    this.saveProgress();
    this.cdr.markForCheck();
    // Smooth scroll to the new active step on small screens
    setTimeout(() => {
      const el = document.getElementById('step-' + next);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }

  /**
   * Persist wizard progress to sessionStorage so a page refresh doesn't
   * lose everything. Called after every step completion.
   */
  private saveProgress() {
    try {
      const state = {
        currentStep: this.currentStep,
        completedSteps: [...this.completedSteps],
        nameForm: this.nameForm.value,
        contactForm: this.contactForm.value,
        contactPhase: this.contactPhase,
        mobileOtpVerified: this.mobileOtpVerified,
        emailOtpVerified: this.emailOtpVerified,
        gstForm: this.gstForm.value,
        gstSkipped: this.gstSkipped,
        panForm: this.panForm.value,
        panAutoFilled: this.panAutoFilled,
        companyForm: this.companyForm.value,
        companyAutoFilled: this.companyAutoFilled,
        companyAddressInput: this.companyAddressInput,
      };
      sessionStorage.setItem(WIZARD_STATE_KEY, JSON.stringify(state));
    } catch { /* sessionStorage may be disabled */ }
  }

  /**
   * Restore wizard progress from sessionStorage on page load.
   * Silently ignores corrupt / missing data — user just starts fresh.
   */
  private restoreProgress() {
    try {
      const raw = sessionStorage.getItem(WIZARD_STATE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);

      // Restore step navigation
      if (s.currentStep) this.currentStep = s.currentStep;
      if (Array.isArray(s.completedSteps)) {
        this.completedSteps = new Set(s.completedSteps as StepKey[]);
      }

      // Step 1 — Name
      if (s.nameForm) this.nameForm.patchValue(s.nameForm);

      // Step 2 — Contact (restore verified state but NOT OTP digits — they must re-verify if unfinished)
      if (s.contactForm) this.contactForm.patchValue(s.contactForm);
      if (s.contactPhase === 'verified') {
        this.contactPhase = 'verified';
        this.mobileOtpVerified = true;
        this.emailOtpVerified = true;
      } else {
        // If OTP wasn't fully verified, reset to entry phase — user needs fresh OTPs
        this.contactPhase = 'entry';
      }

      // Step 3 — GST
      if (s.gstForm) this.gstForm.patchValue(s.gstForm);
      if (s.gstSkipped != null) this.gstSkipped = s.gstSkipped;

      // Step 4 — PAN
      if (s.panForm) this.panForm.patchValue(s.panForm);
      if (s.panAutoFilled != null) this.panAutoFilled = s.panAutoFilled;

      // Step 5 — Company
      if (s.companyForm) this.companyForm.patchValue(s.companyForm);
      if (s.companyAutoFilled != null) this.companyAutoFilled = s.companyAutoFilled;
      if (s.companyAddressInput) this.companyAddressInput = s.companyAddressInput;

      this.cdr.markForCheck();
    } catch { /* corrupt data — start fresh */ }
  }

  /** Clear saved progress — called after successful registration. */
  private clearSavedProgress() {
    try { sessionStorage.removeItem(WIZARD_STATE_KEY); } catch { /* ignore */ }
  }

  editStep(step: StepKey) {
    // Save current form state BEFORE switching so edits to the current step aren't lost
    this.saveProgress();
    // Re-open a previously completed step for editing
    this.currentStep = step;
    // When re-opening company step in skip-GST mode, restore the autocomplete input
    // from the form so the user sees whatever they had typed/selected last time
    if (step === 'company' && !this.companyAutoFilled) {
      this.companyAddressInput = this.companyForm.value.companyAddress || '';
    }
    this.cdr.markForCheck();
  }

  // ── Step 1: Name ──

  submitName() {
    if (this.nameForm.invalid) { this.nameForm.markAllAsTouched(); return; }
    this.advanceTo('contact', 'name');
  }

  get fullName(): string {
    const f = this.nameForm.value.firstName || '';
    const l = this.nameForm.value.lastName || '';
    return `${f} ${l}`.trim();
  }

  // ── Step 2: Contact + OTPs ──

  sendContactOtps() {
    if (this.contactForm.invalid) { this.contactForm.markAllAsTouched(); return; }
    this.sendingOtp = true;
    this.contactError = '';
    this.cdr.markForCheck();

    const mobile = this.contactForm.value.mobile || '';
    const email = this.contactForm.value.email || '';

    this.registrationService.sendOtps(mobile, email).subscribe(result => {
      this.sendingOtp = false;

      if (!result.success) {
        this.contactError = result.errorMessage || 'Failed to send OTP. Please try again.';
        this.cdr.markForCheck();
        return;
      }

      // Reset OTP state and advance to OTP-entry phase
      this.contactPhase = 'otp';
      this.mobileOtp = ['', '', '', '', '', ''];
      this.emailOtp = ['', '', '', '', '', ''];
      this.mobileOtpError = '';
      this.emailOtpError = '';
      this.mobileOtpVerified = false;
      this.mobileVerificationToken = '';

      // If email OTP was not sent (backend doesn't support it), auto-verify email
      if (!result.emailOtpSent) {
        this.emailOtpVerified = true;
        this.emailVerificationToken = 'skipped';
      } else {
        this.emailOtpVerified = false;
        this.emailVerificationToken = '';
        this.startCooldown('email');
      }

      // Start cooldown for mobile
      this.startCooldown('mobile');

      this.cdr.markForCheck();
      // Focus first mobile OTP box
      setTimeout(() => {
        const el = document.querySelector<HTMLInputElement>('input[data-otp="mobile-0"]');
        el?.focus();
      }, 100);
    });
  }

  onOtpInput(event: Event, channel: 'mobile' | 'email', index: number) {
    const input = event.target as HTMLInputElement;
    const val = input.value.replace(/\D/g, '').slice(0, 1);
    input.value = val;
    const arr = channel === 'mobile' ? this.mobileOtp : this.emailOtp;
    arr[index] = val;
    if (val && index < 5) {
      const next = document.querySelector<HTMLInputElement>(`input[data-otp="${channel}-${index + 1}"]`);
      next?.focus();
    }
    this.tryVerifyChannel(channel);
    this.cdr.markForCheck();
  }

  onOtpKeydown(event: KeyboardEvent, channel: 'mobile' | 'email', index: number) {
    if (event.key === 'Backspace') {
      const arr = channel === 'mobile' ? this.mobileOtp : this.emailOtp;
      if (!arr[index] && index > 0) {
        arr[index - 1] = '';
        const prev = document.querySelector<HTMLInputElement>(`input[data-otp="${channel}-${index - 1}"]`);
        if (prev) { prev.value = ''; prev.focus(); }
      } else {
        arr[index] = '';
      }
      // Reset verified state if user edits a verified channel
      if (channel === 'mobile') { this.mobileOtpVerified = false; this.mobileOtpError = ''; }
      else { this.emailOtpVerified = false; this.emailOtpError = ''; }
      this.cdr.markForCheck();
    }
  }

  private tryVerifyChannel(channel: 'mobile' | 'email') {
    const arr = channel === 'mobile' ? this.mobileOtp : this.emailOtp;
    if (arr.some(d => d === '')) return;

    // Prevent re-verifying while a verify call is already in-flight
    if (channel === 'mobile' && this.mobileVerifying) return;
    if (channel === 'email' && this.emailVerifying) return;

    const entered = arr.join('');
    const contact = channel === 'mobile'
      ? (this.contactForm.value.mobile || '')
      : (this.contactForm.value.email || '');

    if (channel === 'mobile') this.mobileVerifying = true;
    else this.emailVerifying = true;
    this.cdr.markForCheck();

    this.registrationService.verifyOtp(channel, contact, entered).subscribe(result => {
      if (channel === 'mobile') this.mobileVerifying = false;
      else this.emailVerifying = false;

      if (result.verified && result.success) {
        if (channel === 'mobile') {
          this.mobileOtpVerified = true;
          this.mobileOtpError = '';
          this.mobileVerificationToken = result.verificationToken || '';
        } else {
          this.emailOtpVerified = true;
          this.emailOtpError = '';
          this.emailVerificationToken = result.verificationToken || '';
        }
        this.cdr.markForCheck();

        // If both verified, advance to next step
        if (this.mobileOtpVerified && this.emailOtpVerified) {
          setTimeout(() => {
            this.contactPhase = 'verified';
            this.advanceTo('gst', 'contact');
          }, 500);
        }
      } else {
        const errorMsg = result.errorMessage
          || (result.attemptsRemaining !== undefined
            ? `Invalid OTP. ${result.attemptsRemaining} attempts remaining.`
            : 'Invalid OTP');
        if (channel === 'mobile') this.mobileOtpError = errorMsg;
        else this.emailOtpError = errorMsg;
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Resend OTP for a single channel. Disabled while the cooldown is active.
   * Separate per-channel buttons avoid burning SMS cost / email quota when
   * only one of the two OTPs failed to arrive.
   */
  resendChannel(channel: 'mobile' | 'email') {
    // Block if cooldown still running or already resending
    const cooldown = channel === 'mobile' ? this.mobileResendCooldown : this.emailResendCooldown;
    const resending = channel === 'mobile' ? this.mobileResending : this.emailResending;
    if (cooldown > 0 || resending) return;

    const contact = channel === 'mobile'
      ? (this.contactForm.value.mobile || '')
      : (this.contactForm.value.email || '');
    if (!contact) return;

    if (channel === 'mobile') this.mobileResending = true;
    else this.emailResending = true;
    this.cdr.markForCheck();

    this.registrationService.resendOtp(channel, contact).subscribe(result => {
      if (channel === 'mobile') this.mobileResending = false;
      else this.emailResending = false;

      if (result.success) {
        // Clear the current OTP boxes so the user knows a fresh code was sent
        if (channel === 'mobile') {
          this.mobileOtp = ['', '', '', '', '', ''];
          this.mobileOtpError = '';
          this.mobileOtpVerified = false;
          this.mobileVerificationToken = '';
        } else {
          this.emailOtp = ['', '', '', '', '', ''];
          this.emailOtpError = '';
          this.emailOtpVerified = false;
          this.emailVerificationToken = '';
        }
        this.startCooldown(channel);
      } else {
        if (channel === 'mobile') {
          this.mobileOtpError = result.errorMessage || 'Failed to resend OTP';
        } else {
          this.emailOtpError = result.errorMessage || 'Failed to resend OTP';
        }
      }
      this.cdr.markForCheck();
    });
  }

  /** Start the cooldown countdown for a channel's resend button. */
  private startCooldown(channel: 'mobile' | 'email') {
    if (channel === 'mobile') {
      this.mobileResendCooldown = RESEND_COOLDOWN_SECONDS;
      if (this.mobileCooldownInterval) clearInterval(this.mobileCooldownInterval);
      this.mobileCooldownInterval = setInterval(() => {
        this.mobileResendCooldown--;
        if (this.mobileResendCooldown <= 0) {
          clearInterval(this.mobileCooldownInterval);
          this.mobileCooldownInterval = null;
        }
        this.cdr.markForCheck();
      }, 1000);
    } else {
      this.emailResendCooldown = RESEND_COOLDOWN_SECONDS;
      if (this.emailCooldownInterval) clearInterval(this.emailCooldownInterval);
      this.emailCooldownInterval = setInterval(() => {
        this.emailResendCooldown--;
        if (this.emailResendCooldown <= 0) {
          clearInterval(this.emailCooldownInterval);
          this.emailCooldownInterval = null;
        }
        this.cdr.markForCheck();
      }, 1000);
    }
  }

  editContact() {
    this.contactPhase = 'entry';
    this.mobileOtpVerified = false;
    this.emailOtpVerified = false;
    this.editStep('contact');
  }

  // ── Step 3: GST (optional) ──

  onGstInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const upper = input.value.toUpperCase();
    input.value = upper;
    this.gstForm.get('gstNumber')?.setValue(upper, { emitEvent: false });
  }

  submitGst() {
    const gst = (this.gstForm.value.gstNumber || '').trim();
    this.gstError = '';

    if (!gst) {
      // User chose to skip GST — go to manual PAN entry
      this.gstSkipped = true;
      this.panAutoFilled = false;
      this.companyAutoFilled = false;
      this.advanceTo('pan', 'gst');
      return;
    }
    if (this.gstForm.invalid) { this.gstForm.markAllAsTouched(); return; }

    // Real GST verification via alpha gst_verification.php
    this.gstLookupLoading = true;
    this.cdr.markForCheck();

    this.registrationService.verifyGst(gst).subscribe(result => {
      this.gstLookupLoading = false;

      if (!result.success) {
        this.gstError = result.errorMessage || 'Invalid GST Number. Please check and try again.';
        this.cdr.markForCheck();
        return;
      }

      // Auto-fill PAN + company details from GST API response
      this.gstSkipped = false;
      const pan = result.panNumber || '';
      const legalName = (result.legalName || result.businessName || '').toUpperCase();
      const address = result.address || '';

      this.panForm.patchValue({ panNumber: pan });
      this.companyForm.patchValue({
        companyName: legalName,
        companyAddress: address,
      });

      this.panAutoFilled = !!pan;
      this.companyAutoFilled = !!(legalName && address);

      // Extract city/state from GST address.
      //
      // GST addresses come in many shapes from gst_verification.php — common
      // patterns observed:
      //   "Bldg, Street, City, State, 411001"     (5 parts, last is pincode)
      //   "Bldg, Street, City, State"             (4 parts, no pincode)
      //   "Street, City, State"                   (3 parts)
      //   "City, State, 411001"                   (3 parts, last is pincode)
      //   "City, State"                           (2 parts, edge-case)
      //
      // Strategy: walk the parts from the end, skipping pincode-looking
      // tokens (6 digits) and country tokens ("India"), then read state then
      // city. This is more forgiving than the previous "parts.length >= 3"
      // gate which silently dropped 2-part addresses and let the registration
      // call go out with `agentCity: ''` -> backend 400 "AgentCityMissing".
      this.resolvedCity = '';
      this.resolvedState = '';
      if (address) {
        const parts = address.split(',').map((p: string) => p.trim()).filter((p: string) => p);
        // Filter out trailing pincode + "India" tokens
        const trimmed = [...parts];
        while (trimmed.length > 0) {
          const tail = trimmed[trimmed.length - 1];
          if (/^\d{6}$/.test(tail) || /^india$/i.test(tail)) {
            trimmed.pop();
          } else {
            break;
          }
        }
        if (trimmed.length >= 2) {
          this.resolvedState = trimmed[trimmed.length - 1] || '';
          this.resolvedCity = trimmed[trimmed.length - 2] || '';
        } else if (trimmed.length === 1) {
          // Single token left — treat as city, leave state for the user to confirm.
          this.resolvedCity = trimmed[0] || '';
        }
      }
      this.resolvedCityId = 0;

      // GST path historically left `resolvedCityId = 0`, which the backend
      // then rejected as "AgentCityMissing" (it requires a valid Savaari
      // city ID, not just the name). Auto-resolve via the Savaari
      // autocomplete -> place_id pipeline so the user doesn't have to do
      // anything extra. If this lookup fails, the pre-submit guard in
      // `submitPassword` will block submission with a clear error message.
      if (this.resolvedCity) {
        const lookupQuery = this.resolvedState
          ? `${this.resolvedCity}, ${this.resolvedState}`
          : this.resolvedCity;
        this.addressAutocomplete.searchAddress(lookupQuery, 'from').subscribe({
          next: (suggestions) => {
            const first = suggestions && suggestions.length > 0 ? suggestions[0] : null;
            if (!first?.place_id) return;
            this.addressAutocomplete.getPlaceDetails(first.place_id, 'from').subscribe({
              next: (details) => {
                if (details?.aliasSourceCityId) {
                  this.resolvedCityId = details.aliasSourceCityId;
                  // Prefer the canonical city/state from place_id over the
                  // free-form GST address split — keeps the registration
                  // payload aligned with the backend's city table.
                  if (details.city) this.resolvedCity = details.city;
                  if (details.state) this.resolvedState = details.state;
                  this.cdr.markForCheck();
                }
              },
              error: () => { /* swallow — pre-submit guard will catch */ },
            });
          },
          error: () => { /* swallow — pre-submit guard will catch */ },
        });
      }

      // Clear any stale autocomplete state from a previous skip-GST attempt
      this.companyAddressInput = '';
      this.filteredCompanyAddresses = [];
      this.selectedCompanyPlaceDetails = null;
      this.companyAddressFallbackMode = false;
      this.companyAddressError = '';

      // PAN step is implicitly completed when GST gives us a valid PAN
      if (this.panAutoFilled) this.completedSteps.add('pan');

      this.advanceTo('company', 'gst');
    });
  }

  // ── Step 4: PAN (only when GST skipped) ──

  onPanInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const upper = input.value.toUpperCase();
    input.value = upper;
    this.panForm.get('panNumber')?.setValue(upper, { emitEvent: false });
  }

  submitPan() {
    if (this.panForm.invalid) { this.panForm.markAllAsTouched(); return; }
    this.advanceTo('company', 'pan');
  }

  // ── Step 5: Company ──

  onCompanyNameInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const upper = input.value.toUpperCase();
    input.value = upper;
    this.companyForm.get('companyName')?.setValue(upper, { emitEvent: false });
  }

  /**
   * Fetch address suggestions from Savaari autocomplete API as user types.
   * Skip-GST path only. GST-filled path uses the locked textarea.
   */
  filterCompanyAddresses(event: AutoCompleteCompleteEvent) {
    const q = (event.query || '').trim();
    if (q.length < 3) {
      this.filteredCompanyAddresses = [];
      this.companyAddressSearching = false;
      this.cdr.markForCheck();
      return;
    }

    this.companyAddressSearching = true;
    this.cdr.markForCheck();

    this.addressAutocomplete.searchAddress(q, 'from').subscribe({
      next: (suggestions) => {
        this.filteredCompanyAddresses = suggestions;
        // Fallback mode = all results are city-level only (no exact street from Google)
        this.companyAddressFallbackMode = suggestions.length > 0 && suggestions.every((s) => s.isFallback);
        this.companyAddressSearching = false;
        // Keep the form field synced with whatever the user has typed so validators fire correctly
        this.companyForm.patchValue({ companyAddress: q }, { emitEvent: false });
        if (q.length >= 10) this.companyAddressError = '';
        this.cdr.markForCheck();
      },
      error: () => {
        this.filteredCompanyAddresses = [];
        this.companyAddressSearching = false;
        this.cdr.markForCheck();
      },
    });
  }

  /**
   * User picked a suggestion from the dropdown — resolve place details
   * (lat/lng/sublocality) via the Savaari place_id API. For city-level
   * fallback results we skip the place_id call since there's no exact street.
   */
  onCompanyAddressSelect(event: any) {
    const suggestion: AddressSuggestion = event.value || event;
    if (!suggestion) return;

    const addressString = suggestion.description || '';
    this.companyAddressInput = addressString;
    this.companyForm.patchValue({ companyAddress: addressString }, { emitEvent: false });
    this.companyAddressError = '';

    // Fallback suggestion → city-level only, no place_id API call
    if (suggestion.isFallback || !suggestion.place_id) {
      this.selectedCompanyPlaceDetails = null;
      this.cdr.markForCheck();
      return;
    }

    this.addressAutocomplete.getPlaceDetails(suggestion.place_id, 'from').subscribe({
      next: (details) => {
        if (details) {
          this.selectedCompanyPlaceDetails = {
            lat: details.lat,
            lng: details.lng,
            formatted_address: details.formatted_address || addressString,
            place_id: details.place_id,
            sublocality: details.sublocality || '',
          };
          // Store city/state for registration payload
          this.resolvedCity = details.city || '';
          this.resolvedState = details.state || '';
          this.resolvedCityId = details.aliasSourceCityId || 0;
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.selectedCompanyPlaceDetails = null;
        this.cdr.markForCheck();
      },
    });
  }

  /** Reset the autocomplete field — used from the clear (×) button. */
  clearCompanyAddress() {
    this.companyAddressInput = '';
    this.selectedCompanyPlaceDetails = null;
    this.companyAddressFallbackMode = false;
    this.filteredCompanyAddresses = [];
    this.companyAddressError = '';
    this.companyForm.patchValue({ companyAddress: '' }, { emitEvent: false });
    this.cdr.markForCheck();
  }

  submitCompany() {
    // Company name is required in both flows — GST-filled or manual
    if (this.companyForm.get('companyName')?.invalid) {
      this.companyForm.get('companyName')?.markAsTouched();
      this.cdr.markForCheck();
      return;
    }

    if (this.companyAutoFilled) {
      // GST path — address comes from GST API and is locked; full form validation applies
      if (this.companyForm.invalid) { this.companyForm.markAllAsTouched(); return; }
    } else {
      // Skip-GST path — validate the autocomplete input manually
      const addr = (this.companyAddressInput || '').trim();
      if (!addr) {
        this.companyAddressError = 'Please enter your office address.';
        this.cdr.markForCheck();
        return;
      }
      if (addr.length < 10) {
        this.companyAddressError = 'Address looks too short — please include building, street, city and PIN.';
        this.cdr.markForCheck();
        return;
      }
      this.companyAddressError = '';
      // Commit the typed/selected value to the form so downstream submit (submitPassword) picks it up
      this.companyForm.patchValue({ companyAddress: addr }, { emitEvent: false });
    }

    this.advanceTo('password', 'company');
  }

  // ── Step 6: Password + Submit ──

  submitPassword() {
    if (this.passwordForm.invalid) { this.passwordForm.markAllAsTouched(); return; }

    // Safety guard: ensure name is present (could be lost if user edited step 1 mid-flow)
    const firstName = (this.nameForm.value.firstName || '').trim();
    const lastName = (this.nameForm.value.lastName || '').trim();
    if (!firstName && !lastName) {
      this.registerError = 'Name is missing — please go back to Step 1 and enter your name.';
      this.cdr.markForCheck();
      return;
    }

    // Safety guard: ensure resolvedCity is present. Without it the backend
    // returns 400 "AgentCityMissing". Empties happen when:
    //   • GST API returns an address that splits into fewer than 2 parts
    //   • User skipped GST and never picked a place_id from the company
    //     address autocomplete (the form lets them keep typing free text)
    // Either way we surface a clear message instead of letting the API
    // call go out and fail opaquely.
    if (!this.resolvedCity) {
      this.registerError = 'Please go back to the company step and pick your city from the address suggestions — we could not detect it automatically.';
      this.cdr.markForCheck();
      return;
    }

    this.isSubmitting = true;
    this.registerError = '';
    this.cdr.markForCheck();

    const payload = {
      firstName,
      lastName,
      mobile: this.contactForm.value.mobile || '',
      email: this.contactForm.value.email || '',
      countryCode: '91',
      gstNumber: (this.gstForm.value.gstNumber || '').trim(),
      panNumber: (this.panForm.value.panNumber || '').trim(),
      companyName: (this.companyForm.value.companyName || '').trim(),
      companyAddress: (this.companyForm.value.companyAddress || '').trim(),
      password: this.passwordForm.value.password || '',
      mobileVerificationToken: this.mobileVerificationToken,
      emailVerificationToken: this.emailVerificationToken,
      agentCity: this.resolvedCity,
      agentState: this.resolvedState,
      agentCityId: this.resolvedCityId,
    };

    this.registrationService.registerAccount(payload).subscribe(result => {
      this.isSubmitting = false;

      if (!result.success) {
        this.registerError = result.message || 'Registration failed. Please try again.';
        this.cdr.markForCheck();
        return;
      }

      this.completedSteps.add('password');
      this.clearSavedProgress();

      // Stash the just-set credentials so the login page can pre-fill them.
      // Wizard does NOT auto-login — user is sent to /login to actually sign in.
      try {
        localStorage.setItem(PENDING_LOGIN_KEY, JSON.stringify({
          email: payload.email,
          password: payload.password,
        }));
      } catch { /* localStorage may be disabled — fall through */ }

      this.cdr.markForCheck();
      this.router.navigate(['/login'], { queryParams: { registered: '1' } });
    });
  }
}
