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
    { label: 'Pickup from Airport', value: 'pickup' }
  ];

  ngOnInit() {
    this.initForm();
  }

  initForm() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 2);
    this.bookingForm = this.fb.group({
      fromCity: [''],
      toCity: [''],
      tripType: [null],
      pickupAddress: [''],
      dropAirport: [''],
      pickupDate: [tomorrow],
      returnDate: [dayAfter],
      pickupTime: [new Date(new Date().setHours(18, 0, 0, 0))]
    });
  }

  get airportLabel1(): string {
    const type = this.bookingForm?.get('tripType')?.value;
    if (type === 'pickup') return 'PICKUP AIRPORT';
    if (type === 'drop') return 'PICKUP ADDRESS';
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

    const val = this.bookingForm.value;
    const isRoundTrip = this.selectedTab === 'ROUND_TRIP';
    const isAirport = this.selectedTab === 'AIRPORT';
    const tripType = isRoundTrip ? 'Round Trip' : this.selectedTab === 'LOCAL' ? 'Local' : isAirport ? 'Airport' : 'One Way';

    // Parse pickupTime to hh:mm AM/PM string
    const timeDate: Date = val.pickupTime instanceof Date ? val.pickupTime : new Date();
    const hours = timeDate.getHours();
    const minutes = timeDate.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    const pickupTimeStr = `${String(h12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;

    this.bookingState.setItinerary({
      fromCity: val.fromCity || 'Bangalore',
      toCity: val.toCity || 'Mysore',
      pickupDate: val.pickupDate || new Date(),
      pickupTime: pickupTimeStr,
      tripType: tripType,
      ...(isRoundTrip && { returnDate: val.returnDate || new Date() }),
      ...(isAirport && {
        airportSubType: val.tripType || 'drop',
        pickupAddress: val.pickupAddress || '',
        dropAirport: val.dropAirport || ''
      })
    });

    this.router.navigate(['/select-car']);
  }
}
