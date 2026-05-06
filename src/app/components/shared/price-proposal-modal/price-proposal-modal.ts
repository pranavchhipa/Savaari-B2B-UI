import {
    Component,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    EventEmitter,
    Input,
    Output,
    OnChanges,
    SimpleChanges,
    inject
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { PriceRequestService } from '../../../core/services/price-request.service';
import { PriceRequest } from '../../../core/models/price-request.model';

export interface PriceProposalContext {
    fromCity: string;
    toCity: string;
    pickupDateTime: string;       // ISO
    tripType: string;             // 'One Way' | 'Round Trip' | 'Local' | 'Airport'
    carType: string;              // 'Sedan' | 'SUV' | ...
    originalFare: number;
    note?: string;
}

/**
 * Counter-offer (price proposal) modal. Captures pickup/drop locations,
 * trip type, ride category, pickup date/time, and a proposed fare.
 * Booking window must be at least 4 hours out. Pure demo — no backend.
 */
@Component({
    selector: 'app-price-proposal-modal',
    standalone: true,
    imports: [CommonModule, FormsModule, LucideAngularModule, DatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './price-proposal-modal.html'
})
export class PriceProposalModalComponent implements OnChanges {
    @Input() visible = false;
    @Input() context: PriceProposalContext | null = null;

    /** Emits the created request after a successful Submit. */
    @Output() submitted = new EventEmitter<PriceRequest>();
    /** User chose to abandon — navigate away from payment. */
    @Output() dismissed = new EventEmitter<void>();
    /** User wants to return to the payment screen — do not navigate away. */
    @Output() continuePayment = new EventEmitter<void>();

    private priceRequests = inject(PriceRequestService);
    private cdr = inject(ChangeDetectorRef);

    // ── Pickup location ─────────────────────────────────────────────────────
    pickupInputMode: 'gps' | 'manual' = 'manual';
    pickupAddress = '';
    pickupLat: number | null = null;
    pickupLng: number | null = null;
    gpsLoading = false;
    gpsError = '';

    // ── Drop location ───────────────────────────────────────────────────────
    dropAddress = '';

    // ── Trip type ───────────────────────────────────────────────────────────
    selectedTripType: 'OW' | 'RT' = 'OW';
    readonly tripTypes: { id: 'OW' | 'RT'; label: string }[] = [
        { id: 'OW', label: 'One Way' },
        { id: 'RT', label: 'Round Trip' },
    ];
    setTripType(id: 'OW' | 'RT'): void { this.selectedTripType = id; }

    // ── Ride category ───────────────────────────────────────────────────────
    selectedRideCategory = '';
    readonly rideCategories = ['Hatchback', 'Sedan', 'SUV', 'Innova', 'Crysta'];

    // ── Pickup date & time (must be ≥ 4 hours from now) ────────────────────
    pickupDate = '';   // YYYY-MM-DD
    pickupTime = '';   // HH:mm

    // ── Fare ────────────────────────────────────────────────────────────────
    proposedFare: number | null = null;
    minFare = 0;
    maxFare = 0;

    // ── Passenger note ──────────────────────────────────────────────────────
    note = '';

    // ── Auto-confirm ────────────────────────────────────────────────────────
    autoConfirm = true;

    // ── Validation state ────────────────────────────────────────────────────
    showPickupError = false;
    showDropError = false;
    showCategoryError = false;
    showDateTimeError = false;
    dateTimeErrorMsg = '';
    showFareError = false;

    // ── Computed helpers ────────────────────────────────────────────────────
    get minDate(): string {
        return new Date().toISOString().split('T')[0];
    }

    get fareStep(): number {
        const range = this.maxFare - this.minFare;
        return range > 500 ? 10 : 5;
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['context'] && this.context) {
            const original = this.context.originalFare || 0;
            this.minFare = Math.round(original * 0.7);
            this.maxFare = original;
            this.proposedFare = Math.round(original * 0.85);
            this.note = this.context.note || '';
            this.autoConfirm = true;
            this.clearErrors();

            // Pre-populate fields from context (all remain editable)
            this.pickupAddress = this.context.fromCity || '';
            this.dropAddress = this.context.toCity || '';

            const ct = this.context.tripType?.toLowerCase() || '';
            this.selectedTripType = ct.includes('round') ? 'RT' : 'OW';

            const car = this.context.carType?.toLowerCase() || '';
            if (car.includes('crysta'))          this.selectedRideCategory = 'Crysta';
            else if (car.includes('innova'))     this.selectedRideCategory = 'Innova';
            else if (car.includes('suv'))        this.selectedRideCategory = 'SUV';
            else if (car.includes('hatch'))      this.selectedRideCategory = 'Hatchback';
            else                                 this.selectedRideCategory = 'Sedan';

            if (this.context.pickupDateTime) {
                const d = new Date(this.context.pickupDateTime);
                if (!isNaN(d.getTime())) {
                    this.pickupDate = d.toISOString().split('T')[0];
                    this.pickupTime = d.toTimeString().slice(0, 5);
                }
            }
        }
        if (changes['visible'] && this.visible) {
            this.clearErrors();
        }
    }

    detectGpsLocation(): void {
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
            (pos) => {
                this.pickupLat = pos.coords.latitude;
                this.pickupLng = pos.coords.longitude;
                this.pickupAddress = `Current Location (${pos.coords.latitude.toFixed(4)}°N, ${pos.coords.longitude.toFixed(4)}°E)`;
                this.gpsLoading = false;
                this.cdr.markForCheck();
            },
            () => {
                // Permission denied or unavailable — demo fallback
                this.pickupLat = 12.9716;
                this.pickupLng = 77.5946;
                this.pickupAddress = 'Bangalore, Karnataka';
                this.gpsError = 'Location access denied — using an approximate location.';
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

    isPickupTimeValid(): boolean {
        if (!this.pickupDate || !this.pickupTime) return false;
        const picked = new Date(`${this.pickupDate}T${this.pickupTime}`);
        return picked.getTime() - Date.now() >= 4 * 60 * 60 * 1000;
    }

    onBackdropClick(): void {
        // Backdrop click = "return to payment" (safer — never accidentally navigate away)
        this.continuePayment.emit();
    }

    onSubmit(): void {
        this.clearErrors();
        let hasError = false;

        if (!this.pickupAddress.trim()) {
            this.showPickupError = true;
            hasError = true;
        }
        if (!this.dropAddress.trim()) {
            this.showDropError = true;
            hasError = true;
        }
        if (!this.selectedRideCategory) {
            this.showCategoryError = true;
            hasError = true;
        }
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

        const pickupDateTime = `${this.pickupDate}T${this.pickupTime}:00`;

        const created = this.priceRequests.create({
            route: { from: this.pickupAddress.trim(), to: this.dropAddress.trim() },
            pickupDateTime,
            tripType: this.selectedTripType === 'RT' ? 'Round Trip' : 'One Way',
            carType: this.selectedRideCategory,
            originalFare: this.context?.originalFare ?? fare,
            proposedFare: fare,
            note: (this.note || '').trim(),
            autoConfirm: this.autoConfirm
        });
        this.submitted.emit(created);
    }

    private clearErrors(): void {
        this.showPickupError = false;
        this.showDropError = false;
        this.showCategoryError = false;
        this.showDateTimeError = false;
        this.dateTimeErrorMsg = '';
        this.showFareError = false;
        this.gpsError = '';
    }
}
