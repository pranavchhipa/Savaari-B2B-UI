import { Component, OnInit, inject, ChangeDetectionStrategy, ChangeDetectorRef, DestroyRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { LucideAngularModule, Fuel, UserCheck, Moon, Receipt, FileText, Banknote, ParkingCircle, Gauge, Users, Briefcase, Snowflake, ChevronDown, ChevronRight, Calendar, Clock } from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BookingStateService, Itinerary, SelectedCar } from '../../core/services/booking-state.service';

import { FooterComponent } from '../../components/layout/footer/footer';

@Component({
  selector: 'app-select-car',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    LucideAngularModule,
    ReactiveFormsModule,
    FooterComponent
  ],
  templateUrl: './select-car.html',
  styleUrl: './select-car.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SelectCarComponent implements OnInit {
  private fb = inject(FormBuilder);
  public router = inject(Router);
  private bookingState = inject(BookingStateService);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  private location = inject(Location);

  itinerary: Itinerary | null = null;
  modifyForm!: FormGroup;

  // Toggles for the tabs on the car cards
  activeTab: { [carId: string]: string } = {};

  availableCars = [
    {
      id: 'wagonr',
      name: 'Wagon R',
      subtitle: 'or equivalent compact sedan',
      image: '/assets/images/cars/wagonr.png',
      price: 2196,
      kmsIncluded: '145 km',
      seats: '4 Seater',
      bags: '1 Bag',
      ac: 'AC',
      type: 'SEDAN',
      extraKmRate: 12,
      nightAllowance: 154,
      tc: [
        'Kms limit is 145 km. Extra kms will be charged at ₹12/km.',
        'Airport Entry/Parking charges extra at actuals.',
        'One pick up and one drop only. Within city travel not included.',
        'AC may be switched off during hill climbs.',
        'Cancellation is free up to 6 hours before pickup.'
      ]
    },
    {
      id: 'etios',
      name: 'Toyota Etios',
      subtitle: 'or equivalent sedan',
      image: '/assets/images/cars/etios.png',
      price: 2241,
      kmsIncluded: '145 km',
      seats: '4 Seater',
      bags: '2 Bags',
      ac: 'AC',
      type: 'SEDAN',
      extraKmRate: 13.5,
      nightAllowance: 154,
      tc: [
        'Kms limit is 145 km. Extra kms will be charged at ₹13.5/km.',
        'Airport Entry/Parking charges extra at actuals.',
        'One pick up and one drop only. Within city travel not included.',
        'AC may be switched off during hill climbs.',
        'Cancellation is free up to 6 hours before pickup.'
      ]
    },
    {
      id: 'ertiga',
      name: 'Ertiga',
      subtitle: 'or equivalent SUV',
      image: '/assets/images/cars/ertiga.png',
      price: 3879,
      kmsIncluded: '145 km',
      seats: '6 Seater',
      bags: '2 Bags',
      ac: 'AC',
      type: 'SUV',
      extraKmRate: 16.5,
      nightAllowance: 275,
      tc: [
        'Kms limit is 145 km. Extra kms will be charged at ₹16.5/km.',
        'Airport Entry/Parking charges extra at actuals.',
        'One pick up and one drop only. Within city travel not included.',
        'AC may be switched off during hill climbs.',
        'Cancellation is free up to 6 hours before pickup.'
      ]
    },
    {
      id: 'innova',
      name: 'Toyota Innova',
      subtitle: 'or equivalent premium SUV',
      image: '/assets/images/cars/innova.png',
      price: 4595,
      kmsIncluded: '145 km',
      seats: '6 Seater',
      bags: '3 Bags',
      ac: 'AC',
      type: 'SUV',
      extraKmRate: 19,
      nightAllowance: 250,
      tc: [
        'Kms limit is 145 km. Extra kms will be charged at ₹19/km.',
        'Airport Entry/Parking charges extra at actuals.',
        'One pick up and one drop only. Within city travel not included.',
        'AC may be switched off during hill climbs.',
        'Cancellation is free up to 6 hours before pickup.'
      ]
    },
    {
      id: 'crysta',
      name: 'Toyota Innova Crysta',
      subtitle: 'or equivalent luxury SUV',
      image: '/assets/images/cars/crysta.png',
      price: 5536,
      kmsIncluded: '145 km',
      seats: '6 Seater',
      bags: '3 Bags',
      ac: 'AC',
      type: 'SUV',
      extraKmRate: 20,
      nightAllowance: 250,
      tc: [
        'Kms limit is 145 km. Extra kms will be charged at ₹20/km.',
        'Airport Entry/Parking charges extra at actuals.',
        'One pick up and one drop only. Within city travel not included.',
        'AC may be switched off during hill climbs.',
        'Cancellation is free up to 6 hours before pickup.'
      ]
    }
  ];

  showPriceAlert = true;
  isModifyModalOpen = false;
  isLoading = true;

  // Local trip package selection: '8hr' | '12hr'
  selectedLocalPackage: '8hr' | '12hr' = '8hr';

  // Local trip car options keyed by package
  localCars: any = {
    '8hr': [
      {
        id: 'local_etios_8h', name: 'Toyota Etios', subtitle: 'or equivalent', image: '/assets/images/cars/etios.png',
        price: 2250, kmsIncluded: '80 km', hoursIncluded: '8 hours', seats: '4 Seater', bags: '2 Bags', ac: 'AC',
        type: 'SEDAN', extraKmRate: 14, nightAllowance: 154,
        tc: ['Includes 80 km and 8 hrs.', 'Extra km ₹14/km.', 'Parking and toll extra.']
      },
      {
        id: 'local_suv_8h', name: 'SUV', subtitle: '(6+1 seater)', image: '/assets/images/cars/innova.png',
        price: 2869, kmsIncluded: '80 km', hoursIncluded: '8 hours', seats: '7 Seater', bags: '3 Bags', ac: 'AC',
        type: 'SUV', extraKmRate: 20, nightAllowance: 250,
        tc: ['Includes 80 km and 8 hrs.', 'Extra km ₹20/km.', 'Parking and toll extra.']
      }
    ],
    '12hr': [
      {
        id: 'local_etios_12h', name: 'Toyota Etios', subtitle: 'or equivalent', image: '/assets/images/cars/etios.png',
        price: 2959, kmsIncluded: '120 km', hoursIncluded: '12 hours', seats: '4 Seater', bags: '2 Bags', ac: 'AC',
        type: 'SEDAN', extraKmRate: 14, nightAllowance: 154,
        tc: ['Includes 120 km and 12 hrs.', 'Extra km ₹14/km.', 'Parking and toll extra.']
      },
      {
        id: 'local_suv_12h', name: 'SUV', subtitle: '(6+1 seater)', image: '/assets/images/cars/innova.png',
        price: 3640, kmsIncluded: '120 km', hoursIncluded: '12 hours', seats: '7 Seater', bags: '3 Bags', ac: 'AC',
        type: 'SUV', extraKmRate: 20, nightAllowance: 250,
        tc: ['Includes 120 km and 12 hrs.', 'Extra km ₹20/km.', 'Parking and toll extra.']
      }
    ]
  };

  // Airport trip car options (same cars for both drop/pickup subtypes)
  airportCars = [
    {
      id: 'airport_etios', name: 'Toyota Etios', subtitle: 'or equivalent', image: '/assets/images/cars/etios.png',
      price: 1042, kmsIncluded: '38 km', seats: '4 Seater', bags: '2 Bags', ac: 'AC',
      type: 'SEDAN', extraKmRate: 14, nightAllowance: 154,
      tc: ['Includes 38 km.', 'Extra km ₹14/km.', 'Parking and toll extra.']
    },
    {
      id: 'airport_suv', name: 'SUV', subtitle: '(6+1 seater)', image: '/assets/images/cars/innova.png',
      price: 1771, kmsIncluded: '38 km', seats: '7 Seater', bags: '3 Bags', ac: 'AC',
      type: 'SUV', extraKmRate: 20, nightAllowance: 250,
      tc: ['Includes 38 km.', 'Extra km ₹20/km.', 'Parking and toll extra.']
    },
    {
      id: 'airport_innova', name: 'Toyota Innova', subtitle: 'or equivalent', image: '/assets/images/cars/innova.png',
      price: 1878, kmsIncluded: '38 km', seats: '7 Seater', bags: '3 Bags', ac: 'AC',
      type: 'SUV', extraKmRate: 20, nightAllowance: 250,
      tc: ['Includes 38 km.', 'Extra km ₹20/km.', 'Parking and toll extra.']
    }
  ];

  // Airport sub-type options for the modify modal dropdown
  airportSubTypes = [
    { label: 'Drop to Airport', value: 'drop' },
    { label: 'Pickup from Airport', value: 'pickup' }
  ];

  ngOnInit() {
    // Initial sync
    this.itinerary = this.bookingState.getItinerary();
    this.initModifyForm();
    this.initializeTabs();

    // Mock loading delay to show skeleton
    setTimeout(() => {
      this.isLoading = false;
      this.cdr.markForCheck();
    }, 1500);

    // Subscribe for changes with auto-cleanup

    this.bookingState.currentItinerary$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(itinerary => {
        if (itinerary) {
          this.itinerary = itinerary;
          this.initModifyForm(); // Sync form with updated state
          this.cdr.markForCheck();
        }
      });
  }

  private initializeTabs() {
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
    const pickupDate = this.itinerary?.pickupDate ? this.formatDate(this.itinerary.pickupDate) : this.formatDate(new Date());
    const returnDate = this.itinerary?.returnDate ? this.formatDate(this.itinerary.returnDate) : this.formatDate(new Date());

    this.modifyForm = this.fb.group({
      fromCity: [this.itinerary?.fromCity || ''],
      toCity: [this.itinerary?.toCity || ''],
      pickupDate: [pickupDate],
      returnDate: [returnDate],
      pickupTime: [this.itinerary?.pickupTime || '09:30 PM'],
      // Airport-specific
      airportSubType: [this.itinerary?.airportSubType || 'drop'],
      pickupAddress: [this.itinerary?.pickupAddress || ''],
      dropAirport: [this.itinerary?.dropAirport || '']
    });
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
      const updatedItinerary: Itinerary = {
        ...this.itinerary!,
        fromCity: formVal.fromCity,
        toCity: formVal.toCity,
        pickupDate: formVal.pickupDate,
        pickupTime: formVal.pickupTime,
        ...(this.isRoundTrip && { returnDate: formVal.returnDate }),
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

  /** Label for the airport type used in header and sidebar */
  get airportSubTypeLabel(): string {
    const sub = this.itinerary?.airportSubType;
    return sub === 'pickup' ? 'Pickup from Airport' : 'Drop to Airport';
  }

  /** Cars to show based on trip type and selected package */
  get carsToDisplay(): any[] {
    if (this.isLocal) return this.localCars[this.selectedLocalPackage];
    if (this.isAirport) return this.airportCars;
    return this.availableCars;
  }

  /** Label for the local package, e.g. '8hr/80km' or '12hr/120km' */
  get localPackageLabel(): string {
    return this.selectedLocalPackage === '8hr' ? '8hrs | 80 km' : '12hrs | 120 km';
  }

  selectLocalPackage(pkg: '8hr' | '12hr') {
    this.selectedLocalPackage = pkg;
    this.initializeTabs(); // re-init tabs for the new set of cars
    this.cdr.markForCheck();
  }

  /** Returns car price adjusted for trip type (doubled for round trip) */
  getCarPrice(basePricePerWay: number): number {
    return this.isRoundTrip ? basePricePerWay * 2 : basePricePerWay;
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

  closeAlert() {
    this.showPriceAlert = false;
    this.cdr.markForCheck();
  }

  onSelectCar(carDetails: SelectedCar) {
    this.bookingState.setSelectedCar(carDetails);
    this.router.navigate(['/booking']);
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

}
