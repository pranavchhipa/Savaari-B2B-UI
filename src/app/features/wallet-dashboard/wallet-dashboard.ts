import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { WalletService, WalletTransaction } from '../../core/services/wallet.service';
import { Observable } from 'rxjs';

@Component({
    selector: 'app-wallet-dashboard',
    standalone: true,
    imports: [CommonModule, FormsModule, LucideAngularModule],
    templateUrl: './wallet-dashboard.html'
})
export class WalletDashboardComponent implements OnInit {
    balance$!: Observable<number>;
    transactions$!: Observable<WalletTransaction[]>;

    showTopUpModal = false;
    topUpAmount = 10000;
    isProcessing = false;

    constructor(private walletService: WalletService) { }

    ngOnInit(): void {
        this.balance$ = this.walletService.balance$;
        this.transactions$ = this.walletService.transactions$;
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
}
