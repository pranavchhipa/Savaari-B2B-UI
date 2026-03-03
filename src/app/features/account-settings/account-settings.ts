import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { FooterComponent } from '../../components/layout/footer/footer';

type AccountSection = 'personal' | 'password';

@Component({
  selector: 'app-account-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, FooterComponent],
  templateUrl: './account-settings.html',
  styleUrl: './account-settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccountSettingsComponent {
  activeSection: AccountSection = 'personal';
  private location = inject(Location);

  // Personal Info model
  profile = {
    fullName: 'Bincy Joseph',
    companyName: 'WST',
    email: 'bincy.joseph@savaari.com',
    companyAddress: "test's comp.",
    gstNumber: '29AAACS8577K3ZJ',
    city: 'Delhi',
    mobile: '9446863277',
    panNumber: '1234567890',
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

  onLogoSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.profile.logoFile = input.files[0];
      const reader = new FileReader();
      reader.onload = e => this.logoPreview = e.target?.result as string;
      reader.readAsDataURL(input.files[0]);
    }
  }

  updateProfile() {
    this.profileSuccess = true;
    setTimeout(() => this.profileSuccess = false, 3000);
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
    this.passwordSuccess = true;
    this.passwords = { current: '', newPass: '', confirm: '' };
    setTimeout(() => this.passwordSuccess = false, 3000);
  }

  goBack() {
    this.location.back();
  }
}
