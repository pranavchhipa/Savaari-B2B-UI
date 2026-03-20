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
        { name: 'EaseMyTrip', src: 'assets/logos/easemytrip.svg' },
        { name: 'Goibibo', src: 'assets/logos/goibibo.png' },
        { name: 'ixigo', src: 'assets/logos/ixigo.png' },
        { name: 'Yatra', src: 'assets/logos/yatra.png' },
        { name: 'Paytm', src: 'assets/logos/paytm.png' },
        { name: 'Razorpay', src: 'assets/logos/razorpay.svg' },
    ];

    // duplicate for continuous marquee
    allLogos = [...this.logos, ...this.logos];
}
