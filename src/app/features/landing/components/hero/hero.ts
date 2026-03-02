import { Component } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-hero',
    standalone: true,
    imports: [LucideAngularModule, CommonModule, RouterLink],
    templateUrl: './hero.html'
})
export class HeroComponent {
    stats = [
        { icon: 'map-pin', label: "2,000+ Cities", sub: "Pan-India coverage" },
        { icon: 'shield', label: "Zero Cancellations", sub: "Guaranteed rides" },
        { icon: 'clock', label: "17+ Years", sub: "Industry expertise" },
    ];
}
