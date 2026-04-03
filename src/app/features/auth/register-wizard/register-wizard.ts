import { Component, inject, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { LandingNavbarComponent } from '../../landing/components/navbar/landing-navbar';
import { AuthService } from '../../../core/services/auth.service';
import { WalletService } from '../../../core/services/wallet.service';
import { City } from '../../../core/models';

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
  private authService = inject(AuthService);
  private walletService = inject(WalletService);

  currentStep = 1;

  // ── Step 1: Name ──
  nameForm = this.fb.group({
    firstName: ['', [Validators.required, Validators.maxLength(50), Validators.pattern(/^[a-zA-Z\s\-'.]+$/)]],
    lastName: ['', [Validators.required, Validators.maxLength(50), Validators.pattern(/^[a-zA-Z\s\-'.]+$/)]],
  });

  // ── Step 2: Phone + OTP ──
  phoneForm = this.fb.group({
    phone: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
  });
  otpSent = false;
  otpDigits: string[] = ['', '', '', '', '', ''];
  otpVerified = false;
  otpVerifying = false;
  otpTimer = 0;
  sendingOtp = false;
  private otpTimerInterval: any;

  // ── Step 4: Company ──
  companyForm = this.fb.group({
    companyName: ['', [Validators.required, Validators.maxLength(100)]],
    companyCity: ['', Validators.required],
  });
  allCities: City[] = [];
  filteredCities: City[] = [];
  showCityDropdown = false;
  selectedCityId = 0;

  // ── Step 5: Documents ──
  docsForm = this.fb.group({
    panNumber: ['', [Validators.required, Validators.pattern(/^[A-Z]{5}[0-9]{4}[A-Z]$/)]],
    gstNumber: [''],
  });

  // ── Step 6: Credentials ──
  credentialsForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)]],
    confirmPassword: ['', Validators.required],
  }, { validators: this.passwordMatchValidator });
  showPassword = false;
  showConfirmPassword = false;

  isLoading = false;

  ngOnInit() {
    this.allCities = [
      { id: 377, name: 'Bangalore, Karnataka', cityOnly: 'Bangalore', state: 'Karnataka' },
      { id: 145, name: 'New Delhi, Delhi', cityOnly: 'New Delhi', state: 'Delhi' },
      { id: 114, name: 'Mumbai, Maharashtra', cityOnly: 'Mumbai', state: 'Maharashtra' },
      { id: 81, name: 'Chennai, Tamil Nadu', cityOnly: 'Chennai', state: 'Tamil Nadu' },
      { id: 178, name: 'Hyderabad, Telangana', cityOnly: 'Hyderabad', state: 'Telangana' },
      { id: 263, name: 'Pune, Maharashtra', cityOnly: 'Pune', state: 'Maharashtra' },
      { id: 191, name: 'Jaipur, Rajasthan', cityOnly: 'Jaipur', state: 'Rajasthan' },
      { id: 210, name: 'Kolkata, West Bengal', cityOnly: 'Kolkata', state: 'West Bengal' },
      { id: 7, name: 'Ahmedabad, Gujarat', cityOnly: 'Ahmedabad', state: 'Gujarat' },
      { id: 152, name: 'Goa, Goa', cityOnly: 'Goa', state: 'Goa' },
      { id: 214, name: 'Kochi, Kerala', cityOnly: 'Kochi', state: 'Kerala' },
      { id: 222, name: 'Lucknow, Uttar Pradesh', cityOnly: 'Lucknow', state: 'Uttar Pradesh' },
      { id: 84, name: 'Chandigarh, Chandigarh', cityOnly: 'Chandigarh', state: 'Chandigarh' },
      { id: 90, name: 'Coimbatore, Tamil Nadu', cityOnly: 'Coimbatore', state: 'Tamil Nadu' },
      { id: 237, name: 'Mysore, Karnataka', cityOnly: 'Mysore', state: 'Karnataka' },
      { id: 379, name: 'Udaipur, Rajasthan', cityOnly: 'Udaipur', state: 'Rajasthan' },
      { id: 300, name: 'Shimla, Himachal Pradesh', cityOnly: 'Shimla', state: 'Himachal Pradesh' },
      { id: 380, name: 'Visakhapatnam, Andhra Pradesh', cityOnly: 'Visakhapatnam', state: 'Andhra Pradesh' },
      { id: 186, name: 'Indore, Madhya Pradesh', cityOnly: 'Indore', state: 'Madhya Pradesh' },
      { id: 231, name: 'Manali, Himachal Pradesh', cityOnly: 'Manali', state: 'Himachal Pradesh' },
    ];
    this.filteredCities = this.allCities.slice(0, 20);
  }

  ngOnDestroy() {
    if (this.otpTimerInterval) clearInterval(this.otpTimerInterval);
  }

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const pw = control.get('password')?.value;
    const cpw = control.get('confirmPassword')?.value;
    return pw === cpw ? null : { mismatch: true };
  }

  // ── Progress ──

  get progressPercent(): number {
    if (this.currentStep <= 2) return (this.currentStep / 2) * 100;
    if (this.currentStep >= 4 && this.currentStep <= 6) return ((this.currentStep - 3) / 3) * 100;
    return 100;
  }

  get showProgress(): boolean {
    return this.currentStep !== 3 && this.currentStep !== 7;
  }

  get progressLabel(): string {
    if (this.currentStep <= 2) return `Step ${this.currentStep} of 2`;
    if (this.currentStep >= 4 && this.currentStep <= 6) return `Step ${this.currentStep - 3} of 3`;
    return '';
  }

  goToStep(step: number) {
    this.currentStep = step;
    this.cdr.markForCheck();
  }

  // ── Step 1: Name ──

  onNameContinue() {
    if (this.nameForm.invalid) { this.nameForm.markAllAsTouched(); return; }
    this.goToStep(2);
  }

  // ── Step 2: Phone + OTP ──

  sendOtp() {
    if (this.phoneForm.invalid) { this.phoneForm.markAllAsTouched(); return; }
    this.sendingOtp = true;
    this.cdr.markForCheck();

    // Mock: simulate sending OTP
    setTimeout(() => {
      this.sendingOtp = false;
      this.otpSent = true;
      this.otpTimer = 30;
      this.cdr.markForCheck();

      this.otpTimerInterval = setInterval(() => {
        this.otpTimer--;
        if (this.otpTimer <= 0) clearInterval(this.otpTimerInterval);
        this.cdr.markForCheck();
      }, 1000);

      // Mock: auto-fill OTP after short delay
      setTimeout(() => {
        this.otpDigits = ['1', '2', '3', '4', '5', '6'];
        this.cdr.markForCheck();
        setTimeout(() => this.verifyOtp(), 600);
      }, 1200);
    }, 800);
  }

  onOtpInput(event: Event, index: number) {
    const input = event.target as HTMLInputElement;
    const val = input.value;
    if (val.length === 1 && /^[0-9]$/.test(val)) {
      this.otpDigits[index] = val;
      const parent = input.parentElement;
      if (parent && index < 5) (parent.children[index + 1] as HTMLInputElement)?.focus();
    } else {
      input.value = this.otpDigits[index] || '';
    }
    this.cdr.markForCheck();
  }

  onOtpKeydown(event: KeyboardEvent, index: number) {
    if (event.key === 'Backspace') {
      if (!this.otpDigits[index] && index > 0) {
        const parent = (event.target as HTMLInputElement).parentElement;
        if (parent) {
          this.otpDigits[index - 1] = '';
          const prev = parent.children[index - 1] as HTMLInputElement;
          prev.value = '';
          prev.focus();
        }
      } else {
        this.otpDigits[index] = '';
      }
      this.cdr.markForCheck();
    }
  }

  onOtpPaste(event: ClipboardEvent) {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text')?.replace(/\D/g, '').slice(0, 6) || '';
    for (let i = 0; i < 6; i++) this.otpDigits[i] = pasted[i] || '';
    this.cdr.markForCheck();
    if (this.isOtpComplete()) setTimeout(() => this.verifyOtp(), 300);
  }

  isOtpComplete(): boolean {
    return this.otpDigits.every(d => /^[0-9]$/.test(d));
  }

  verifyOtp() {
    if (!this.isOtpComplete()) return;
    this.otpVerifying = true;
    this.cdr.markForCheck();

    setTimeout(() => {
      this.otpVerifying = false;
      this.otpVerified = true;
      this.cdr.markForCheck();
      setTimeout(() => this.goToStep(3), 700);
    }, 500);
  }

  resendOtp() {
    if (this.otpTimer > 0) return;
    this.otpDigits = ['', '', '', '', '', ''];
    this.otpSent = false;
    this.otpVerified = false;
    this.sendOtp();
  }

  // ── Step 3: Decision ──

  goToDashboard() {
    this.isLoading = true;
    this.cdr.markForCheck();
    this.authService.login('mock@savaari.com', 'mock').subscribe({
      next: () => { this.walletService.loadBalance(); this.router.navigate(['/dashboard']); },
      error: () => this.router.navigate(['/dashboard'])
    });
  }

  startTrustedPartner() { this.goToStep(4); }

  // ── Step 4: Company + City ──

  filterCities(event: Event) {
    const q = (event.target as HTMLInputElement).value.toLowerCase();
    if (!q) {
      this.filteredCities = this.allCities.slice(0, 20);
    } else {
      const prefix = this.allCities.filter(c => (c.cityOnly || c.name).toLowerCase().startsWith(q));
      const sub = this.allCities.filter(c => !prefix.includes(c) && c.name.toLowerCase().includes(q));
      this.filteredCities = [...prefix, ...sub].slice(0, 20);
    }
    this.showCityDropdown = true;
    this.cdr.markForCheck();
  }

  selectCity(city: City) {
    this.companyForm.patchValue({ companyCity: city.name });
    this.selectedCityId = city.id;
    this.showCityDropdown = false;
    this.cdr.markForCheck();
  }

  onCityFocus() {
    this.filteredCities = this.allCities.slice(0, 20);
    this.showCityDropdown = true;
    this.cdr.markForCheck();
  }

  onCityBlur() {
    setTimeout(() => { this.showCityDropdown = false; this.cdr.markForCheck(); }, 200);
  }

  onCompanyContinue() {
    if (this.companyForm.invalid) { this.companyForm.markAllAsTouched(); return; }
    this.goToStep(5);
  }

  // ── Step 5: Documents ──

  onPanInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const upper = input.value.toUpperCase();
    input.value = upper;
    this.docsForm.get('panNumber')?.setValue(upper, { emitEvent: false });
  }

  onGstInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const upper = input.value.toUpperCase();
    input.value = upper;
    this.docsForm.get('gstNumber')?.setValue(upper, { emitEvent: false });
  }

  onDocsContinue() {
    if (this.docsForm.get('panNumber')?.invalid) { this.docsForm.markAllAsTouched(); return; }
    this.goToStep(6);
  }

  skipDocs() { this.goToStep(6); }

  // ── Step 6: Credentials ──

  onCredentialsContinue() {
    if (this.credentialsForm.invalid) { this.credentialsForm.markAllAsTouched(); return; }
    this.goToStep(7);
  }

  // ── Step 7: Done ──

  finishAndGoDashboard() { this.goToDashboard(); }
}
