import { Component, OnInit, inject, ChangeDetectionStrategy, ChangeDetectorRef, DestroyRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ReactiveFormsModule, FormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { LucideAngularModule, Fuel, UserCheck, Moon, Receipt, FileText, Banknote, ParkingCircle, Gauge, Users, Briefcase, Snowflake, ChevronDown, ChevronRight, Calendar, Clock } from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BookingStateService, Itinerary, SelectedCar } from '../../core/services/booking-state.service';
import { MarkupService } from '../../core/services/markup.service';
import { CommissionService } from '../../core/services/commission.service';
import { AnalyticsService } from '../../core/services/analytics.service';
import { AvailabilityService } from '../../core/services/availability.service';
import { TripTypeService } from '../../core/services/trip-type.service';
import { AvailableCar, AvailabilityRequest, City } from '../../core/models';
import { CityService } from '../../core/services/city.service';
import { toSavaariDateTime, calculateDuration } from '../../core/utils/date-format.util';
import { AddressAutocompleteService } from '../../core/services/address-autocomplete.service';

import { FooterComponent } from '../../components/layout/footer/footer';
import { DatePickerModule } from 'primeng/datepicker';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { SelectModule } from 'primeng/select';

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
  packageId?: string;
  urgentBookingFlag?: number;
  tc: string[];
  inclusions: string[];
  exclusions: string[];
}

@Component({
  selector: 'app-select-car',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    LucideAngularModule,
    ReactiveFormsModule,
    FormsModule,
    FooterComponent,
    DatePickerModule,
    AutoCompleteModule,
    SelectModule
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
  private commissionService = inject(CommissionService);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  private location = inject(Location);
  private analytics = inject(AnalyticsService);
  private availabilityService = inject(AvailabilityService);
  private tripTypeService = inject(TripTypeService);
  private cityService = inject(CityService);
  private addressService = inject(AddressAutocompleteService);

  itinerary: Itinerary | null = null;
  modifyForm!: FormGroup;

  // Toggles for the tabs on the car cards
  activeTab: { [carId: string]: string } = {};

  // Cars from availability API (mapped to display format)
  availableCars: DisplayCar[] = [];

  showPriceAlert = !sessionStorage.getItem('priceAlertDismissed');
  isModifyModalOpen = false;
  minPickupDate: Date = new Date();
  minReturnDate: Date = new Date();
  /** Time floor for urgent bookings — only applies when pickupDate === today. */
  minPickupTime: Date | null = null;
  /** Earliest bookable gap from "now" — agents must book at least N hours ahead. */
  private readonly URGENT_GAP_HOURS = 4;
  isLoading = true;

  // Local trip package selection: '8hr' | '12hr'
  selectedLocalPackage: '8hr' | '12hr' = '8hr';

  // Airport sub-type options for the modify modal dropdown
  airportSubTypes = [
    { label: 'Drop to Airport', value: 'drop' },
    { label: 'Pickup from Airport', value: 'pickup' }
  ];

  // City search for modify modal
  sourceCities: City[] = [];
  destinationCities: City[] = [];
  filteredSourceCities: City[] = [];
  filteredDestinationCities: City[] = [];
  filteredAirports: City[] = [];
  airportList: City[] = [];

  // Round Trip multi-city stops in modify modal
  modifyExtraDestinations: City[] = [];
  readonly MAX_DESTINATIONS = 12;
  filteredLocalities: any[] = [];
  selectedFromCity: City | null = null;
  selectedToCity: City | null = null;

  ngOnInit() {
    this.itinerary = this.bookingState.getItinerary();
    if (this.itinerary?.localPackage === '12hr/120km') {
      this.selectedLocalPackage = '12hr';
    }
    this.initModifyForm();

    // Load cars from availability response
    this.loadCarsFromAvailability();
    this.initializeTabs();

    // Fetch agent commission data (matches beta site — 2x get-commission calls)
    this.commissionService.getCommission()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();

    // NOTE: page-load event is NOT fired on select-car. It fires only once
    // per session entry on the dashboard. Re-firing it here was causing a
    // duplicate page-load in analytics for every search → select-car
    // navigation. Removed (April 2026).

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
      // Filter out cars with 0 fare (e.g. Minibus placeholder entries from API)
      this.availableCars = response.cars
        .filter(car => car.fare > 0)
        .map(car => this.mapApiCarToDisplay(car));
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

    // Use T&C from API as-is
    const tc = car.tncData?.length ? car.tncData : [];

    const hoursInc = car.hoursIncluded ?? 0;

    return {
      id: car.carId || `car_${typeId}`,
      carTypeId: typeId,
      name: car.carName,
      subtitle: 'or equivalent',
      image: image,
      price: car.fare,
      regularFare: car.originalFare,
      kmsIncluded: `${kmsInc} KMs`,
      hoursIncluded: hoursInc > 0 ? `${hoursInc} hrs` : undefined,
      seats,
      bags,
      ac: 'AC',
      type: car.carType || 'SEDAN',
      extraKmRate: extraKm,
      nightAllowance: nightAllow,
      packageId: car.packageId ? String(car.packageId) : undefined,
      urgentBookingFlag: car.urgentBookingFlag,
      tc,
      inclusions: car.inclusions?.length ? car.inclusions.map(t => this.decodeUnicode(t)) : ['Fuel Charges', 'Driver Allowance', `${kmsInc} KMs`],
      exclusions: car.exclusions?.length
        ? car.exclusions.map(t => {
            const decoded = this.decodeUnicode(t);
            if (/night allowance/i.test(decoded) && nightAllow > 0) {
              return `Night Allowance (₹${nightAllow})`;
            }
            return decoded;
          })
        : ['Tolls & Parking', 'State Taxes']
    };
  }

  /** Map car name to studio-quality car photo, with type ID fallback */
  /** Decode unicode escapes like \u20B9 → ₹ in API strings */
  private decodeUnicode(text: string): string {
    return text.replace(/\\u([0-9A-Fa-f]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
  }

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

    // PrimeNG AutoComplete needs an OBJECT (not a string) so the chosen value
    // displays its `name` field correctly and (onSelect) wiring works on edit.
    const fromCityObj = this.itinerary?.fromCityId
      ? { id: this.itinerary.fromCityId, name: this.itinerary.fromCity || '' } as City
      : null;
    const toCityObj = this.itinerary?.toCityId
      ? { id: this.itinerary.toCityId, name: this.itinerary.toCity || '' } as City
      : null;
    // Cache them so submitModifyModal sees the original cities even when the
    // user only edits the date / time and never touches the autocomplete.
    this.selectedFromCity = fromCityObj;
    this.selectedToCity = toCityObj;

    this.modifyForm = this.fb.group({
      fromCity: [fromCityObj],
      toCity: [toCityObj],
      pickupDate: [pickupDate],
      returnDate: [returnDate],
      pickupTime: [pickupTime],
      airportSubType: [this.itinerary?.airportSubType || 'drop'],
      pickupAddress: [this.itinerary?.pickupAddress || ''],
      dropAirport: [this.itinerary?.dropAirport || ''],
      airportLocality: [null]
    });

    // Set min return date to day after pickup + apply urgent-booking gap rule
    this.updateMinReturnDate(pickupDate);
    this.updateUrgentGapConstraints(pickupDate);

    // When pickup date changes, adjust min return date + recompute time floor.
    // Same-day return is allowed, so only push the return forward when it is
    // strictly BEFORE the new pickup day.
    this.modifyForm.get('pickupDate')?.valueChanges.subscribe((newPickup: Date) => {
      if (newPickup) {
        this.updateMinReturnDate(newPickup);
        this.updateUrgentGapConstraints(newPickup);
        const currentReturn = this.modifyForm.get('returnDate')?.value;
        if (currentReturn) {
          const returnNorm = new Date(currentReturn);
          returnNorm.setHours(0, 0, 0, 0);
          const pickupNorm = new Date(newPickup);
          pickupNorm.setHours(0, 0, 0, 0);
          if (returnNorm.getTime() < pickupNorm.getTime()) {
            this.modifyForm.patchValue({ returnDate: new Date(pickupNorm) }, { emitEvent: false });
          }
        }
        this.cdr.markForCheck();
      }
    });
  }

  /** Same-day return is allowed — minReturnDate equals the pickup day itself. */
  private updateMinReturnDate(pickupDate: Date): void {
    const sameDay = new Date(pickupDate);
    sameDay.setHours(0, 0, 0, 0);
    this.minReturnDate = sameDay;
  }

  /** Earliest bookable instant: now + URGENT_GAP_HOURS, rounded UP to next 15-min slot. */
  private getEarliestBookableInstant(): Date {
    const t = new Date();
    t.setHours(t.getHours() + this.URGENT_GAP_HOURS);
    t.setSeconds(0, 0);
    const rem = t.getMinutes() % 15;
    if (rem !== 0) t.setMinutes(t.getMinutes() + (15 - rem));
    return t;
  }

  private isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  /**
   * Mirrors dashboard's urgent-booking gap rule. Computes minPickupDate /
   * minPickupTime against the now+4h floor and auto-bumps the pickup time
   * when it falls below it. Only constrains the time spinner when pickupDate
   * is today; future dates allow any time.
   */
  private updateUrgentGapConstraints(pickupDate: Date | null): void {
    const earliest = this.getEarliestBookableInstant();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const earliestDay = new Date(earliest);
    earliestDay.setHours(0, 0, 0, 0);
    this.minPickupDate = earliestDay.getTime() > today.getTime() ? earliestDay : today;

    if (!pickupDate) {
      this.minPickupTime = null;
      this.cdr.markForCheck();
      return;
    }

    const picked = new Date(pickupDate);
    picked.setHours(0, 0, 0, 0);
    if (picked.getTime() < this.minPickupDate.getTime()) {
      this.modifyForm.get('pickupDate')?.setValue(new Date(this.minPickupDate));
      return; // valueChanges will re-fire and re-enter this method
    }

    if (this.isSameDay(picked, today) && this.isSameDay(today, earliest)) {
      this.minPickupTime = earliest;
      const currentTime: Date | null = this.modifyForm.get('pickupTime')?.value;
      if (currentTime instanceof Date) {
        const candidate = new Date();
        candidate.setHours(currentTime.getHours(), currentTime.getMinutes(), 0, 0);
        if (candidate.getTime() < earliest.getTime()) {
          this.modifyForm.get('pickupTime')?.setValue(new Date(earliest));
        }
      }
    } else {
      this.minPickupTime = null;
    }
    this.cdr.markForCheck();
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

  /** Strip state from full city name: "Bangalore, Karnataka" → "Bangalore" */
  getCityOnly(fullName: string): string {
    if (!fullName) return '';
    return fullName.split(',')[0].trim();
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
    this.loadSourceCities();
    if (this.isAirport) this.loadAirports();
    // Load destination cities if we have a source city
    if (this.itinerary?.fromCityId && !this.isLocal && !this.isAirport) {
      this.loadDestinationCities(this.itinerary.fromCityId);
    }
    // Restore extra destinations from itinerary for round trip
    this.modifyExtraDestinations = (this.itinerary?.extraDestinations || []).map(stop => ({
      id: stop.cityId,
      name: stop.cityName
    } as City));
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

      const fromCity = this.selectedFromCity || (typeof formVal.fromCity === 'object' ? formVal.fromCity : null);
      const toCity = this.selectedToCity || (typeof formVal.toCity === 'object' ? formVal.toCity : null);

      // Map modify modal stops back to ItineraryStop format
      const updatedStops = this.modifyExtraDestinations
        .filter(c => c && c.id)
        .map(c => ({ cityId: c.id, cityName: c.name, cityOnly: c.name?.split(',')[0]?.trim() }));

      const updatedItinerary: Itinerary = {
        ...this.itinerary!,
        fromCity: fromCity?.name || (typeof formVal.fromCity === 'string' ? formVal.fromCity : this.itinerary!.fromCity),
        fromCityId: fromCity?.id || this.itinerary!.fromCityId,
        toCity: toCity?.name || (typeof formVal.toCity === 'string' ? formVal.toCity : this.itinerary!.toCity),
        toCityId: toCity?.id || this.itinerary!.toCityId,
        pickupDate: pickupDate,
        pickupTime: pickupTime,
        ...(this.isRoundTrip && { returnDate: returnDate, extraDestinations: updatedStops }),
        ...(this.isLocal && { localPackage: this.selectedLocalPackage === '8hr' ? '8hr/80km' : '12hr/120km' }),
        ...(this.isAirport && {
          airportSubType: formVal.airportSubType,
          pickupAddress: formVal.pickupAddress,
          dropAirport: formVal.dropAirport
        })
      };
      this.bookingState.setItinerary(updatedItinerary);
      this.itinerary = updatedItinerary;
      this.isModifyModalOpen = false;
      this.isLoading = true;
      this.cdr.markForCheck();

      // Re-fetch availability with updated params — mirror dashboard's onSearch
      // so all trip-type quirks (Local empty subTripType, Round Trip multi-city,
      // Airport extras) stay in sync between the two entry points.
      const apiParams = this.tripTypeService.mapUiTabToApiParams(updatedItinerary.tripType || 'One Way', {
        airportSubType: updatedItinerary.airportSubType,
        localPackage: updatedItinerary.localPackage
      });

      const pickupDateObj = pickupDate instanceof Date ? pickupDate : new Date(pickupDate);
      const returnDateObj = returnDate instanceof Date ? returnDate : (returnDate ? new Date(returnDate) : null);

      // Round Trip multi-city: send all destinations as comma-separated list
      // (matches dashboard widget — without this, extras like "Coorg" silently drop)
      const extras = (updatedItinerary.extraDestinations || []).filter((c: any) => c?.cityId);
      const destinationCityValue: string | number | undefined = (() => {
        if (this.isAirport) return undefined; // airport availability ignores destinationCity
        if (this.isRoundTrip && extras.length && updatedItinerary.toCityId) {
          return [updatedItinerary.toCityId, ...extras.map((c: any) => c.cityId)].join(',');
        }
        return updatedItinerary.toCityId;
      })();

      const availabilityRequest: AvailabilityRequest = {
        sourceCity: updatedItinerary.fromCityId!,
        tripType: apiParams.tripType,
        // Local sends empty subTripType so backend returns ALL packages (R1/R2/R3)
        // for the on-page package selector — same as dashboard.
        subTripType: this.isLocal ? '' : apiParams.subTripType,
        pickupDateTime: toSavaariDateTime(pickupDateObj, pickupTime),
        duration: this.isRoundTrip && returnDateObj
          ? calculateDuration(pickupDateObj, returnDateObj)
          : 1,
        ...(destinationCityValue !== undefined && destinationCityValue !== '' && { destinationCity: destinationCityValue }),
        // Airport: forward the resolved place / airport metadata that the
        // original dashboard search captured. Without these the API returns 404.
        ...(this.isAirport && {
          airport_id: (updatedItinerary as any).airport_id || (updatedItinerary as any).airportId || '',
          airport_name: (updatedItinerary as any).airport_name || (updatedItinerary as any).airportName || updatedItinerary.dropAirport || '',
          terminalId: '',
          selectPlaceId: (updatedItinerary as any).selectPlaceId || '',
          custShortAddress: (updatedItinerary as any).custShortAddress || updatedItinerary.pickupAddress || '',
          customerLatLong: (updatedItinerary as any).customerLatLong || '',
          ...((updatedItinerary as any).airportLocalityId && { localityId: (updatedItinerary as any).airportLocalityId }),
        })
      };

      this.availabilityService.checkAvailability(availabilityRequest).subscribe({
        next: (response) => {
          this.bookingState.setAvailabilityResponse(response);
          this.loadCarsFromAvailability();
          this.initializeTabs();
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoading = false;
          this.availableCars = [];
          this.cdr.markForCheck();
        }
      });
    }
  }

  private getModifyApiParams() {
    return this.tripTypeService.mapUiTabToApiParams(this.itinerary?.tripType || 'One Way', {
      airportSubType: this.itinerary?.airportSubType,
      localPackage: this.itinerary?.localPackage
    });
  }

  /** Load source cities for modify modal */
  loadSourceCities() {
    if (this.sourceCities.length) return;
    const apiParams = this.getModifyApiParams();
    this.cityService.getSourceCities(apiParams.tripType, apiParams.subTripType).subscribe(cities => {
      this.sourceCities = cities;
      this.cdr.markForCheck();
    });
  }

  /** Load destination cities based on selected source */
  loadDestinationCities(sourceId: number) {
    const apiParams = this.getModifyApiParams();
    this.cityService.getDestinationCities(apiParams.tripType, apiParams.subTripType, sourceId).subscribe(cities => {
      this.destinationCities = cities;
      this.cdr.markForCheck();
    });
  }

  /** Load airport list */
  loadAirports() {
    if (this.airportList.length) return;
    this.cityService.getAirportList().subscribe(airports => {
      this.airportList = airports;
      this.cdr.markForCheck();
    });
  }

  filterSourceCities(event: any) {
    this.filteredSourceCities = this.filterCitiesRanked(this.sourceCities, event.query);
  }

  filterDestinationCities(event: any) {
    this.filteredDestinationCities = this.filterCitiesRanked(this.destinationCities, event.query);
  }

  // ── Modify modal: extra stop management ──

  addModifyStop() {
    if (this.modifyExtraDestinations.length >= this.MAX_DESTINATIONS - 1) return;
    // Don't add if TO city isn't filled
    const toCity = this.modifyForm.get('toCity')?.value;
    if (!toCity || typeof toCity !== 'object' || !toCity.id) return;
    // Don't add if last stop is empty
    if (this.modifyExtraDestinations.length > 0) {
      const last = this.modifyExtraDestinations[this.modifyExtraDestinations.length - 1];
      if (!last || typeof last !== 'object' || !last.id) return;
    }
    this.modifyExtraDestinations.push(null as any);
    this.cdr.markForCheck();
  }

  removeModifyStop(index: number) {
    this.modifyExtraDestinations.splice(index, 1);
    this.cdr.markForCheck();
  }

  onModifyStopSelect(event: any, index: number) {
    const city: City = event.value || event;
    this.modifyExtraDestinations[index] = city;
  }

  filterModifyStopCities(event: any) {
    this.filteredDestinationCities = this.filterCitiesRanked(this.destinationCities, event.query);
  }

  filterAirports(event: any) {
    const q = (event.query || '').toLowerCase();
    this.filteredAirports = this.airportList.filter(a => a.name.toLowerCase().includes(q)).slice(0, 20);
  }

  filterLocalities(event: any) {
    this.addressService.searchAddress(event.query).subscribe(results => {
      this.filteredLocalities = results;
      this.cdr.markForCheck();
    });
  }

  onFromCitySelect(event: any) {
    const city = event.value || event;
    this.selectedFromCity = city;
    if (city?.id && !this.isLocal) {
      this.loadDestinationCities(city.id);
    }
  }

  onToCitySelect(event: any) {
    this.selectedToCity = event.value || event;
  }

  private filterCitiesRanked(cities: City[], query: string): City[] {
    const q = query.toLowerCase();
    return cities
      .filter(c => c.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name);
      })
      .slice(0, 20);
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

  /** True when an airport booking was auto-converted to One Way (different city) */
  get isAirportConverted(): boolean {
    return !!(this.itinerary as any)?.airportConvertedToOneWay;
  }

  get airportSubTypeLabel(): string {
    const sub = this.itinerary?.airportSubType;
    return sub === 'pickup' ? 'Pickup from Airport' : 'Drop to Airport';
  }

  /** Returns the T&C page slug based on trip type and city */
  get tncSlug(): string {
    const tripType = this.itinerary?.tripType;
    const sourceCity = (this.itinerary?.fromCity || '').toLowerCase();
    const metros = ['bangalore', 'bengaluru', 'mumbai', 'delhi', 'new delhi', 'chennai', 'hyderabad', 'kolkata', 'pune', 'ahmedabad'];

    if (tripType === 'One Way') return 'oneway-outstation-trip';
    if (tripType === 'Round Trip') return 'outstation-trip';
    if (tripType === 'Local') {
      return metros.includes(sourceCity) ? 'local-trip-metros' : 'local-trip';
    }
    if (tripType === 'Airport') {
      return (sourceCity === 'bangalore' || sourceCity === 'bengaluru') ? 'bangalore-airport-trip' : 'airport-trip';
    }
    return 'outstation-trip'; // fallback
  }

  /** Cars to show — sorted by price (low to high), filtered by local package */
  get carsToDisplay(): DisplayCar[] {
    let cars = [...this.availableCars];
    if (this.isLocal) {
      const targetHours = this.selectedLocalPackage === '8hr' ? '8 hrs' : '12 hrs';
      cars = cars.filter(c => c.hoursIncluded === targetHours);
    }
    return cars.sort((a, b) => a.price - b.price);
  }

  get localPackageLabel(): string {
    return this.selectedLocalPackage === '8hr' ? '8hrs | 80 km' : '12hrs | 120 km';
  }

  selectLocalPackage(pkg: '8hr' | '12hr') {
    if (this.selectedLocalPackage === pkg) return;
    this.selectedLocalPackage = pkg;

    // Update itinerary with new local package
    const localPackage = pkg === '8hr' ? '8hr/80km' : '12hr/120km';
    if (this.itinerary) {
      this.itinerary.localPackage = localPackage;
      this.bookingState.setItinerary(this.itinerary);
    }

    // No API re-fetch needed — API returns all packages (R1=8hr, R2=12hr, R3=4hr)
    // carsToDisplay getter filters by selectedLocalPackage
    this.cdr.markForCheck();
  }

  /** Returns car price — API already returns correct round trip total */
  getCarPrice(baseFare: number): number {
    return baseFare;
  }

  /** Returns KMs label — API already returns correct round trip total */
  getCarKms(baseKms: string): string {
    return baseKms;
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
    sessionStorage.setItem('priceAlertDismissed', '1');
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
      packageId: car.packageId,
      urgentBookingFlag: car.urgentBookingFlag,
    };
    this.bookingState.setSelectedCar(selectedCar);
    // Lifecycle event: agent picked a car — funnel step 2 in B2B analytics
    // pipeline (backend team spec, April 2026).
    // Field shape mirrors savaari.com select_car — car_type is the numeric
    // carTypeId (e.g. "18"), NOT the display label (e.g. "AC Mid-Size Plus").
    // car_rate replaces `fare`. pickup_city/drop_city replace from_city/to_city.
    // car_name is intentionally omitted per backend spec.
    this.analytics.trackSelectCar({
      trip_type: this.itinerary?.tripType || '',
      trip_subtype: this.itinerary?.subTripType || '',
      car_type: car.carTypeId ? String(car.carTypeId) : '',
      car_rate: selectedCar.price,
      pickup_city: this.itinerary?.fromCity || '',
      drop_city: this.itinerary?.toCity || '',
    });
    this.router.navigate(['/booking']);
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

}
