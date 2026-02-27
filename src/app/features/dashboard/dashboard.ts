import { Component, OnInit, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { FooterComponent } from '../../components/layout/footer/footer';
import { BookingStateService } from '../../core/services/booking-state.service';

type TabType = 'ONE_WAY' | 'ROUND_TRIP' | 'LOCAL' | 'AIRPORT';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule, DatePickerModule, SelectModule, FooterComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private bookingState = inject(BookingStateService);
  private cdr = inject(ChangeDetectorRef);

  selectedTab: TabType = 'ONE_WAY'; // Default as per user request
  bookingForm!: FormGroup;

  tripTypes = [
    { label: 'Drop to Airport', value: 'drop' },
    { label: 'Pickup from Airport', value: 'pickup' },
    { label: 'Airport Round Trip', value: 'round' }
  ];

  ngOnInit() {
    this.initForm();
  }

  initForm() {
    this.bookingForm = this.fb.group({
      fromCity: [''],
      toCity: [''],
      tripType: [null],
      pickupAddress: [''],
      dropAirport: [''],
      pickupDate: [new Date()],
      returnDate: [new Date()],
      pickupTime: [new Date(new Date().setHours(18, 0, 0, 0))]
    });
  }

  get airportLabel1(): string {
    const type = this.bookingForm?.get('tripType')?.value;
    if (type === 'pickup') return 'PICKUP AIRPORT';
    if (type === 'drop' || type === 'round') return 'PICKUP ADDRESS';
    return 'DROP AIRPORT';
  }

  get airportLabel2(): string {
    const type = this.bookingForm?.get('tripType')?.value;
    if (type === 'pickup') return 'DROP ADDRESS';
    return 'DROP AIRPORT';
  }

  selectTab(tab: TabType) {
    this.selectedTab = tab;
    // Ensure form is updated correctly when switching tabs
    this.bookingForm.updateValueAndValidity();
    this.cdr.markForCheck();
  }

  showError = false;
  errorMessage = '';

  onExploreCabs() {
    this.showError = false;
    this.errorMessage = '';

    console.log(`Exploring cabs for ${this.selectedTab}:`, this.bookingForm.value);

    const val = this.bookingForm.value;

    // Save basic search itinerary to state
    this.bookingState.setItinerary({
      fromCity: val.fromCity || 'Bangalore',
      toCity: val.toCity || 'Mysore',
      pickupDate: val.pickupDate || new Date(),
      pickupTime: '09:30 PM', // Hardcoded mockup fallback
      tripType: this.selectedTab === 'ONE_WAY' ? 'One Way' : 'Round Trip'
    });

    // Bypassing validation for the UI mockup preview...
    this.router.navigate(['/select-car']);
  }
}
