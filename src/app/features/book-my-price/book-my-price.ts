import {
    Component,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    ElementRef,
    ViewChild,
    AfterViewChecked,
    OnInit,
    OnDestroy,
    inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { Subscription } from 'rxjs';
import { GoogleMapsService } from '../../core/services/google-maps.service';
import { BookMyPriceService } from '../../core/services/book-my-price.service';
import { BookMyPriceRequest, BmpTripType } from '../../core/models/book-my-price.model';
import { FooterComponent } from '../../components/layout/footer/footer';

declare const google: any;

// ── Sub-types used only inside this component ─────────────────────────────────

interface CarOption {
    id:         string;
    label:      string;
    ratePerKm:  number;
    base:       number;
}

interface VasOption {
    id:          string;
    label:       string;
    description: string;
    excludes?:   string;
}

interface RequestCard extends BookMyPriceRequest {
    countdownLabel:   string;
    countdownPercent: number;    // 0–100
    isExpired:        boolean;
    submittedLabel:   string;
}

@Component({
    selector: 'app-book-my-price',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, FooterComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './book-my-price.html',
})
export class BookMyPriceComponent implements OnInit, OnDestroy, AfterViewChecked {

    private googleMaps = inject(GoogleMapsService);
    private bmpService = inject(BookMyPriceService);
    private cdr        = inject(ChangeDetectorRef);
    private router     = inject(Router);

    @ViewChild('pickupInputRef') pickupInputEl?: ElementRef<HTMLInputElement>;
    @ViewChild('dropInputRef')   dropInputEl?:   ElementRef<HTMLInputElement>;

    // ── Trip type ─────────────────────────────────────────────────────────────
    tripType: BmpTripType = 'OW';

    readonly tripTypeOptions: { id: BmpTripType; label: string; icon: string }[] = [
        { id: 'OW', label: 'One Way',    icon: 'arrow-right'      },
        { id: 'RT', label: 'Round Trip', icon: 'arrow-left-right' },
    ];

    setTripType(t: BmpTripType): void {
        this.tripType       = t;
        this.returnDate     = '';
        this.returnTime     = '';
        this.showReturnError = false;
    }

    // ── Pickup ────────────────────────────────────────────────────────────────
    pickupAddress   = '';
    pickupLat:   number | null = null;
    pickupLng:   number | null = null;
    pickupInputMode: 'manual' | 'gps' = 'manual';
    gpsLoading      = false;
    gpsError        = '';

    // ── Drop ──────────────────────────────────────────────────────────────────
    dropAddress = '';
    dropLat:  number | null = null;
    dropLng:  number | null = null;

    // ── Dates / time ──────────────────────────────────────────────────────────
    pickupDate  = '';
    pickupTime  = '';
    returnDate  = '';
    returnTime  = '';

    get minDate(): string { return new Date().toISOString().split('T')[0]; }

    private isPickupTimeValid(): boolean {
        if (!this.pickupDate || !this.pickupTime) return false;
        return new Date(`${this.pickupDate}T${this.pickupTime}`).getTime() - Date.now() >= 4 * 60 * 60 * 1000;
    }

    // ── Car & fare ────────────────────────────────────────────────────────────
    readonly carOptions: CarOption[] = [
        { id: 'Hatchback', label: 'Hatchback', ratePerKm: 11, base: 250 },
        { id: 'Sedan',     label: 'Sedan',     ratePerKm: 13, base: 300 },
        { id: 'SUV',       label: 'SUV',       ratePerKm: 16, base: 350 },
        { id: 'Innova',    label: 'Innova',    ratePerKm: 18, base: 400 },
        { id: 'Crysta',    label: 'Crysta',    ratePerKm: 22, base: 500 },
    ];

    selectedCar   = '';
    distanceKm:   number | null = null;
    originalFare  = 0;
    minFare       = 0;
    maxFare       = 0;
    proposedFare: number | null = null;

    get fareStep(): number { return (this.maxFare - this.minFare) > 500 ? 10 : 5; }

    selectCar(id: string): void {
        this.selectedCar = id;
        this.showCarError = false;
        this.recalcFare();
    }

    /** Fare for any car card (shown even before selection). */
    getFareEstimate(carId: string): number {
        const car = this.carOptions.find(c => c.id === carId);
        if (!car) return 0;
        const km = this.distanceKm ?? 50;
        return Math.round(car.ratePerKm * km + car.base);
    }

    recalcFare(): void {
        const car = this.carOptions.find(c => c.id === this.selectedCar);
        if (!car) return;
        const km      = this.distanceKm ?? 50;
        const raw     = Math.round(car.ratePerKm * km + car.base);
        this.originalFare = raw;
        this.maxFare      = raw;
        this.minFare      = Math.round(raw * 0.8);
        const current     = this.proposedFare ?? Math.round(raw * 0.9);
        this.proposedFare = Math.min(this.maxFare, Math.max(this.minFare, current));
    }

    // ── VAS ───────────────────────────────────────────────────────────────────
    readonly vasOptions: VasOption[] = [
        { id: 'new_car', label: 'New Car Promise',      description: 'Vehicle not older than 3 years', excludes: 'diesel'  },
        { id: 'diesel',  label: 'Diesel Car Guarantee', description: 'Fuel-efficient diesel vehicle',  excludes: 'new_car' },
        { id: 'luggage', label: 'Luggage Carrier',      description: 'Roof-mounted carrier for extra baggage'              },
    ];
    selectedVas:     string[] = [];
    vasConflictMsg   = '';

    toggleVas(id: string): void {
        if (this.selectedVas.includes(id)) {
            this.selectedVas     = this.selectedVas.filter(v => v !== id);
            this.vasConflictMsg  = '';
            return;
        }
        const opt = this.vasOptions.find(o => o.id === id);
        if (opt?.excludes && this.selectedVas.includes(opt.excludes)) {
            const conflict     = this.vasOptions.find(o => o.id === opt.excludes)?.label ?? opt.excludes;
            this.vasConflictMsg = `"${opt.label}" and "${conflict}" cannot be selected together (Govt. Policy).`;
            return;
        }
        this.vasConflictMsg = '';
        this.selectedVas    = [...this.selectedVas, id];
    }

    isVasSelected(id: string): boolean { return this.selectedVas.includes(id); }

    // ── Auto-confirm ──────────────────────────────────────────────────────────
    autoConfirm = true;

    // ── Validation errors ─────────────────────────────────────────────────────
    showPickupError  = false;
    showDropError    = false;
    showCarError     = false;
    showDateError    = false;
    dateErrorMsg     = '';
    showReturnError  = false;
    showFareError    = false;

    // ── Requests panel ────────────────────────────────────────────────────────
    requests:         RequestCard[] = [];
    readonly TTL_MS = 20 * 60 * 1000;

    private sub:   Subscription | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;

    // ── Toast ─────────────────────────────────────────────────────────────────
    showToast    = false;
    toastId      = '';

    // ── Google Maps ───────────────────────────────────────────────────────────
    private mapsNeedsInit = false;
    private pickupAC: any = null;
    private dropAC:   any = null;

    // ─────────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────────────────

    ngOnInit(): void {
        this.mapsNeedsInit = true;

        this.sub = this.bmpService.requests$.subscribe(list => {
            this.requests = list.map(r => this.toCard(r));
            this.cdr.markForCheck();
        });

        // Refresh countdown labels every 30s
        this.timer = setInterval(() => {
            this.requests = this.requests.map(r => this.toCard(r));
            this.cdr.markForCheck();
        }, 30_000);
    }

    ngOnDestroy(): void {
        this.sub?.unsubscribe();
        if (this.timer) clearInterval(this.timer);
    }

    ngAfterViewChecked(): void {
        if (!this.mapsNeedsInit) return;
        if (this.pickupInputEl?.nativeElement) {
            this.mapsNeedsInit = false;
            this.initAutocomplete();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Google Maps autocomplete
    // ─────────────────────────────────────────────────────────────────────────

    private async initAutocomplete(): Promise<void> {
        try { await this.googleMaps.load(); } catch { return; }

        if (this.pickupInputEl?.nativeElement && !this.pickupAC) {
            this.pickupAC = this.googleMaps.attachAutocomplete(this.pickupInputEl.nativeElement);
            this.pickupAC?.addListener('place_changed', () => {
                const p          = this.pickupAC.getPlace();
                this.pickupAddress = p.formatted_address || p.name || '';
                this.pickupLat     = p.geometry?.location?.lat() ?? null;
                this.pickupLng     = p.geometry?.location?.lng() ?? null;
                this.showPickupError = false;
                this.recalcDistance();
                this.cdr.markForCheck();
            });
        }

        if (this.dropInputEl?.nativeElement && !this.dropAC) {
            this.dropAC = this.googleMaps.attachAutocomplete(this.dropInputEl.nativeElement);
            this.dropAC?.addListener('place_changed', () => {
                const p        = this.dropAC.getPlace();
                this.dropAddress = p.formatted_address || p.name || '';
                this.dropLat     = p.geometry?.location?.lat() ?? null;
                this.dropLng     = p.geometry?.location?.lng() ?? null;
                this.showDropError = false;
                this.recalcDistance();
                this.cdr.markForCheck();
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GPS
    // ─────────────────────────────────────────────────────────────────────────

    async detectGps(): Promise<void> {
        this.gpsLoading      = true;
        this.gpsError        = '';
        this.pickupInputMode = 'gps';
        this.cdr.markForCheck();

        if (!navigator.geolocation) {
            this.gpsError        = 'Geolocation not supported by your browser.';
            this.gpsLoading      = false;
            this.pickupInputMode = 'manual';
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
                this.recalcDistance();
                this.cdr.markForCheck();
            },
            () => {
                this.gpsError        = 'Location access denied — please enter address manually.';
                this.pickupInputMode = 'manual';
                this.gpsLoading      = false;
                this.cdr.markForCheck();
            },
            { timeout: 8000 }
        );
    }

    switchToManual(): void {
        this.pickupInputMode = 'manual';
        this.gpsError        = '';
        this.mapsNeedsInit   = true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fare
    // ─────────────────────────────────────────────────────────────────────────

    private haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
        const R    = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a    = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    recalcDistance(): void {
        if (this.pickupLat != null && this.pickupLng != null &&
            this.dropLat != null   && this.dropLng != null) {
            this.distanceKm = Math.round(
                this.haversine(this.pickupLat, this.pickupLng, this.dropLat, this.dropLng)
            );
        } else {
            this.distanceKm = null;
        }
        if (this.selectedCar) this.recalcFare();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Submit
    // ─────────────────────────────────────────────────────────────────────────

    onSubmit(): void {
        this.clearErrors();
        let hasError = false;

        if (!this.pickupAddress.trim()) { this.showPickupError = true; hasError = true; }
        if (!this.dropAddress.trim())   { this.showDropError   = true; hasError = true; }
        if (!this.selectedCar)          { this.showCarError    = true; hasError = true; }

        if (!this.pickupDate || !this.pickupTime) {
            this.showDateError = true;
            this.dateErrorMsg  = 'Please select a pickup date and time.';
            hasError           = true;
        } else if (!this.isPickupTimeValid()) {
            this.showDateError = true;
            this.dateErrorMsg  = 'Pickup must be at least 4 hours from now.';
            hasError           = true;
        }

        if (this.tripType === 'RT' && (!this.returnDate || !this.returnTime)) {
            this.showReturnError = true;
            hasError             = true;
        }

        const fare = Number(this.proposedFare);
        if (this.proposedFare == null || !Number.isFinite(fare) || fare < this.minFare || fare > this.maxFare) {
            this.showFareError = true;
            hasError           = true;
        }

        if (hasError) return;

        const req = this.bmpService.create({
            route: {
                from:    this.pickupAddress.trim(),
                fromLat: this.pickupLat,
                fromLng: this.pickupLng,
                to:      this.dropAddress.trim(),
                toLat:   this.dropLat,
                toLng:   this.dropLng,
            },
            tripType:     this.tripType,
            pickupDate:   this.pickupDate,
            pickupTime:   this.pickupTime,
            returnDate:   this.tripType === 'RT' ? this.returnDate : undefined,
            returnTime:   this.tripType === 'RT' ? this.returnTime : undefined,
            carType:      this.selectedCar,
            distanceKm:   this.distanceKm,
            originalFare: this.maxFare,
            proposedFare: fare,
            vasServices:  [...this.selectedVas],
            autoConfirm:  this.autoConfirm,
        });

        this.toastId   = req.id;
        this.showToast = true;
        this.resetForm();
        setTimeout(() => { this.showToast = false; this.cdr.markForCheck(); }, 6000);
        this.cdr.markForCheck();
    }

    private clearErrors(): void {
        this.showPickupError = false;
        this.showDropError   = false;
        this.showCarError    = false;
        this.showDateError   = false;
        this.dateErrorMsg    = '';
        this.showReturnError = false;
        this.showFareError   = false;
        this.gpsError        = '';
    }

    private resetForm(): void {
        this.pickupAddress   = '';
        this.pickupLat       = null;
        this.pickupLng       = null;
        this.dropAddress     = '';
        this.dropLat         = null;
        this.dropLng         = null;
        this.pickupDate      = '';
        this.pickupTime      = '';
        this.returnDate      = '';
        this.returnTime      = '';
        this.selectedCar     = '';
        this.distanceKm      = null;
        this.originalFare    = 0;
        this.minFare         = 0;
        this.maxFare         = 0;
        this.proposedFare    = null;
        this.selectedVas     = [];
        this.vasConflictMsg  = '';
        this.autoConfirm     = true;
        this.pickupInputMode = 'manual';
        this.pickupAC        = null;
        this.dropAC          = null;
        this.mapsNeedsInit   = true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Requests panel helpers
    // ─────────────────────────────────────────────────────────────────────────

    private toCard(r: BookMyPriceRequest): RequestCard {
        const submittedAt  = new Date(r.submittedAt).getTime();
        const elapsed      = Date.now() - submittedAt;
        const remaining    = Math.max(0, this.TTL_MS - elapsed);
        const isPending    = r.status === 'pending';
        const isExpired    = r.status === 'expired' || (isPending && remaining === 0);

        let countdownLabel: string;
        if (r.status === 'accepted')              countdownLabel = 'Driver matched';
        else if (r.status === 'rejected')         countdownLabel = 'Not accepted';
        else if (isExpired)                       countdownLabel = 'Expired';
        else {
            const m = Math.floor(remaining / 60000);
            const s = Math.floor((remaining % 60000) / 1000);
            countdownLabel = `Expires in ${m}:${s.toString().padStart(2, '0')}`;
        }

        const countdownPercent = isPending && !isExpired
            ? Math.round((remaining / this.TTL_MS) * 100)
            : 0;

        return { ...r, countdownLabel, countdownPercent, isExpired, submittedLabel: this.relativeTime(submittedAt) };
    }

    private relativeTime(ts: number): string {
        const diff = Date.now() - ts;
        const mins = Math.floor(diff / 60000);
        if (mins < 1)  return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24)  return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
    }

    get pendingCount(): number {
        return this.requests.filter(r => r.status === 'pending' && !r.isExpired).length;
    }

    trackRequest(_: number, r: RequestCard): string { return r.id; }

    goToDashboard(): void { this.router.navigate(['/dashboard']); }
}
