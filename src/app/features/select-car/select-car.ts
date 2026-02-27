import { Component, OnInit, inject, ChangeDetectionStrategy, ChangeDetectorRef, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { LucideAngularModule, Fuel, UserCheck, Moon, Receipt, FileText, Banknote, ParkingCircle, Gauge, Users, Briefcase, Snowflake, ChevronDown, ChevronRight, Calendar, Clock } from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BookingStateService, Itinerary, SelectedCar } from '../../core/services/booking-state.service';

@Component({
  selector: 'app-select-car',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    ReactiveFormsModule
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

  ngOnInit() {
    // Initial sync
    this.itinerary = this.bookingState.getItinerary();
    this.initModifyForm();
    this.initializeTabs();

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

    this.modifyForm = this.fb.group({
      fromCity: [this.itinerary?.fromCity || ''],
      toCity: [this.itinerary?.toCity || ''],
      pickupDate: [pickupDate],
      pickupTime: [this.itinerary?.pickupTime || '09:30 PM']
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
      // Parse DD-MM-YYYY back to Date if needed, but for dummy search it's fine as a string
      const updatedItinerary: Itinerary = {
        ...this.itinerary!,
        ...this.modifyForm.value
      };
      this.bookingState.setItinerary(updatedItinerary);
      this.isModifyModalOpen = false;
      this.cdr.markForCheck();
    }
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
}
