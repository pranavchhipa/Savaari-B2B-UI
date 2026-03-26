import { Component, inject, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { FooterComponent } from '../../../components/layout/footer/footer';
import { LandingNavbarComponent } from '../../landing/components/navbar/landing-navbar';
import { ApiService } from '../../../core/services/api.service';


@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LucideAngularModule, FooterComponent, LandingNavbarComponent],
  templateUrl: './register.html',
  styleUrl: './register.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private api = inject(ApiService);

  // Testimonial carousel
  testimonials = [
    { name: 'Rajesh Kumar', city: 'Mumbai', text: 'B2B CAB has transformed my travel agency. The commission structure is transparent and payouts are always on time.', rating: 5, avatar: 'assets/avatars/rajesh.jpg' },
    { name: 'Priya Sharma', city: 'Delhi', text: 'Zero cancellations means I never have to worry about letting my clients down. Best decision for my business.', rating: 5, avatar: 'assets/avatars/priya.jpg' },
    { name: 'Suresh Patel', city: 'Ahmedabad', text: 'I earn more with B2B CAB than any other platform. The dashboard makes managing bookings effortless.', rating: 4, avatar: 'assets/avatars/suresh.jpg' },
    { name: 'Anita Verma', city: 'Bangalore', text: 'GST-ready invoices and instant booking confirmations. My clients love the professional service.', rating: 5, avatar: 'assets/avatars/anita.jpg' },
  ];
  activeTestimonial = 0;
  isSubmitting = false;
  submitError = '';
  submitSuccess = false;
  private testimonialInterval: any;

  ngOnInit() {
    this.testimonialInterval = setInterval(() => {
      this.activeTestimonial = (this.activeTestimonial + 1) % this.testimonials.length;
      this.cdr.markForCheck();
    }, 4000);
  }

  ngOnDestroy() {
    if (this.testimonialInterval) clearInterval(this.testimonialInterval);
  }

  registerForm = this.fb.group({
    firstName: ['', [Validators.required, Validators.maxLength(50), Validators.pattern(/^[a-zA-Z\s\-'.]+$/)]],
    lastName: ['', [Validators.required, Validators.maxLength(50), Validators.pattern(/^[a-zA-Z\s\-'.]+$/)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(100)]],
    phone: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
    companyName: ['', [Validators.required, Validators.maxLength(100)]],
    companyCity: ['', [Validators.required, Validators.maxLength(50)]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128), Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)]],
    confirmPassword: ['', [Validators.required]]
  }, { validators: this.passwordMatchValidator });

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { mismatch: true };
  }

  onSubmit() {
    if (this.registerForm.valid) {
      this.isSubmitting = true;
      this.submitError = '';
      this.cdr.markForCheck();

      const v = this.registerForm.value;
      const body = {
        firstname: v.firstName,
        lastname: v.lastName,
        userEmail: v.email,
        mobileno: `91${v.phone}`,
        companyname: v.companyName,
        city: v.companyCity,
        password: v.password,
        isAgent: true
      };

      this.api.b2bPost<any>('user/register', body).subscribe({
        next: (resp) => {
          this.isSubmitting = false;
          if (resp.statusCode === 200 || resp.status === 'success') {
            this.submitSuccess = true;
            this.cdr.markForCheck();
            setTimeout(() => this.router.navigate(['/login']), 2000);
          } else {
            this.submitError = resp.message || 'Registration failed. Please try again.';
            this.cdr.markForCheck();
          }
        },
        error: (err) => {
          this.isSubmitting = false;
          this.submitError = err?.error?.message || err?.message || 'Registration failed. Please try again.';
          this.cdr.markForCheck();
        }
      });
    } else {
      this.registerForm.markAllAsTouched();
    }
  }
}
