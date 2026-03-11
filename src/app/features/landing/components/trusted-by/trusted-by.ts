import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface LogoEntry {
    name: string;
    src: string;
}

@Component({
    selector: 'app-trusted-by',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './trusted-by.html'
})
export class TrustedByComponent {
    logos: LogoEntry[] = [
        { name: 'MakeMyTrip', src: 'assets/logos/makemytrip.svg' },
        { name: 'Goibibo', src: 'assets/logos/goibibo.svg' },
        { name: 'ixigo', src: 'assets/logos/ixigo.svg' },
        { name: 'Yatra', src: 'assets/logos/yatra.svg' },
        { name: 'EaseMyTrip', src: 'assets/logos/easemytrip.svg' },
        { name: 'Cleartrip', src: 'assets/logos/cleartrip.svg' },
        { name: 'Paytm', src: 'assets/logos/paytm.svg' },
        { name: 'PhonePe', src: 'assets/logos/phonepe.svg' },
        { name: 'Razorpay', src: 'assets/logos/razorpay.svg' },
        { name: 'redBus', src: 'assets/logos/redbus.svg' },
    ];

    // duplicate for continuous marquee
    allLogos = [...this.logos, ...this.logos];
}
