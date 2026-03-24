import { Component, inject, ChangeDetectionStrategy, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { FooterComponent } from '../../components/layout/footer/footer';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { decodeGSTIN, isValidGSTIN, isValidPAN, GSTINDecodeResult } from '../../core/utils/gstin-decoder';

type AccountSection = 'personal' | 'password';

@Component({
  selector: 'app-account-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, FooterComponent],
  templateUrl: './account-settings.html',
  styleUrl: './account-settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccountSettingsComponent implements OnInit {
  activeSection: AccountSection = 'personal';
  private router = inject(Router);
  private location = inject(Location);
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private cdr = inject(ChangeDetectorRef);

  // Personal Info model — populated from login response stored in localStorage
  profile = {
    title: '',
    fullName: '',
    lastName: '',
    companyName: '',
    email: '',
    companyAddress: '',
    gstNumber: '',
    city: '',
    mobile: '',
    phone: '',
    panNumber: '',
    websiteAddress: '',
    otherEmails: '',
    otherPhone: '',
    logoFile: null as File | null
  };

  logoPreview: string | null = null;

  // Password model
  passwords = {
    current: '',
    newPass: '',
    confirm: ''
  };

  passwordError = '';
  passwordSuccess = false;
  profileSuccess = false;
  profileError = '';
  isSaving = false;

  // GST update state
  isEditingGst = false;
  gstSaving = false;
  gstSuccess = false;
  /** True when GST was already saved in profile — cannot be changed by agent */
  gstLocked = false;
  gstError = '';
  gstDecodedInfo: GSTINDecodeResult | null = null;

  /** True when PAN was already saved — cannot be changed by agent */
  panLocked = false;
  isPanValid = true;
  gstPanMismatch = false;

  /** Auto-uppercase and validate PAN as user types */
  onPanNumberInput(): void {
    const clean = (this.profile.panNumber || '').toUpperCase().trim();
    this.profile.panNumber = clean;
    if (clean.length === 10) {
      this.isPanValid = isValidPAN(clean);
    } else {
      this.isPanValid = true; // Don't show error while typing
    }
    // Re-validate GST-PAN match if GSTIN is already entered
    this.validateGstPanMatch();
    this.cdr.markForCheck();
  }

  /** Auto-decode GSTIN as user types in account settings */
  onGstNumberInput(): void {
    const clean = (this.profile.gstNumber || '').toUpperCase().trim();
    this.profile.gstNumber = clean;
    if (clean.length === 15) {
      this.gstDecodedInfo = decodeGSTIN(clean);
    } else {
      this.gstDecodedInfo = null;
    }
    // Validate GST-PAN match
    this.validateGstPanMatch();
    this.cdr.markForCheck();
  }

  /** Cross-validate: PAN embedded in GSTIN (chars 3-12) must match profile PAN */
  private validateGstPanMatch(): void {
    this.gstPanMismatch = false;
    const pan = (this.profile.panNumber || '').toUpperCase().trim();
    const gst = (this.profile.gstNumber || '').toUpperCase().trim();
    if (pan.length === 10 && gst.length === 15) {
      const gstPan = gst.substring(2, 12); // Extract PAN from GSTIN
      if (gstPan !== pan) {
        this.gstPanMismatch = true;
      }
    }
  }

  ngOnInit() {
    this.loadProfileFromAuth();
    this.logoPreview = localStorage.getItem('agentLogo');
  }

  private loadProfileFromAuth() {
    const user = this.auth.getUserProfile();
    if (user) {
      this.profile = {
        title: (user as any).title || 'Mr.',
        fullName: (user as any).firstname || '',
        lastName: (user as any).lastname || '',
        companyName: (user as any).companyname || '',
        email: user.email || '',
        companyAddress: (user as any).billingaddress || '',
        gstNumber: (user as any).gst_number || this.auth.getGstNumber() || '',
        city: (user as any).city || '',
        mobile: (user as any).mobileno || '',
        phone: user.phone || '',
        panNumber: (user as any).pan_number || '',
        websiteAddress: (user as any).websiteaddress || '',
        otherEmails: (user as any).other_emails || '',
        otherPhone: (user as any).other_phone || '',
        logoFile: null,
      };
      // Lock GST field if already saved — agent must contact support to change
      this.gstLocked = !!this.profile.gstNumber;
      if (this.gstLocked) {
        this.gstDecodedInfo = decodeGSTIN(this.profile.gstNumber);
      }
      // Lock PAN field if already saved — agent must contact support to change
      this.panLocked = !!this.profile.panNumber;
    }
  }

  private readonly ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  private readonly MAX_LOGO_SIZE = 1024 * 1024; // 1 MB
  logoError = '';

  onLogoSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    this.logoError = '';
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];

    // Validate file type
    if (!this.ALLOWED_IMAGE_TYPES.includes(file.type)) {
      this.logoError = 'Only PNG, JPEG, WebP, or GIF images are allowed.';
      input.value = '';
      this.cdr.markForCheck();
      return;
    }

    // Validate file size
    if (file.size > this.MAX_LOGO_SIZE) {
      this.logoError = 'Logo must be under 1 MB.';
      input.value = '';
      this.cdr.markForCheck();
      return;
    }

    this.profile.logoFile = file;
    const reader = new FileReader();
    reader.onload = e => {
      this.logoPreview = e.target?.result as string;
      if (this.logoPreview) {
        localStorage.setItem('agentLogo', this.logoPreview);
      }
      this.cdr.markForCheck();
    };
    reader.readAsDataURL(file);
  }

  removeLogo() {
    this.logoPreview = null;
    this.profile.logoFile = null;
    localStorage.removeItem('agentLogo');
    this.cdr.markForCheck();
  }

  /** Strip HTML tags and trim whitespace from user input */
  private sanitize(value: string): string {
    return (value || '').replace(/<[^>]*>/g, '').trim();
  }

  /** Validate PAN format: ABCDE1234F (uses shared util) */
  private isValidPAN(pan: string): boolean {
    return !pan || isValidPAN(pan);
  }

  /** Validate GST format: 22AAAAA0000A1Z5 (uses shared util) */
  private isValidGST(gst: string): boolean {
    return !gst || isValidGSTIN(gst);
  }

  updateProfile() {
    this.profileSuccess = false;
    this.profileError = '';

    // Validate PAN/GST formats
    if (this.profile.panNumber && !this.isValidPAN(this.profile.panNumber)) {
      this.profileError = 'Invalid PAN format (e.g. ABCDE1234F)';
      this.cdr.markForCheck();
      return;
    }
    if (this.profile.gstNumber && !this.isValidGST(this.profile.gstNumber)) {
      this.profileError = 'Invalid GST format (e.g. 22AAAAA0000A1Z5)';
      this.cdr.markForCheck();
      return;
    }

    // Cross-validate: PAN in GSTIN must match profile PAN
    if (this.profile.panNumber && this.profile.gstNumber) {
      this.validateGstPanMatch();
      if (this.gstPanMismatch) {
        this.profileError = 'PAN mismatch — the PAN in your GSTIN does not match your profile PAN. Please verify and correct.';
        this.cdr.markForCheck();
        return;
      }
    }

    this.isSaving = true;
    this.cdr.markForCheck();

    // POST /user/update-profile with form data (confirmed from beta site)
    const payload = {
      userName: this.sanitize(this.profile.fullName),
      userEmail: this.sanitize(this.profile.email),
      userPhone: this.sanitize(this.profile.phone),
      agentCompanyName: this.sanitize(this.profile.companyName),
      agentCompanyAddress: this.sanitize(this.profile.companyAddress),
      agentCity: this.sanitize(this.profile.city),
      agentState: '',
      agentcityId: 0,
      agentPAN: this.sanitize(this.profile.panNumber).toUpperCase(),
      agentGST: this.sanitize(this.profile.gstNumber).toUpperCase(),
      token: this.auth.getB2bToken(),
      isAgent: true,
    };

    this.api.b2bPostForm<any>('user/update-profile', payload).subscribe({
      next: (response) => {
        this.isSaving = false;
        if (response?.statusCode === 200) {
          this.profileSuccess = true;
          // Update localStorage with new data
          const currentUser = this.auth.getUserProfile();
          if (currentUser) {
            Object.assign(currentUser, {
              firstname: this.profile.fullName,
              lastname: this.profile.lastName,
              companyname: this.profile.companyName,
              billingaddress: this.profile.companyAddress,
              city: this.profile.city,
              phone: this.profile.phone,
              mobileno: this.profile.mobile,
              pan_number: this.profile.panNumber,
            });
            localStorage.setItem('loggedUserDetail', JSON.stringify(currentUser));
          }
          setTimeout(() => {
            this.profileSuccess = false;
            this.cdr.markForCheck();
          }, 3000);
        } else {
          this.profileError = response?.message || 'Failed to update profile.';
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isSaving = false;
        this.profileError = err?.error?.message || 'Failed to update profile. Please try again.';
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Update GST number via Partner API.
   * POST /update_gst (per workflow documentation)
   */
  updateGst() {
    if (!this.profile.gstNumber.trim()) {
      this.gstError = 'Please enter a valid GST number.';
      return;
    }

    this.gstSaving = true;
    this.gstError = '';
    this.gstSuccess = false;
    this.cdr.markForCheck();

    const token = this.auth.getPartnerToken();
    this.api.partnerPostForm<any>('update_gst', {
      gst_number: this.profile.gstNumber.trim(),
      userEmail: this.profile.email,
    }, { token: token ?? '' }).subscribe({
      next: (response) => {
        this.gstSaving = false;
        if (response?.status === 'success' || response?.statusCode === 200) {
          this.gstSuccess = true;
          this.isEditingGst = false;
          setTimeout(() => {
            this.gstSuccess = false;
            this.cdr.markForCheck();
          }, 3000);
        } else {
          this.gstError = response?.message || 'Failed to update GST number.';
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.gstSaving = false;
        this.gstError = err?.error?.message || err?.message || 'Failed to update GST number. Please try again.';
        this.cdr.markForCheck();
      }
    });
  }

  changePassword() {
    this.passwordError = '';
    this.passwordSuccess = false;
    if (!this.passwords.current) {
      this.passwordError = 'Please enter your current password.';
      return;
    }
    if (this.passwords.newPass.length < 8) {
      this.passwordError = 'New password must be at least 8 characters.';
      return;
    }
    if (this.passwords.newPass !== this.passwords.confirm) {
      this.passwordError = 'New passwords do not match.';
      return;
    }

    this.isSaving = true;
    this.cdr.markForCheck();

    // POST /user/change-password
    const payload = {
      userEmail: this.profile.email,
      token: this.auth.getB2bToken(),
      currentPassword: this.passwords.current,
      newPassword: this.passwords.newPass,
    };

    this.api.b2bPost<any>('user/change-password', payload).subscribe({
      next: (response) => {
        this.isSaving = false;
        if (response?.statusCode === 200) {
          this.passwordSuccess = true;
          this.passwords = { current: '', newPass: '', confirm: '' };
          setTimeout(() => {
            this.passwordSuccess = false;
            this.cdr.markForCheck();
          }, 3000);
        } else {
          this.passwordError = response?.message || 'Failed to change password.';
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isSaving = false;
        this.passwordError = err?.error?.message || 'Failed to change password. Please try again.';
        this.cdr.markForCheck();
      }
    });
  }

  goBack() {
    this.location.back();
  }
}
