import { Component, inject, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { FooterComponent } from '../../../components/layout/footer/footer';
import { AuthService } from '../../../core/services/auth.service';
import { WalletService } from '../../../core/services/wallet.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LucideAngularModule, FooterComponent],
  templateUrl: './login.html',
  styleUrl: './login.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private auth = inject(AuthService);
  private walletService = inject(WalletService);

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(100)]],
    password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(128)]],
    rememberMe: [false]
  });

  isLoading = signal(false);
  errorMessage = signal('');
  showPassword = signal(false);

  onSubmit() {
    if (!this.loginForm.valid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const { email, password } = this.loginForm.value;
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.auth.login(email!, password!).subscribe({
      next: (user) => {
        if (!environment.production) console.log('[Login] Success for', user.email);
        this.isLoading.set(false);
        // Load wallet balance immediately after login so header shows correct amount
        this.walletService.loadBalance();
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        console.error('[Login] Failed:', err);
        this.isLoading.set(false);
        this.errorMessage.set(
          err?.error?.message || err?.message || 'Login failed. Please check your credentials.'
        );
      }
    });
  }
}
