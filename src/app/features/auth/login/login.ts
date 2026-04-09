import { Component, inject, ChangeDetectionStrategy, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { FooterComponent } from '../../../components/layout/footer/footer';
import { LandingNavbarComponent } from '../../landing/components/navbar/landing-navbar';
import { AuthService } from '../../../core/services/auth.service';
import { WalletService } from '../../../core/services/wallet.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LucideAngularModule, FooterComponent, LandingNavbarComponent],
  templateUrl: './login.html',
  styleUrl: './login.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent implements OnInit {
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
  successMessage = signal('');
  showPassword = signal(false);

  ngOnInit(): void {
    // If user just registered via the new wizard, pre-fill the email + password
    // they chose during sign-up. Stored in localStorage by register-wizard.
    try {
      const raw = localStorage.getItem('b2bcab.pendingLogin');
      if (raw) {
        const { email, password } = JSON.parse(raw) as { email?: string; password?: string };
        if (email && password) {
          this.loginForm.patchValue({ email, password, rememberMe: true });
          this.successMessage.set('Account created! Sign in to continue.');
        }
        // Consume once — don't leak credentials across future sessions
        localStorage.removeItem('b2bcab.pendingLogin');
      }
    } catch { /* ignore — localStorage may be unavailable */ }
  }

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
