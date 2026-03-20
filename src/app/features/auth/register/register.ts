import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { FooterComponent } from '../../../components/layout/footer/footer';
import { LandingNavbarComponent } from '../../landing/components/navbar/landing-navbar';


@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LucideAngularModule, FooterComponent, LandingNavbarComponent],
  templateUrl: './register.html',
  styleUrl: './register.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);

  // Testimonial carousel
  testimonials = [
    { name: 'Rajesh Kumar', city: 'Mumbai', text: 'B2B CAB has transformed my travel agency. The commission structure is transparent and payouts are always on time.', rating: 5, avatar: 'assets/avatars/rajesh.jpg' },
    { name: 'Priya Sharma', city: 'Delhi', text: 'Zero cancellations means I never have to worry about letting my clients down. Best decision for my business.', rating: 5, avatar: 'assets/avatars/priya.jpg' },
    { name: 'Suresh Patel', city: 'Ahmedabad', text: 'I earn more with B2B CAB than any other platform. The dashboard makes managing bookings effortless.', rating: 4, avatar: 'assets/avatars/suresh.jpg' },
    { name: 'Anita Verma', city: 'Bangalore', text: 'GST-ready invoices and instant booking confirmations. My clients love the professional service.', rating: 5, avatar: 'assets/avatars/anita.jpg' },
  ];
  activeTestimonial = 0;
  private testimonialInterval: any;

  ngOnInit() {
    this.testimonialInterval = setInterval(() => {
      this.activeTestimonial = (this.activeTestimonial + 1) % this.testimonials.length;
    }, 4000);
  }

  ngOnDestroy() {
    if (this.testimonialInterval) clearInterval(this.testimonialInterval);
  }

  registerForm = this.fb.group({
    firstName: ['', [Validators.required]],
    lastName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.pattern('^[0-9]{10}$')]],
    companyName: ['', [Validators.required]],
    companyCity: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]]
  }, { validators: this.passwordMatchValidator });

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { mismatch: true };
  }

  onSubmit() {
    if (this.registerForm.valid) {
      console.log('Registration details:', this.registerForm.value);
      // Mock successful registration redirection
      this.router.navigate(['/login']);
    } else {
      this.registerForm.markAllAsTouched();
    }
  }
}
