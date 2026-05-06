import { Component, inject, ChangeDetectionStrategy, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { FooterComponent } from '../../../components/layout/footer/footer';
import { LandingNavbarComponent } from '../../landing/components/navbar/landing-navbar';
import { ApiService } from '../../../core/services/api.service';
import { CityService } from '../../../core/services/city.service';
import { AuthService } from '../../../core/services/auth.service';
import { City } from '../../../core/models';


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
  private cityService = inject(CityService);
  private authService = inject(AuthService);

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
  showPassword = false;
  showConfirmPassword = false;
  private testimonialInterval: any;

  // Cities from API (source-cities gives "Bangalore, Karnataka" format)
  allCities: City[] = [
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
  filteredCities: City[] = [];
  showCityDropdown = false;

  ngOnInit() {
    this.testimonialInterval = setInterval(() => {
      this.activeTestimonial = (this.activeTestimonial + 1) % this.testimonials.length;
      this.cdr.markForCheck();
    }, 4000);

    // Fetch partner token then load source cities for city dropdown
    this.authService.fetchPartnerToken().subscribe({
      next: () => {
        this.cityService.getSourceCities('outstation', 'oneWay').subscribe({
          next: (cities) => {
            if (cities.length > 0) {
              // Only keep main cities: "Bangalore, Karnataka" (city, STATE)
              // Drop sub-localities: "Attibele, Bangalore" (locality, CITY — not a state)
              // Drop airports: isAirport flag
              const indianStates = new Set([
                'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh',
                'goa', 'gujarat', 'haryana', 'himachal pradesh', 'jharkhand', 'karnataka',
                'kerala', 'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya', 'mizoram',
                'nagaland', 'odisha', 'punjab', 'rajasthan', 'sikkim', 'tamil nadu',
                'telangana', 'tripura', 'uttar pradesh', 'uttarakhand', 'west bengal',
                'delhi', 'chandigarh', 'dadra and nagar haveli and daman and diu',
                'jammu and kashmir', 'ladakh', 'lakshadweep', 'puducherry',
                'andaman and nicobar islands', 'andaman and nicobar'
              ]);
              const seen = new Set<string>();
              this.allCities = cities.filter(c => {
                if (c.isAirport) return false;
                // Check if the part after comma is a state name (main city) vs city name (sub-locality)
                const nameParts = c.name.split(',');
                if (nameParts.length >= 2) {
                  const afterComma = nameParts[nameParts.length - 1].trim().toLowerCase();
                  if (!indianStates.has(afterComma)) return false; // sub-locality like "Attibele, Bangalore"
                }
                const key = (c.cityOnly || c.name.split(',')[0]?.trim() || '').toLowerCase();
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
              });
            } else {
              this.allCities = this.fallbackCities();
            }
            this.cdr.markForCheck();
          },
          error: () => { this.allCities = this.fallbackCities(); this.cdr.markForCheck(); }
        });
      },
      error: () => { this.allCities = this.fallbackCities(); this.cdr.markForCheck(); }
    });
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

  filterCities(event: Event) {
    const q = (event.target as HTMLInputElement).value.toLowerCase();
    if (!q) {
      this.filteredCities = this.allCities.slice(0, 20);
    } else {
      // Prefix matches first, then substring
      const prefix = this.allCities.filter(c => (c.cityOnly || c.name).toLowerCase().startsWith(q));
      const substring = this.allCities.filter(c => !prefix.includes(c) && c.name.toLowerCase().includes(q));
      this.filteredCities = [...prefix, ...substring].slice(0, 20);
    }
    this.showCityDropdown = true;
    this.cdr.markForCheck();
  }

  selectCity(city: City) {
    this.registerForm.patchValue({ companyCity: city.name }); // "Bangalore, Karnataka"
    this.selectedCityId = city.id;
    this.showCityDropdown = false;
    this.cdr.markForCheck();
  }

  selectedCityId: number = 0;

  onCityFocus() {
    this.filteredCities = this.allCities.slice(0, 20);
    this.showCityDropdown = true;
    this.cdr.markForCheck();
  }

  onCityBlur() {
    setTimeout(() => {
      this.showCityDropdown = false;
      this.cdr.markForCheck();
    }, 200);
  }

  private fallbackCities(): City[] {
    return [
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
  }

  onSubmit() {
    if (this.registerForm.valid) {
      this.isSubmitting = true;
      this.submitError = '';
      this.cdr.markForCheck();

      const v = this.registerForm.value;

      // HAR-confirmed: POST /user with multipart/form-data (beta site)
      const fd = new FormData();
      fd.append('referer', location.hostname + '/');
      fd.append('userName', `${v.firstName} ${v.lastName}`.trim());
      fd.append('userEmail', v.email || '');
      fd.append('userPhone', v.phone || '');
      fd.append('agentCompanyName', v.companyName || '');
      const selectedCity = this.allCities.find(c => c.name === v.companyCity);
      fd.append('agentCity', selectedCity?.cityOnly || v.companyCity?.split(',')[0]?.trim() || '');
      fd.append('agentState', selectedCity?.state || (v.companyCity?.includes(',') ? v.companyCity.split(',').slice(1).join(',').trim() : ''));
      fd.append('agentcityId', selectedCity?.id ? String(selectedCity.id) : '');
      fd.append('password', v.password || '');
      fd.append('agentCompanyAddress', '');
      fd.append('agentPAN', '');
      fd.append('agentGST', '');
      fd.append('agentLogo', '');
      fd.append('asAgent', '0');
      fd.append('agentLocalCommission', '5');
      fd.append('agentAirportCommission', '5');
      fd.append('agentOutstationCommission', '5');
      fd.append('clienttip', '');
      fd.append('isAgent', 'true');

      this.api.b2bPostFormData<any>('user', fd).subscribe({
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
