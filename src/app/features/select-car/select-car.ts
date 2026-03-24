import { Component, OnInit, inject, ChangeDetectionStrategy, ChangeDetectorRef, DestroyRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { LucideAngularModule, Fuel, UserCheck, Moon, Receipt, FileText, Banknote, ParkingCircle, Gauge, Users, Briefcase, Snowflake, ChevronDown, ChevronRight, Calendar, Clock } from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BookingStateService, Itinerary, SelectedCar } from '../../core/services/booking-state.service';
import { MarkupService } from '../../core/services/markup.service';
import { AnalyticsService } from '../../core/services/analytics.service';
import { AvailableCar } from '../../core/models';

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
  regularFare?: number;     // Regular (non-discounted) fare — used as prePayment basis
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
  private analytics = inject(AnalyticsService);

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

    // Track page-load (mirrors savaari.com select-car page behaviour, 2s delay)
    setTimeout(() => {
      this.analytics.trackPageLoad(
        this.itinerary?.fromCity ?? '',
        this.itinerary?.toCity ?? ''
      );
    }, 2000);

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
    const typeId = car.carTypeId ?? 0;
    const extraKm = car.extraKmRate ?? 0;
    const nightAllow = car.nightAllowance ?? 0;
    const kmsInc = car.kmsIncluded ?? 0;
    const seats = car.seatCapacity ? `${car.seatCapacity} Seater` : '4 Seater';
    const bags = car.luggageCapacity ? `${car.luggageCapacity} Bag${car.luggageCapacity > 1 ? 's' : ''}` : '2 Bags';

    // Prefer local assets over API URLs for consistent branding
    const image = this.getLocalCarImage(car.carName, typeId);

    // Use real T&C from API if available, else generate sensible defaults
    const tc = car.tncData?.length ? car.tncData : [
      `Kms limit is ${kmsInc} km. Extra kms will be charged at \u20B9${extraKm}/km.`,
      'Airport Entry/Parking charges extra at actuals.',
      'One pick up and one drop only. Within city travel not included.',
      'Cancellation is free up to 6 hours before pickup.'
    ];

    return {
      id: car.carId || `car_${typeId}`,
      carTypeId: typeId,
      name: car.carName,
      subtitle: 'or equivalent',
      image: image,
      price: car.fare,
      regularFare: car.originalFare,
      kmsIncluded: `${kmsInc} km`,
      seats,
      bags,
      ac: 'AC',
      type: car.carType || 'SEDAN',
      extraKmRate: extraKm,
      nightAllowance: nightAllow,
      tc
    };
  }

  /** Map car name to studio-quality car photo, with type ID fallback */
  private getLocalCarImage(carName: string, typeId: number): string {
    const base = 'assets/cars/';
    const n = (carName || '').toLowerCase();

    // Exact car model matching (studio photos)
    if (n.includes('dzire'))                             return base + 'dzire.png';
    if (n.includes('etios'))                             return base + 'etios.png';
    if (n.includes('wagon'))                             return base + 'wagon-r.png';
    if (n.includes('swift'))                             return base + 'swift.png';
    if (n.includes('crysta'))                            return base + 'innova-crysta.png';
    if (n.includes('innova'))                            return base + 'innova.png';
    if (n.includes('ertiga'))                            return base + 'ertiga.png';
    if (n.includes('marazzo'))                           return base + 'marazzo.png';
    if (n.includes('carens') || n.includes('kia'))       return base + 'carens.png';
    if (n.includes('honda') || n.includes('city'))       return base + 'city.png';
    if (n.includes('verna'))                             return base + 'verna.png';
    if (n.includes('ciaz'))                              return base + 'ciaz.png';
    if (n.includes('xcent'))                             return base + 'xcent.png';
    if (n.includes('camry'))                             return base + 'camry.png';
    if (n.includes('mercedes') || n.includes('e-class') || n.includes('e class')) return base + 'e-class.png';
    if (n.includes('bmw'))                               return base + 'bmw-5.png';
    if (n.includes('xuv'))                               return base + 'xuv500.png';
    if (n.includes('urbania'))                            return base + 'urbania.png';
    if ((n.includes('tempo') || n.includes('traveller')) && n.includes('26')) return base + 'tempo-26.png';
    if ((n.includes('tempo') || n.includes('traveller')) && n.includes('17')) return base + 'tempo-17.png';
    if (n.includes('tempo') || n.includes('traveller'))  return base + 'tempo-12.png';

    // Fallback by car type ID
    const byId: Record<number, string> = {
      4: base + 'dzire.png',        // Sedan
      5: base + 'etios.png',        // Sedan
      7: base + 'xuv500.png',       // SUV
      43: base + 'dzire.png',
      44: base + 'etios.png',
      45: base + 'ciaz.png',
      46: base + 'wagon-r.png',     // Hatchback
      49: base + 'swift.png',       // Hatchback
      52: base + 'innova.png',
      53: base + 'innova-crysta.png',
      54: base + 'innova.png',
      48: base + 'tempo-12.png',
      57: base + 'tempo-17.png',
      58: base + 'tempo-26.png',
    };
    if (byId[typeId]) return byId[typeId];

    return base + 'dzire.png'; // default
  }

  private initializeTabs() {
    // Inclusions tab open by default for all cars
    this.availableCars.forEach(car => {
      this.activeTab[car.id] = 'inclusions';
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
      const pickupDate = formVal.pickupDate;
      const returnDate = formVal.returnDate;
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

  /** Cars to show — sorted by price (low to high) */
  get carsToDisplay(): DisplayCar[] {
    return [...this.availableCars].sort((a, b) => a.price - b.price);
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
      regularPrice: car.regularFare,
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
    this.location.back();
  }

}
