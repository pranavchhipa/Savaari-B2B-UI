import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface WalletTransaction {
    id: string;
    date: Date;
    type: 'TOPUP' | 'BOOKING_PAYMENT' | 'REFUND';
    amount: number;
    balanceAfter: number;
    description: string;
    referenceId?: string;
    status: 'PENDING' | 'SUCCESS' | 'FAILED';
}

@Injectable({
    providedIn: 'root'
})
export class WalletService {
    private balanceSubject = new BehaviorSubject<number>(0); // Zero balance for testing insufficient balance flow
    public balance$ = this.balanceSubject.asObservable();

    private transactionsSubject = new BehaviorSubject<WalletTransaction[]>([]);
    public transactions$ = this.transactionsSubject.asObservable();

    constructor() {
        if (typeof window === 'undefined' || !window.localStorage) return;

        // Clear saved wallet state so all users start at ₹0 for testing
        localStorage.removeItem('savaari_b2b_wallet_balance');
        localStorage.removeItem('savaari_b2b_wallet_txns');
    }

    getCurrentBalance(): number {
        return this.balanceSubject.getValue();
    }

    addTopUp(amount: number, referenceId: string): void {
        const newBalance = this.balanceSubject.getValue() + amount;
        this.balanceSubject.next(newBalance);

        const newTx: WalletTransaction = {
            id: 'tx_' + Math.random().toString(36).substr(2, 9),
            date: new Date(),
            type: 'TOPUP',
            amount: amount,
            balanceAfter: newBalance,
            description: 'Wallet Top-up via Razorpay',
            referenceId: referenceId,
            status: 'SUCCESS'
        };

        const currentTxns = this.transactionsSubject.getValue();
        this.transactionsSubject.next([newTx, ...currentTxns]);

        this.saveState();
    }

    deductForBooking(amount: number, bookingId: string): boolean {
        const currentBalance = this.balanceSubject.getValue();
        if (currentBalance < amount) {
            return false; // Insufficient funds
        }

        const newBalance = currentBalance - amount;
        this.balanceSubject.next(newBalance);

        const newTx: WalletTransaction = {
            id: 'tx_' + Math.random().toString(36).substr(2, 9),
            date: new Date(),
            type: 'BOOKING_PAYMENT',
            amount: -amount,
            balanceAfter: newBalance,
            description: `Wallet Payment for Booking #${bookingId}`,
            referenceId: bookingId,
            status: 'SUCCESS'
        };

        const currentTxns = this.transactionsSubject.getValue();
        this.transactionsSubject.next([newTx, ...currentTxns]);

        this.saveState();
        return true;
    }

    private saveState() {
        localStorage.setItem('savaari_b2b_wallet_balance', this.balanceSubject.getValue().toString());
        localStorage.setItem('savaari_b2b_wallet_txns', JSON.stringify(this.transactionsSubject.getValue()));
    }
}
