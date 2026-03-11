import { Component, inject, ChangeDetectionStrategy, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { FooterComponent } from '../../components/layout/footer/footer';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';

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
  gstError = '';

  ngOnInit() {
    this.loadProfileFromAuth();
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
        gstNumber: '', // GST comes from commission API, not user profile
        city: (user as any).city || '',
        mobile: (user as any).mobileno || '',
        phone: user.phone || '',
        panNumber: (user as any).pan_number || '',
        websiteAddress: (user as any).websiteaddress || '',
        otherEmails: (user as any).other_emails || '',
        otherPhone: (user as any).other_phone || '',
        logoFile: null,
      };
    }
  }

  onLogoSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.profile.logoFile = input.files[0];
      const reader = new FileReader();
      reader.onload = e => {
        this.logoPreview = e.target?.result as string;
        this.cdr.markForCheck();
      };
      reader.readAsDataURL(input.files[0]);
    }
  }

  updateProfile() {
    this.profileSuccess = false;
    this.profileError = '';
    this.isSaving = true;
    this.cdr.markForCheck();

    // POST /user/update-profile to update profile (per workflow doc)
    const payload = {
      userEmail: this.profile.email,
      token: this.auth.getB2bToken(),
      title: this.profile.title,
      firstname: this.profile.fullName,
      lastname: this.profile.lastName,
      companyname: this.profile.companyName,
      billingaddress: this.profile.companyAddress,
      city: this.profile.city,
      phone: this.profile.phone,
      mobileno: this.profile.mobile,
      pan_number: this.profile.panNumber,
      websiteaddress: this.profile.websiteAddress,
      other_emails: this.profile.otherEmails,
      other_phone: this.profile.otherPhone,
    };

    this.api.b2bPost<any>('user/update-profile', payload).subscribe({
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
