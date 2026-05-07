import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { BookMyPriceRequest, BmpStatus } from '../models/book-my-price.model';

const STORAGE_KEY = 'b2b_book_my_price_requests';
const TTL_MS      = 20 * 60 * 1000;   // 20 minutes

@Injectable({ providedIn: 'root' })
export class BookMyPriceService {

    private readonly _requests$ = new BehaviorSubject<BookMyPriceRequest[]>(this.load());
    readonly requests$: Observable<BookMyPriceRequest[]> = this._requests$.asObservable();

    private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

    constructor() {
        // Re-schedule demo updates for any pending requests that survived a reload.
        this._requests$.getValue().forEach(r => this.scheduleDemoUpdate(r));
    }

    // ── Public API ────────────────────────────────────────────────────────────

    create(input: Omit<BookMyPriceRequest, 'id' | 'status' | 'submittedAt'>): BookMyPriceRequest {
        const req: BookMyPriceRequest = {
            ...input,
            id:          `BMP-${Date.now().toString(36).toUpperCase()}`,
            status:      'pending',
            submittedAt: new Date().toISOString(),
        };
        this.save([req, ...this._requests$.getValue()]);
        this.scheduleDemoUpdate(req);
        return req;
    }

    clearAll(): void {
        this.timers.forEach(t => clearTimeout(t));
        this.timers.clear();
        this.save([]);
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    private load(): BookMyPriceRequest[] {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch {
            return [];
        }
    }

    private save(list: BookMyPriceRequest[]): void {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* non-fatal */ }
        this._requests$.next(list);
    }

    /**
     * Demo simulation:
     *   • 75 % chance → accepted (with a vendor fare 95–105 % of proposed)
     *   • 25 % chance → rejected
     * Fires 8–15 s after submission.  If that window has already passed
     * (e.g. page was refreshed), the TTL expiry timer fires instead.
     */
    private scheduleDemoUpdate(req: BookMyPriceRequest): void {
        if (req.status !== 'pending') return;

        const elapsed        = Date.now() - new Date(req.submittedAt).getTime();
        const remainingTtl   = Math.max(0, TTL_MS - elapsed);
        const rawDemoDelay   = 8000 + Math.random() * 7000;   // 8–15 s from submission
        const demoDelay      = Math.max(0, rawDemoDelay - elapsed);

        if (demoDelay < remainingTtl) {
            // Demo accept/reject fires before expiry
            const t = setTimeout(() => {
                const accepted = Math.random() < 0.75;
                this.resolveRequest(
                    req.id,
                    accepted ? 'accepted' : 'rejected',
                    accepted
                        ? Math.round(req.proposedFare * (0.95 + Math.random() * 0.1))
                        : undefined
                );
            }, demoDelay);
            this.timers.set(req.id, t);
        } else if (remainingTtl > 0) {
            // Request will expire before demo fires (page was refreshed late)
            const t = setTimeout(() => this.resolveRequest(req.id, 'expired'), remainingTtl);
            this.timers.set(req.id, t);
        }
        // remainingTtl === 0 → already expired; leave status as-is (will show "Expired" in UI)
    }

    private resolveRequest(id: string, status: BmpStatus, vendorFare?: number): void {
        const list = this._requests$.getValue().map(r =>
            r.id !== id ? r : {
                ...r,
                status,
                ...(vendorFare !== undefined ? { vendorResponseFare: vendorFare } : {}),
            }
        );
        this.save(list);
        this.timers.delete(id);
    }
}
