import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { PriceRequest, PriceRequestStatus } from '../models/price-request.model';

/**
 * DEMO-ONLY service. Persists Customer-Proposed-Price requests in
 * localStorage under `demo_price_requests`. No backend, no API. On first
 * load it seeds a small set of dummy requests so the Price Requests tab
 * never looks empty during a demo walkthrough.
 */
@Injectable({ providedIn: 'root' })
export class PriceRequestService {
    private readonly STORAGE_KEY = 'demo_price_requests';
    private readonly SEED_FLAG_KEY = 'demo_price_requests_seeded';

    private requestsSubject = new BehaviorSubject<PriceRequest[]>([]);
    public readonly requests$: Observable<PriceRequest[]> = this.requestsSubject.asObservable();

    constructor() {
        this.seedIfNeeded();
        this.requestsSubject.next(this.loadAll());
    }

    list(): PriceRequest[] {
        return this.requestsSubject.value;
    }

    create(input: Omit<PriceRequest, 'id' | 'status' | 'submittedAt' | 'vasServices'> & { vasServices?: string[] }): PriceRequest {
        const req: PriceRequest = {
            ...input,
            vasServices: input.vasServices ?? [],
            id: this.generateId(),
            status: 'pending',
            submittedAt: new Date().toISOString()
        };
        const next = [req, ...this.loadAll()];
        this.persist(next);
        return req;
    }

    private generateId(): string {
        const year = new Date().getFullYear();
        const rand = Math.floor(1000 + Math.random() * 9000);
        return `PR-${year}-${rand}`;
    }

    private loadAll(): PriceRequest[] {
        if (typeof window === 'undefined' || !window.localStorage) return [];
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.warn('[PriceRequestService] load failed', e);
            return [];
        }
    }

    private persist(items: PriceRequest[]): void {
        if (typeof window === 'undefined' || !window.localStorage) return;
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
            this.requestsSubject.next(items);
        } catch (e) {
            console.error('[PriceRequestService] persist failed', e);
        }
    }

    private seedIfNeeded(): void {
        if (typeof window === 'undefined' || !window.localStorage) return;
        if (localStorage.getItem(this.SEED_FLAG_KEY)) return;

        const now = Date.now();
        const minutes = (m: number) => new Date(now - m * 60_000).toISOString();
        const hoursFromNow = (h: number) => new Date(now + h * 3_600_000).toISOString();

        const seed: PriceRequest[] = [
            {
                id: 'PR-2026-4821',
                route: { from: 'Bangalore', to: 'Mysore' },
                pickupDateTime: hoursFromNow(28),
                tripType: 'One Way',
                carType: 'Sedan',
                originalFare: 4200,
                proposedFare: 3500,
                vasServices: ['luggage'],
                autoConfirm: true,
                status: 'accepted',
                submittedAt: minutes(45),
                vendorResponseFare: 3650
            },
            {
                id: 'PR-2026-4756',
                route: { from: 'Mumbai', to: 'Pune' },
                pickupDateTime: hoursFromNow(12),
                tripType: 'One Way',
                carType: 'SUV',
                originalFare: 5800,
                proposedFare: 4900,
                vasServices: [],
                autoConfirm: false,
                status: 'accepted',
                submittedAt: minutes(120),
                vendorResponseFare: 5100
            },
            {
                id: 'PR-2026-4690',
                route: { from: 'Delhi', to: 'Agra' },
                pickupDateTime: hoursFromNow(48),
                tripType: 'Round Trip',
                carType: 'Innova',
                originalFare: 9200,
                proposedFare: 7500,
                vasServices: ['diesel'],
                autoConfirm: false,
                status: 'expired',
                submittedAt: minutes(1500)
            },
            {
                id: 'PR-2026-4612',
                route: { from: 'Hyderabad', to: 'Bangalore' },
                pickupDateTime: hoursFromNow(72),
                tripType: 'One Way',
                carType: 'Crysta',
                originalFare: 12500,
                proposedFare: 10800,
                vasServices: ['luggage', 'new_car'],
                autoConfirm: true,
                status: 'pending',
                submittedAt: minutes(8)
            },
            {
                id: 'PR-2026-4598',
                route: { from: 'Chennai', to: 'Pondicherry' },
                pickupDateTime: hoursFromNow(20),
                tripType: 'One Way',
                carType: 'Hatchback',
                originalFare: 3400,
                proposedFare: 2800,
                vasServices: [],
                autoConfirm: true,
                status: 'pending',
                submittedAt: minutes(15)
            }
        ];

        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(seed));
            localStorage.setItem(this.SEED_FLAG_KEY, '1');
        } catch (e) {
            console.warn('[PriceRequestService] seed failed', e);
        }
    }
}
