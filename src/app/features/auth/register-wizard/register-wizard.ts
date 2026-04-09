import { Component, inject, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { LandingNavbarComponent } from '../../landing/components/navbar/landing-navbar';
/** localStorage key shared with login page so it can pre-fill the freshly-registered email/password */
const PENDING_LOGIN_KEY = 'b2bcab.pendingLogin';

/**
 * Single-page progressive registration wizard (vercel demo flow).
 *
 * Steps reveal one at a time. Completed steps collapse into a compact
 * summary row with an "Edit" affordance. All API calls (OTP send/verify,
 * GST -> Surepass auto-fill) are mocked locally — no network traffic.
 *
 * Final submit performs a mock auto-login via AuthService and routes to
 * the dashboard.
 */
type StepKey = 'name' | 'contact' | 'gst' | 'pan' | 'company' | 'password';

@Component({
  selector: 'app-register-wizard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LucideAngularModule, LandingNavbarComponent],
  templateUrl: './register-wizard.html',
  styleUrl: './register-wizard.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterWizardComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  // Mock OTPs — fixed for demo so reviewers know what to type
  readonly MOCK_MOBILE_OTP = '1234';
  readonly MOCK_EMAIL_OTP = '5678';

  // Mock Surepass response when GST is provided
  readonly MOCK_SUREPASS_FROM_GST = {
    pan: 'AAACX1234F',
    companyName: 'ACME TRAVELS PRIVATE LIMITED',
    companyAddress: '12, MG ROAD, GROUND FLOOR, SHANTHALA NAGAR, ASHOK NAGAR, BENGALURU URBAN, BENGALURU, KARNATAKA - 560001, INDIA',
  };

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
  mobileOtp: string[] = ['', '', '', ''];
  emailOtp: string[] = ['', '', '', ''];
  mobileOtpError = '';
  emailOtpError = '';
  mobileOtpVerified = false;
  emailOtpVerified = false;
  sendingOtp = false;

  // ── Step 3: GST (optional) ──
  gstForm = this.fb.group({
    gstNumber: ['', [Validators.pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)]],
  });
  gstSkipped = false;
  gstLookupLoading = false;

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
    this.testimonialInterval = setInterval(() => {
      this.activeTestimonial = (this.activeTestimonial + 1) % this.testimonials.length;
      this.cdr.markForCheck();
    }, 4000);
  }

  ngOnDestroy(): void {
    if (this.testimonialInterval) clearInterval(this.testimonialInterval);
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
    const idx = this.STEP_ORDER.indexOf(this.currentStep);
    return `Step ${idx + 1} of ${this.STEP_ORDER.length}`;
  }

  private advanceTo(next: StepKey, completed: StepKey) {
    this.completedSteps.add(completed);
    this.currentStep = next;
    this.cdr.markForCheck();
    // Smooth scroll to the new active step on small screens
    setTimeout(() => {
      const el = document.getElementById('step-' + next);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }

  editStep(step: StepKey) {
    // Re-open a previously completed step for editing
    this.currentStep = step;
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
    this.cdr.markForCheck();

    setTimeout(() => {
      this.sendingOtp = false;
      this.contactPhase = 'otp';
      this.mobileOtp = ['', '', '', ''];
      this.emailOtp = ['', '', '', ''];
      this.mobileOtpError = '';
      this.emailOtpError = '';
      this.mobileOtpVerified = false;
      this.emailOtpVerified = false;
      this.cdr.markForCheck();
      // Focus first mobile OTP box
      setTimeout(() => {
        const el = document.querySelector<HTMLInputElement>('input[data-otp="mobile-0"]');
        el?.focus();
      }, 100);
    }, 600);
  }

  onOtpInput(event: Event, channel: 'mobile' | 'email', index: number) {
    const input = event.target as HTMLInputElement;
    const val = input.value.replace(/\D/g, '').slice(0, 1);
    input.value = val;
    const arr = channel === 'mobile' ? this.mobileOtp : this.emailOtp;
    arr[index] = val;
    if (val && index < 3) {
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
    const entered = arr.join('');
    const expected = channel === 'mobile' ? this.MOCK_MOBILE_OTP : this.MOCK_EMAIL_OTP;
    if (entered === expected) {
      if (channel === 'mobile') { this.mobileOtpVerified = true; this.mobileOtpError = ''; }
      else { this.emailOtpVerified = true; this.emailOtpError = ''; }
      // If both verified, advance
      if (this.mobileOtpVerified && this.emailOtpVerified) {
        setTimeout(() => {
          this.contactPhase = 'verified';
          this.advanceTo('gst', 'contact');
        }, 500);
      }
    } else {
      if (channel === 'mobile') this.mobileOtpError = 'Invalid OTP';
      else this.emailOtpError = 'Invalid OTP';
    }
  }

  resendOtps() {
    this.sendContactOtps();
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
    if (!gst) {
      // User chose to skip GST — go to manual PAN entry
      this.gstSkipped = true;
      this.panAutoFilled = false;
      this.companyAutoFilled = false;
      this.advanceTo('pan', 'gst');
      return;
    }
    if (this.gstForm.invalid) { this.gstForm.markAllAsTouched(); return; }

    // Mock Surepass lookup — auto-fills PAN, company name, company address
    this.gstLookupLoading = true;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.gstLookupLoading = false;
      this.gstSkipped = false;
      this.panForm.patchValue({ panNumber: this.MOCK_SUREPASS_FROM_GST.pan });
      this.companyForm.patchValue({
        companyName: this.MOCK_SUREPASS_FROM_GST.companyName,
        companyAddress: this.MOCK_SUREPASS_FROM_GST.companyAddress,
      });
      this.panAutoFilled = true;
      this.companyAutoFilled = true;
      this.completedSteps.add('pan'); // PAN already verified by GST
      this.advanceTo('company', 'gst');
    }, 900);
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

  submitCompany() {
    if (this.companyForm.invalid) { this.companyForm.markAllAsTouched(); return; }
    this.advanceTo('password', 'company');
  }

  // ── Step 6: Password + Submit ──

  submitPassword() {
    if (this.passwordForm.invalid) { this.passwordForm.markAllAsTouched(); return; }
    this.completedSteps.add('password');
    this.isSubmitting = true;
    this.cdr.markForCheck();

    // Stash the just-set credentials so the login page can pre-fill them.
    // Wizard does NOT auto-login — user is sent to /login to actually sign in.
    const email = this.contactForm.value.email || '';
    const password = this.passwordForm.value.password || '';
    try {
      localStorage.setItem(PENDING_LOGIN_KEY, JSON.stringify({ email, password }));
    } catch { /* localStorage may be disabled — fall through */ }

    // Mock account-creation delay, then route to login
    setTimeout(() => {
      this.isSubmitting = false;
      this.cdr.markForCheck();
      this.router.navigate(['/login'], { queryParams: { registered: '1' } });
    }, 800);
  }
}
