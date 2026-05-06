import {
    Component,
    ChangeDetectionStrategy,
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
 * Customer-Proposed-Price modal. Shown when an agent tries to leave the
 * payment screen without paying. Captures a counter-offer and a "auto-
 * confirm if a driver matches" preference. Pure demo — no backend.
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

    /** Emits the created request after Submit. */
    @Output() submitted = new EventEmitter<PriceRequest>();
    /** User wants to abandon the popup AND continue leaving the page. */
    @Output() dismissed = new EventEmitter<void>();
    /** User wants to go back to the payment screen — DO NOT navigate away. */
    @Output() continuePayment = new EventEmitter<void>();

    private priceRequests = inject(PriceRequestService);

    proposedFare: number | null = null;
    note = '';
    autoConfirm = true;
    minFare = 0;
    maxFare = 0;
    showError = false;

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['context'] && this.context) {
            const original = this.context.originalFare || 0;
            this.minFare = Math.round(original * 0.7);
            this.maxFare = original;
            // Sensible default — middle of the suggested band.
            this.proposedFare = Math.round(original * 0.85);
            this.note = this.context.note || '';
            this.autoConfirm = true;
            this.showError = false;
        }
        if (changes['visible'] && this.visible) {
            this.showError = false;
        }
    }

    onBackdropClick(): void {
        // Backdrop click = treat as "continue payment" (safer default — don't
        // navigate the user away from payment by accident).
        this.continuePayment.emit();
    }

    onSubmit(): void {
        if (!this.context || this.proposedFare == null) {
            this.showError = true;
            return;
        }
        const fare = Number(this.proposedFare);
        if (!Number.isFinite(fare) || fare < this.minFare || fare > this.maxFare) {
            this.showError = true;
            return;
        }

        const created = this.priceRequests.create({
            route: { from: this.context.fromCity, to: this.context.toCity },
            pickupDateTime: this.context.pickupDateTime,
            tripType: this.context.tripType,
            carType: this.context.carType,
            originalFare: this.context.originalFare,
            proposedFare: fare,
            note: (this.note || '').trim(),
            autoConfirm: this.autoConfirm
        });
        this.submitted.emit(created);
    }
}
