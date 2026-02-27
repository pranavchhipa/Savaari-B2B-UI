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
    private balanceSubject = new BehaviorSubject<number>(25000); // Initial mock balance of 25k
    public balance$ = this.balanceSubject.asObservable();

    private transactionsSubject = new BehaviorSubject<WalletTransaction[]>([
        {
            id: 'tx_init_001',
            date: new Date(Date.now() - 86400000 * 2), // 2 days ago
            type: 'TOPUP',
            amount: 40000,
            balanceAfter: 40000,
            description: 'Initial Wallet Topup via IMPS',
            referenceId: 'IMPS/12398471/HDFC',
            status: 'SUCCESS'
        },
        {
            id: 'tx_bk_001',
            date: new Date(Date.now() - 86400000 * 1), // 1 day ago
            type: 'BOOKING_PAYMENT',
            amount: -15000,
            balanceAfter: 25000,
            description: 'Payment for Booking #SV-884Y',
            referenceId: 'B-8842',
            status: 'SUCCESS'
        }
    ]);
    public transactions$ = this.transactionsSubject.asObservable();

    constructor() {
        // Load from local storage if available for persistence
        const savedBalance = localStorage.getItem('savaari_b2b_wallet_balance');
        const savedTxns = localStorage.getItem('savaari_b2b_wallet_txns');

        if (savedBalance) {
            this.balanceSubject.next(parseFloat(savedBalance));
        }

        if (savedTxns) {
            try {
                const parsed = JSON.parse(savedTxns);
                // Correct date parsing
                parsed.forEach((tx: any) => tx.date = new Date(tx.date));
                this.transactionsSubject.next(parsed);
            } catch (e) {
                console.error('Failed to parse wallet transactions');
            }
        }
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
