import { Component, OnInit, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { WalletService, WalletTransaction } from '../../core/services/wallet.service';
import { Observable } from 'rxjs';
import { FooterComponent } from '../../components/layout/footer/footer';
@Component({
    selector: 'app-wallet-dashboard',
    standalone: true,
    imports: [CommonModule, FormsModule, LucideAngularModule, FooterComponent],

    templateUrl: './wallet-dashboard.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WalletDashboardComponent implements OnInit {
    private walletService = inject(WalletService);
    private location = inject(Location);
    private cdr = inject(ChangeDetectorRef);

    balance$: Observable<number> = this.walletService.balance$;
    transactions$: Observable<WalletTransaction[]> = this.walletService.transactions$;

    showTopUpModal = false;
    topUpAmount = 10000;
    isProcessing = true; // This is for initial loading state

    constructor() { }

    ngOnInit(): void {
        // Mock loading delay to show skeleton
        setTimeout(() => {
            this.isProcessing = false;
            this.cdr.markForCheck();
        }, 1000);
    }

    openTopUpModal(): void {
        this.showTopUpModal = true;
        this.topUpAmount = 10000;
    }

    closeTopUpModal(): void {
        if (this.isProcessing) return;
        this.showTopUpModal = false;
    }

    processTopUp(): void {
        if (this.topUpAmount < 1000) return;

        this.isProcessing = true;

        // Simulate Razorpay Gateway Delay
        setTimeout(() => {
            const refId = 'RZP_' + Math.random().toString(36).substr(2, 9).toUpperCase();
            this.walletService.addTopUp(this.topUpAmount, refId);
            this.isProcessing = false;
            this.showTopUpModal = false;
        }, 1500);
    }

    goBack() {
        this.location.back();
    }
}
