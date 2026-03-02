import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-trusted-by',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './trusted-by.html'
})
export class TrustedByComponent {
    logos = [
        "Infosys", "Wipro", "TCS", "HCL", "Accenture", "Deloitte",
        "KPMG", "EY", "PwC", "Cognizant", "Tech Mahindra", "L&T"
    ];
    // duplicate for continuous marquee effect
    allLogos = [...this.logos, ...this.logos];
}
