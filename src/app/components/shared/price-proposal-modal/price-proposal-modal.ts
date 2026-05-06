import {
    Component,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    ElementRef,
    EventEmitter,
    Input,
    Output,
    ViewChild,
    AfterViewChecked,
    OnChanges,
    SimpleChanges,
    inject
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { PriceRequestService } from '../../../core/services/price-request.service';
import { GoogleMapsService } from '../../../core/services/google-maps.service';
import { PriceRequest } from '../../../core/models/price-request.model';

declare const google: any;

export type ModalTripType = 'OW' | 'RT' | 'Local' | 'Airport';

export interface PriceProposalContext {
    fromCity: string;
    toCity: string;
    pickupDateTime: string;       // ISO
    tripType: string;             // 'One Way' | 'Round Trip' | 'Local' | 'Airport'
    carType: string;
    originalFare: number;
}

interface VasOption {
    id: string;
    label: string;
    description: string;
    excludes?: string;
}

@Component({
    selector: 'app-price-proposal-modal',
    standalone: true,
    imports: [CommonModule, FormsModule, LucideAngularModule, DatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './price-proposal-modal.html'
})
export class PriceProposalModalComponent implements OnChanges, AfterViewChecked {
    @Input() visible = false;
    @Input() context: PriceProposalContext | null = null;

    @Output() submitted = new EventEmitter<PriceRequest>();
    @Output() dismissed = new EventEmitter<void>();
    @Output() continuePayment = new EventEmitter<void>();

    @ViewChild('pickupInputRef') pickupInputEl?: ElementRef<HTMLInputElement>;
    @ViewChild('dropInputRef')   dropInputEl?:   ElementRef<HTMLInputElement>;
    @ViewChild('airportInputRef') airportInputEl?: ElementRef<HTMLInputElement>;

    private priceRequests  = inject(PriceRequestService);
    private googleMaps     = inject(GoogleMapsService);
    private cdr            = inject(ChangeDetectorRef);

    // ── Trip type ────────────────────────────────────────────────────────────
    selectedTripType: ModalTripType = 'OW';

    readonly tripTypeOptions: { id: ModalTripType; label: string; icon: string }[] = [
        { id: 'OW',      label: 'One Way',     icon: 'arrow-right'      },
        { id: 'RT',      label: 'Round Trip',  icon: 'arrow-left-right' },
        { id: 'Local',   label: 'Local',       icon: 'clock'            },
        { id: 'Airport', label: 'Airport',     icon: 'plane'            },
    ];

    setTripType(id: ModalTripType): void {
        this.selectedTripType = id;
        this.showDropError = false;
        // Re-attach autocomplete to relevant inputs after DOM updates
        this.mapsNeedsInit = true;
    }

    get needsDrop(): boolean   { return this.selectedTripType === 'OW' || this.selectedTripType === 'RT'; }
    get needsLocal(): boolean  { return this.selectedTripType === 'Local'; }
    get needsAirport(): boolean { return this.selectedTripType === 'Airport'; }

    // ── Pickup ───────────────────────────────────────────────────────────────
    pickupAddress = '';
    pickupLat: number | null = null;
    pickupLng: number | null = null;
    pickupInputMode: 'manual' | 'gps' = 'manual';
    gpsLoading = false;
    gpsError = '';

    // ── Drop (OW / RT) ───────────────────────────────────────────────────────
    dropAddress = '';
    dropLat: number | null = null;
    dropLng: number | null = null;

    // ── Local ────────────────────────────────────────────────────────────────
    localDuration = 4;
    readonly localDurations = [2, 4, 6, 8, 10];

    // ── Airport ──────────────────────────────────────────────────────────────
    airportDirection: 'to' | 'from' = 'to';
    airportName = '';
    airportLat: number | null = null;
    airportLng: number | null = null;

    // ── Ride category & fare multipliers ─────────────────────────────────────
    selectedRideCategory = '';
    readonly rideCategories = ['Hatchback', 'Sedan', 'SUV', 'Innova', 'Crysta'];

    private readonly fareMultipliers: Record<string, number> = {
        Hatchback: 0.75,
        Sedan:     1.00,
        SUV:       1.25,
        Innova:    1.45,
        Crysta:    1.70,
    };
    private baseFareUnit = 0;

    selectCategory(cat: string): void {
        this.selectedRideCategory = cat;
        this.showCategoryError = false;
        this.recalcFare();
    }

    recalcFare(): void {
        const mul = this.fareMultipliers[this.selectedRideCategory] ?? 1.0;
        const newOriginal = Math.round(this.baseFareUnit * mul);
        this.minFare = Math.round(newOriginal * 0.7);
        this.maxFare = newOriginal;
        const current = this.proposedFare ?? Math.round(newOriginal * 0.85);
        this.proposedFare = Math.min(this.maxFare, Math.max(this.minFare, current));
    }

    // ── Pickup date & time ───────────────────────────────────────────────────
    pickupDate = '';
    pickupTime = '';

    get minDate(): string { return new Date().toISOString().split('T')[0]; }

    isPickupTimeValid(): boolean {
        if (!this.pickupDate || !this.pickupTime) return false;
        return new Date(`${this.pickupDate}T${this.pickupTime}`).getTime() - Date.now() >= 4 * 60 * 60 * 1000;
    }

    // ── Fare ─────────────────────────────────────────────────────────────────
    proposedFare: number | null = null;
    minFare = 0;
    maxFare = 0;
    get fareStep(): number { return (this.maxFare - this.minFare) > 500 ? 10 : 5; }

    // ── VAS ──────────────────────────────────────────────────────────────────
    readonly vasOptions: VasOption[] = [
        { id: 'new_car',  label: 'New Car Promise',        description: 'Vehicle not older than 3 years', excludes: 'diesel' },
        { id: 'diesel',   label: 'Diesel Car Guarantee',   description: 'Fuel-efficient diesel vehicle',  excludes: 'new_car' },
        { id: 'luggage',  label: 'Luggage Carrier',        description: 'Roof-mounted carrier for extra baggage' },
    ];
    selectedVas: string[] = [];
    vasConflictMsg = '';

    toggleVas(id: string): void {
        if (this.selectedVas.includes(id)) {
            this.selectedVas = this.selectedVas.filter(v => v !== id);
            this.vasConflictMsg = '';
            return;
        }
        const opt = this.vasOptions.find(o => o.id === id);
        if (opt?.excludes && this.selectedVas.includes(opt.excludes)) {
            const conflicting = this.vasOptions.find(o => o.id === opt.excludes)?.label ?? opt.excludes;
            this.vasConflictMsg = `"${opt.label}" and "${conflicting}" cannot be selected together (Govt. Policy).`;
            return;
        }
        this.vasConflictMsg = '';
        this.selectedVas = [...this.selectedVas, id];
    }

    isVasSelected(id: string): boolean { return this.selectedVas.includes(id); }

    // ── Auto-confirm ─────────────────────────────────────────────────────────
    autoConfirm = true;

    // ── Validation ───────────────────────────────────────────────────────────
    showPickupError    = false;
    showDropError      = false;
    showCategoryError  = false;
    showDateTimeError  = false;
    dateTimeErrorMsg   = '';
    showFareError      = false;

    // ── Google Maps lifecycle ─────────────────────────────────────────────────
    private mapsNeedsInit = false;
    private pickupAC: any = null;
    private dropAC: any   = null;
    private airportAC: any = null;

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['context'] && this.context) {
            const original = this.context.originalFare || 0;
            const car = this.context.carType?.toLowerCase() || '';
            let contextCategory = 'Sedan';
            if (car.includes('crysta'))      contextCategory = 'Crysta';
            else if (car.includes('innova')) contextCategory = 'Innova';
            else if (car.includes('suv'))    contextCategory = 'SUV';
            else if (car.includes('hatch'))  contextCategory = 'Hatchback';
            this.baseFareUnit = original / (this.fareMultipliers[contextCategory] ?? 1.0);
            this.selectedRideCategory = contextCategory;

            this.pickupAddress = this.context.fromCity || '';
            this.dropAddress   = this.context.toCity   || '';
            this.pickupLat = null; this.pickupLng = null;
            this.dropLat   = null; this.dropLng   = null;

            const ct = this.context.tripType?.toLowerCase() || '';
            this.selectedTripType = ct.includes('round') ? 'RT'
                                  : ct.includes('local') ? 'Local'
                                  : ct.includes('airport') ? 'Airport'
                                  : 'OW';

            if (this.context.pickupDateTime) {
                const d = new Date(this.context.pickupDateTime);
                if (!isNaN(d.getTime())) {
                    this.pickupDate = d.toISOString().split('T')[0];
                    this.pickupTime = d.toTimeString().slice(0, 5);
                }
            }

            this.selectedVas = [];
            this.vasConflictMsg = '';
            this.autoConfirm = true;
            this.clearErrors();
            this.recalcFare();
        }
        if (changes['visible']) {
            if (this.visible) {
                this.clearErrors();
                this.mapsNeedsInit = true;
            } else {
                // Detach autocomplete instances when modal is hidden
                this.pickupAC  = null;
                this.dropAC    = null;
                this.airportAC = null;
                this.mapsNeedsInit = false;
            }
        }
    }

    ngAfterViewChecked(): void {
        if (!this.mapsNeedsInit || !this.visible) return;
        // Inputs are in the DOM; attach Autocomplete
        if (this.pickupInputEl?.nativeElement) {
            this.mapsNeedsInit = false;
            this.initAutocomplete();
        }
    }

    private async initAutocomplete(): Promise<void> {
        try {
            await this.googleMaps.load();
        } catch {
            return; // Maps failed to load — fall back to plain text inputs
        }

        // Pickup autocomplete
        if (this.pickupInputEl?.nativeElement && !this.pickupAC) {
            this.pickupAC = this.googleMaps.attachAutocomplete(this.pickupInputEl.nativeElement);
            if (this.pickupAC) {
                this.pickupAC.addListener('place_changed', () => {
                    const place = this.pickupAC.getPlace();
                    this.pickupAddress = place.formatted_address || place.name || '';
                    this.pickupLat = place.geometry?.location?.lat() ?? null;
                    this.pickupLng = place.geometry?.location?.lng() ?? null;
                    this.showPickupError = false;
                    this.cdr.markForCheck();
                });
            }
        }

        // Drop autocomplete (OW / RT only)
        if (this.dropInputEl?.nativeElement && !this.dropAC) {
            this.dropAC = this.googleMaps.attachAutocomplete(this.dropInputEl.nativeElement);
            if (this.dropAC) {
                this.dropAC.addListener('place_changed', () => {
                    const place = this.dropAC.getPlace();
                    this.dropAddress = place.formatted_address || place.name || '';
                    this.dropLat = place.geometry?.location?.lat() ?? null;
                    this.dropLng = place.geometry?.location?.lng() ?? null;
                    this.showDropError = false;
                    this.cdr.markForCheck();
                });
            }
        }

        // Airport autocomplete
        if (this.airportInputEl?.nativeElement && !this.airportAC) {
            this.airportAC = this.googleMaps.attachAutocomplete(this.airportInputEl.nativeElement, {
                types: ['airport'],
            });
            if (this.airportAC) {
                this.airportAC.addListener('place_changed', () => {
                    const place = this.airportAC.getPlace();
                    this.airportName = place.name || place.formatted_address || '';
                    this.airportLat  = place.geometry?.location?.lat() ?? null;
                    this.airportLng  = place.geometry?.location?.lng() ?? null;
                    this.cdr.markForCheck();
                });
            }
        }
    }

    // ── GPS ───────────────────────────────────────────────────────────────────
    async detectGpsLocation(): Promise<void> {
        this.gpsLoading = true;
        this.gpsError = '';
        this.pickupInputMode = 'gps';
        this.cdr.markForCheck();

        if (!navigator.geolocation) {
            this.gpsError = 'Geolocation is not supported by your browser.';
            this.gpsLoading = false;
            this.cdr.markForCheck();
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                this.pickupLat = pos.coords.latitude;
                this.pickupLng = pos.coords.longitude;
                try {
                    this.pickupAddress = await this.googleMaps.reverseGeocode(pos.coords.latitude, pos.coords.longitude);
                } catch {
                    this.pickupAddress = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
                }
                this.gpsLoading = false;
                this.cdr.markForCheck();
            },
            () => {
                this.gpsError = 'Location access denied — please enter the address manually.';
                this.pickupInputMode = 'manual';
                this.gpsLoading = false;
                this.cdr.markForCheck();
            },
            { timeout: 8000 }
        );
    }

    switchToManual(): void {
        this.pickupInputMode = 'manual';
        this.gpsError = '';
    }

    onBackdropClick(): void { this.continuePayment.emit(); }

    // ── Submit ────────────────────────────────────────────────────────────────
    onSubmit(): void {
        this.clearErrors();
        let hasError = false;

        if (!this.pickupAddress.trim()) { this.showPickupError = true; hasError = true; }

        if (this.needsDrop && !this.dropAddress.trim()) { this.showDropError = true; hasError = true; }

        if (!this.selectedRideCategory) { this.showCategoryError = true; hasError = true; }

        if (!this.pickupDate || !this.pickupTime) {
            this.showDateTimeError = true;
            this.dateTimeErrorMsg = 'Please select a pickup date and time.';
            hasError = true;
        } else if (!this.isPickupTimeValid()) {
            this.showDateTimeError = true;
            this.dateTimeErrorMsg = 'Pickup must be scheduled at least 4 hours from now.';
            hasError = true;
        }

        const fare = Number(this.proposedFare);
        if (this.proposedFare == null || !Number.isFinite(fare) || fare < this.minFare || fare > this.maxFare) {
            this.showFareError = true;
            hasError = true;
        }

        if (hasError) return;

        const from = this.pickupAddress.trim();
        const to   = this.needsDrop    ? this.dropAddress.trim()
                   : this.needsLocal   ? `${this.localDuration}-hour local`
                   : this.airportDirection === 'to' ? `${this.airportName || 'Airport'}`
                   : this.pickupAddress.trim();

        const tripLabel = this.selectedTripType === 'OW'      ? 'One Way'
                        : this.selectedTripType === 'RT'      ? 'Round Trip'
                        : this.selectedTripType === 'Local'   ? 'Local'
                        : `Airport (${this.airportDirection === 'to' ? 'Drop' : 'Pickup'})`;

        const created = this.priceRequests.create({
            route: { from, to },
            pickupDateTime: `${this.pickupDate}T${this.pickupTime}:00`,
            tripType: tripLabel,
            carType: this.selectedRideCategory,
            originalFare: this.maxFare,
            proposedFare: fare,
            vasServices: [...this.selectedVas],
            autoConfirm: this.autoConfirm,
        });
        this.submitted.emit(created);
    }

    private clearErrors(): void {
        this.showPickupError   = false;
        this.showDropError     = false;
        this.showCategoryError = false;
        this.showDateTimeError = false;
        this.dateTimeErrorMsg  = '';
        this.showFareError     = false;
        this.gpsError          = '';
    }
}
