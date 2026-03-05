import { Component, OnInit, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { AutoCompleteModule, AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { FooterComponent } from '../../components/layout/footer/footer';
import { BookingStateService } from '../../core/services/booking-state.service';
import { CityService } from '../../core/services/city.service';
import { TripTypeService } from '../../core/services/trip-type.service';
import { AvailabilityService } from '../../core/services/availability.service';
import { City, AvailabilityRequest } from '../../core/models';
import { toSavaariDateTime, calculateDuration } from '../../core/utils/date-format.util';

type TabType = 'ONE_WAY' | 'ROUND_TRIP' | 'LOCAL' | 'AIRPORT';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule, DatePickerModule, SelectModule, AutoCompleteModule, FooterComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private bookingState = inject(BookingStateService);
  private cdr = inject(ChangeDetectorRef);
  private cityService = inject(CityService);
  private tripTypeService = inject(TripTypeService);
  private availabilityService = inject(AvailabilityService);

  selectedTab: TabType = 'ONE_WAY';
  bookingForm!: FormGroup;

  // City autocomplete data
  sourceCities: City[] = [];
  destinationCities: City[] = [];
  filteredSourceCities: City[] = [];
  filteredDestinationCities: City[] = [];

  // Loading state for Explore Cabs button
  isSearching = false;

  tripTypes = [
    { label: 'Drop to Airport', value: 'drop' },
    { label: 'Pickup from Airport', value: 'pickup' }
  ];

  /** Minimum selectable pickup date (today) */
  minPickupDate: Date = new Date();

  /** Minimum selectable return date (pickup date + 1 day) */
  minReturnDate: Date = new Date();

  ngOnInit() {
    this.initForm();
    this.loadSourceCities();
  }

  initForm() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 2);
    this.bookingForm = this.fb.group({
      fromCity: [null],
      toCity: [null],
      tripType: [null],
      pickupAddress: [''],
      dropAirport: [''],
      pickupDate: [tomorrow],
      returnDate: [dayAfter],
      pickupTime: [new Date(new Date().setHours(18, 0, 0, 0))]
    });

    // Set initial minReturnDate to tomorrow + 1 = dayAfter
    this.updateMinReturnDate(tomorrow);

    // Watch pickupDate changes to auto-adjust return date
    this.bookingForm.get('pickupDate')?.valueChanges.subscribe((newPickupDate: Date) => {
      if (newPickupDate) {
        this.updateMinReturnDate(newPickupDate);
      }
    });
  }

  /** Update minReturnDate and auto-adjust returnDate if it's now invalid */
  private updateMinReturnDate(pickupDate: Date) {
    const nextDay = new Date(pickupDate);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(0, 0, 0, 0);
    this.minReturnDate = nextDay;

    // If current return date is on the same day or before, push it forward
    const currentReturn = this.bookingForm.get('returnDate')?.value;
    if (currentReturn) {
      const returnNormalized = new Date(currentReturn);
      returnNormalized.setHours(0, 0, 0, 0);
      const pickupNormalized = new Date(pickupDate);
      pickupNormalized.setHours(0, 0, 0, 0);
      if (returnNormalized <= pickupNormalized) {
        this.bookingForm.get('returnDate')?.setValue(new Date(nextDay));
      }
    }
    this.cdr.markForCheck();
  }

  /** Load source cities from CityService */
  private loadSourceCities() {
    const apiParams = this.getApiParams();
    this.cityService.getSourceCities(apiParams.tripType, apiParams.subTripType).subscribe(cities => {
      this.sourceCities = cities;
      this.cdr.markForCheck();
    });
  }

  /** Load destination cities based on selected source city */
  private loadDestinationCities(sourceCityId: number) {
    const apiParams = this.getApiParams();
    this.cityService.getDestinationCities(apiParams.tripType, apiParams.subTripType, sourceCityId).subscribe(cities => {
      this.destinationCities = cities;
      this.cdr.markForCheck();
    });
  }

  /** Get API tripType/subTripType from current UI tab */
  private getApiParams() {
    const uiTripType = this.selectedTab === 'ROUND_TRIP' ? 'Round Trip'
      : this.selectedTab === 'LOCAL' ? 'Local'
      : this.selectedTab === 'AIRPORT' ? 'Airport'
      : 'One Way';
    return this.tripTypeService.mapUiTabToApiParams(uiTripType, {
      airportSubType: this.bookingForm?.get('tripType')?.value
    });
  }

  /** PrimeNG AutoComplete: filter source cities */
  filterSourceCities(event: AutoCompleteCompleteEvent) {
    const query = (event.query || '').toLowerCase();
    this.filteredSourceCities = this.sourceCities.filter(c =>
      c.name.toLowerCase().includes(query)
    );
  }

  /** PrimeNG AutoComplete: filter destination cities */
  filterDestinationCities(event: AutoCompleteCompleteEvent) {
    const query = (event.query || '').toLowerCase();
    this.filteredDestinationCities = this.destinationCities.filter(c =>
      c.name.toLowerCase().includes(query)
    );
  }

  /** When source city is selected, load destinations */
  onSourceCitySelect(event: any) {
    const city: City = event.value || event;
    if (city?.id) {
      this.loadDestinationCities(city.id);
    }
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
    this.bookingForm.updateValueAndValidity();
    this.loadSourceCities();
    this.cdr.markForCheck();
  }

  showError = false;
  errorMessage = '';

  /**
   * Fixed drop time for Round Trip bookings (9:45 PM on the return date).
   * This is the standard end-of-day cutoff — night charges apply after this.
   */
  getDropTime(): string {
    return '09:45 PM';
  }

  /** Tooltip message for drop time */
  getDropTimeMessage(): string {
    return 'Keep the cab till 9:45 PM at no extra cost. Night charges will apply post that.';
  }

  onExploreCabs() {
    this.showError = false;
    this.errorMessage = '';

    const val = this.bookingForm.value;
    const isRoundTrip = this.selectedTab === 'ROUND_TRIP';
    const isAirport = this.selectedTab === 'AIRPORT';
    const isLocal = this.selectedTab === 'LOCAL';
    const tripType = isRoundTrip ? 'Round Trip' : isLocal ? 'Local' : isAirport ? 'Airport' : 'One Way';

    // Resolve city names and IDs from the autocomplete City objects
    const fromCityObj: City | string = val.fromCity;
    const toCityObj: City | string = val.toCity;

    const fromCityName = typeof fromCityObj === 'object' && fromCityObj?.name ? fromCityObj.name : (fromCityObj as string || 'Bangalore');
    const fromCityId = typeof fromCityObj === 'object' && (fromCityObj as City)?.id ? (fromCityObj as City).id : 377;
    const toCityName = typeof toCityObj === 'object' && toCityObj?.name ? toCityObj.name : (toCityObj as string || 'Mysore');
    const toCityId = typeof toCityObj === 'object' && (toCityObj as City)?.id ? (toCityObj as City).id : 237;

    // Parse pickupTime to hh:mm AM/PM string
    const timeDate: Date = val.pickupTime instanceof Date ? val.pickupTime : new Date();
    const hours = timeDate.getHours();
    const minutes = timeDate.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    const pickupTimeStr = `${String(h12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;

    const pickupDate: Date = val.pickupDate || new Date();
    const returnDate: Date = val.returnDate || new Date();

    // Get API params from trip type service
    const apiParams = this.tripTypeService.mapUiTabToApiParams(tripType, {
      airportSubType: val.tripType
    });

    // Build and save itinerary
    const itinerary = {
      fromCity: fromCityName,
      fromCityId: fromCityId,
      toCity: toCityName,
      toCityId: toCityId,
      pickupDate: pickupDate,
      pickupTime: pickupTimeStr,
      tripType: tripType,
      subTripType: apiParams.subTripType,
      ...(isRoundTrip && {
        returnDate: returnDate,
        duration: calculateDuration(pickupDate, returnDate)
      }),
      ...(isAirport && {
        airportSubType: val.tripType || 'drop',
        pickupAddress: val.pickupAddress || '',
        dropAirport: val.dropAirport || ''
      })
    };

    this.bookingState.setItinerary(itinerary);

    // Build availability request
    const availabilityRequest: AvailabilityRequest = {
      sourceCity: fromCityId,
      tripType: apiParams.tripType,
      subTripType: apiParams.subTripType,
      pickupDateTime: toSavaariDateTime(pickupDate, pickupTimeStr),
      ...((!isLocal && !isAirport) && { destinationCity: toCityId }),
      ...(isRoundTrip && { duration: calculateDuration(pickupDate, returnDate) }),
    };

    // Show loading, call availability API, then navigate
    this.isSearching = true;
    this.cdr.markForCheck();

    this.availabilityService.checkAvailability(availabilityRequest).subscribe({
      next: (response) => {
        this.bookingState.setAvailabilityResponse(response);
        this.isSearching = false;
        this.cdr.markForCheck();
        this.router.navigate(['/select-car']);
      },
      error: (err) => {
        this.isSearching = false;
        this.showError = true;
        this.errorMessage = err?.message || 'Failed to fetch cab availability. Please try again.';
        this.cdr.markForCheck();
      }
    });
  }
}
