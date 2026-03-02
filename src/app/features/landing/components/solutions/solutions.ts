import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

@Component({
    selector: 'app-solutions',
    standalone: true,
    imports: [CommonModule, LucideAngularModule],
    templateUrl: './solutions.html'
})
export class SolutionsComponent {
    solutions = [
        { icon: 'building-2', title: "Corporate Travel", description: "End-to-end ground mobility for employee commutes, airport transfers, client meetings, and inter-city travel. Full cost control and compliance.", features: ["Employee ride management", "Airport transfers", "Policy enforcement"] },
        { icon: 'plane', title: "Travel Agents", description: "White-label ground transport solutions for travel agencies. Offer your clients seamless cab bookings with premium fleet and competitive margins.", features: ["White-label integration", "Competitive pricing", "Bulk booking tools"] },
        { icon: 'calendar', title: "Event Logistics (MICE)", description: "Large-scale transportation for conferences, offsites, and corporate events. Coordinate hundreds of rides with a single dashboard and dedicated coordinator.", features: ["Fleet coordination", "Real-time tracking", "Dedicated event manager"] },
    ];
}
