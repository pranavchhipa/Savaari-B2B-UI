import { Component, OnInit, inject, ChangeDetectionStrategy, ChangeDetectorRef, DestroyRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { LucideAngularModule, Fuel, UserCheck, Moon, Receipt, FileText, Banknote, ParkingCircle, Gauge, Users, Briefcase, Snowflake, ChevronDown, ChevronRight, Calendar, Clock } from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BookingStateService, Itinerary, SelectedCar } from '../../core/services/booking-state.service';
import { MarkupService } from '../../core/services/markup.service';
import { AvailableCar } from '../../core/models';
import { CAR_IMAGE_MAP, CAR_DISPLAY_INFO } from '../../core/mocks/mock-cars';

import { FooterComponent } from '../../components/layout/footer/footer';
import { DatePickerModule } from 'primeng/datepicker';

/** Display-ready car object for the template */
interface DisplayCar {
  id: string;
  carTypeId: number;
  name: string;
  subtitle: string;
  image: string;
  price: number;
  kmsIncluded: string;
  hoursIncluded?: string;
  seats: string;
  bags: string;
  ac: string;
  type: string;
  extraKmRate: number;
  nightAllowance: number;
  tc: string[];
}

@Component({
  selector: 'app-select-car',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    LucideAngularModule,
    ReactiveFormsModule,
    FooterComponent,
    DatePickerModule
  ],
  templateUrl: './select-car.html',
  styleUrl: './select-car.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SelectCarComponent implements OnInit {
  private fb = inject(FormBuilder);
  public router = inject(Router);
  private bookingState = inject(BookingStateService);
  private markupService = inject(MarkupService);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  private location = inject(Location);

  itinerary: Itinerary | null = null;
  modifyForm!: FormGroup;

  // Toggles for the tabs on the car cards
  activeTab: { [carId: string]: string } = {};

  // Cars from availability API (mapped to display format)
  availableCars: DisplayCar[] = [];

  showPriceAlert = true;
  isModifyModalOpen = false;
  isLoading = true;

  // Local trip package selection: '8hr' | '12hr'
  selectedLocalPackage: '8hr' | '12hr' = '8hr';

  // Airport sub-type options for the modify modal dropdown
  airportSubTypes = [
    { label: 'Drop to Airport', value: 'drop' },
    { label: 'Pickup from Airport', value: 'pickup' }
  ];

  ngOnInit() {
    this.itinerary = this.bookingState.getItinerary();
    this.initModifyForm();

    // Load cars from availability response
    this.loadCarsFromAvailability();
    this.initializeTabs();

    // Show loading briefly then reveal
    setTimeout(() => {
      this.isLoading = false;
      this.cdr.markForCheck();
    }, 800);

    // Subscribe for itinerary changes with auto-cleanup
    this.bookingState.currentItinerary$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(itinerary => {
        if (itinerary) {
          this.itinerary = itinerary;
          this.initModifyForm();
          this.cdr.markForCheck();
        }
      });
  }

  /** Map API availability response to display cars */
  private loadCarsFromAvailability() {
    const response = this.bookingState.getAvailabilityResponse();
    if (response?.cars?.length) {
      this.availableCars = response.cars.map(car => this.mapApiCarToDisplay(car));
    } else {
      this.availableCars = [];
    }
  }

  /** Convert an API AvailableCar to the DisplayCar format the template expects */
  private mapApiCarToDisplay(car: AvailableCar): DisplayCar {
    const displayInfo = CAR_DISPLAY_INFO[car.carTypeId] || { seats: '4 Seater', bags: '2 Bags', ac: 'AC', type: 'SEDAN' };
    const image = CAR_IMAGE_MAP[car.carTypeId] || CAR_IMAGE_MAP[4];

    return {
      id: `car_${car.carTypeId}`,
      carTypeId: car.carTypeId,
      name: car.carName,
      subtitle: 'or equivalent',
      image: image,
      price: car.fare,
      kmsIncluded: `${car.kmsIncluded} km`,
      seats: displayInfo.seats,
      bags: displayInfo.bags,
      ac: displayInfo.ac,
      type: displayInfo.type,
      extraKmRate: car.extraKmRate,
      nightAllowance: car.nightAllowance,
      tc: [
        `Kms limit is ${car.kmsIncluded} km. Extra kms will be charged at \u20B9${car.extraKmRate}/km.`,
        'Airport Entry/Parking charges extra at actuals.',
        'One pick up and one drop only. Within city travel not included.',
        'AC may be switched off during hill climbs.',
        'Cancellation is free up to 6 hours before pickup.'
      ]
    };
  }

  private initializeTabs() {
    // Tabs start collapsed — user clicks to expand
    this.availableCars.forEach(car => {
      this.activeTab[car.id] = '';
    });
  }

  private formatDate(date: any): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  }

  private initModifyForm() {
    const pickupDate = this.itinerary?.pickupDate ? new Date(this.itinerary.pickupDate) : new Date();
    const returnDate = this.itinerary?.returnDate ? new Date(this.itinerary.returnDate) : new Date();
    const pickupTime = this.parseTimeToDate(this.itinerary?.pickupTime || '09:30 PM');

    this.modifyForm = this.fb.group({
      fromCity: [this.itinerary?.fromCity || ''],
      toCity: [this.itinerary?.toCity || ''],
      pickupDate: [pickupDate],
      returnDate: [returnDate],
      pickupTime: [pickupTime],
      airportSubType: [this.itinerary?.airportSubType || 'drop'],
      pickupAddress: [this.itinerary?.pickupAddress || ''],
      dropAirport: [this.itinerary?.dropAirport || '']
    });
  }

  /** Parse "09:30 PM" style string to a Date object for PrimeNG time picker */
  private parseTimeToDate(timeStr: string): Date {
    const d = new Date();
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const ampm = match[3].toUpperCase();
      if (ampm === 'PM' && hours !== 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      d.setHours(hours, minutes, 0, 0);
    }
    return d;
  }

  /** Format Date to "hh:mm AM/PM" string */
  private formatTimeFromDate(date: Date): string {
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
  }

  openModifyModal() {
    this.isModifyModalOpen = true;
    this.cdr.markForCheck();
  }

  closeModifyModal() {
    this.isModifyModalOpen = false;
    this.cdr.markForCheck();
  }

  submitModifyModal() {
    if (this.modifyForm.valid) {
      const formVal = this.modifyForm.value;
      // PrimeNG DatePicker returns Date objects — pass them directly to the itinerary
      const pickupDate = formVal.pickupDate instanceof Date ? formVal.pickupDate : formVal.pickupDate;
      const returnDate = formVal.returnDate instanceof Date ? formVal.returnDate : formVal.returnDate;
      const pickupTime = formVal.pickupTime instanceof Date ? this.formatTimeFromDate(formVal.pickupTime) : formVal.pickupTime;

      const updatedItinerary: Itinerary = {
        ...this.itinerary!,
        fromCity: formVal.fromCity,
        toCity: formVal.toCity,
        pickupDate: pickupDate,
        pickupTime: pickupTime,
        ...(this.isRoundTrip && { returnDate: returnDate }),
        ...(this.isLocal && { localPackage: this.selectedLocalPackage === '8hr' ? '8hr/80km' : '12hr/120km' }),
        ...(this.isAirport && {
          airportSubType: formVal.airportSubType,
          pickupAddress: formVal.pickupAddress,
          dropAirport: formVal.dropAirport
        })
      };
      this.bookingState.setItinerary(updatedItinerary);
      this.isModifyModalOpen = false;
      this.cdr.markForCheck();
    }
  }

  get isRoundTrip(): boolean {
    return this.itinerary?.tripType === 'Round Trip';
  }

  get isLocal(): boolean {
    return this.itinerary?.tripType === 'Local';
  }

  get isAirport(): boolean {
    return this.itinerary?.tripType === 'Airport';
  }

  get airportSubTypeLabel(): string {
    const sub = this.itinerary?.airportSubType;
    return sub === 'pickup' ? 'Pickup from Airport' : 'Drop to Airport';
  }

  /** Cars to show — all come from the availability API now */
  get carsToDisplay(): DisplayCar[] {
    return this.availableCars;
  }

  get localPackageLabel(): string {
    return this.selectedLocalPackage === '8hr' ? '8hrs | 80 km' : '12hrs | 120 km';
  }

  selectLocalPackage(pkg: '8hr' | '12hr') {
    this.selectedLocalPackage = pkg;
    this.initializeTabs();
    this.cdr.markForCheck();
  }

  /** Returns car price with agent markup applied, doubled for round trip */
  getCarPrice(baseFare: number): number {
    const tripTypeForMarkup = this.isLocal ? 'local' : this.isAirport ? 'airport' : 'outstation';
    const withMarkup = this.markupService.applyMarkup(baseFare, tripTypeForMarkup);
    return this.isRoundTrip ? withMarkup * 2 : withMarkup;
  }

  /** Returns KMs label adjusted for trip type */
  getCarKms(baseKms: string): string {
    if (!this.isRoundTrip) return baseKms;
    const num = parseInt(baseKms, 10);
    return isNaN(num) ? baseKms : `${num * 2} km`;
  }

  setTab(carId: string, tab: string) {
    this.activeTab[carId] = tab;
    this.cdr.markForCheck();
  }

  /** Toggle tab — clicking same tab collapses it */
  toggleTab(carId: string, tab: string) {
    this.activeTab[carId] = this.activeTab[carId] === tab ? '' : tab;
    this.cdr.markForCheck();
  }

  closeAlert() {
    this.showPriceAlert = false;
    this.cdr.markForCheck();
  }

  onSelectCar(car: DisplayCar) {
    const selectedCar: SelectedCar = {
      id: car.id,
      carTypeId: car.carTypeId,
      name: car.name,
      image: car.image,
      price: this.getCarPrice(car.price),
      originalPrice: car.price,
      kmsIncluded: this.getCarKms(car.kmsIncluded),
      seats: car.seats,
      bags: car.bags,
      ac: car.ac,
      type: car.type,
      extraKmRate: car.extraKmRate,
      nightAllowance: car.nightAllowance,
    };
    this.bookingState.setSelectedCar(selectedCar);
    this.router.navigate(['/booking']);
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

}
