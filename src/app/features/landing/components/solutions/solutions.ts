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
        { icon: 'users', title: "MICE Support", description: "Seamless cab management for events, group travel, and large bookings. Handle multiple vehicles and schedules with ease.", features: ["Bulk cab bookings", "Real-time coordination", "Dedicated support for events"] },
        { icon: 'package', title: "Cab-Only Packages", description: "Offer ready-to-sell cab packages for popular routes and trips. Ideal for agents looking to scale quickly.", features: ["Fixed route pricing", "Multi-day & intercity trips", "Easy booking & management"] },
        { icon: 'tag', title: "White-Label Solutions", description: "Run cab bookings under your own brand with a fully managed backend. Build trust while we handle operations.", features: ["Your branding, our platform", "Seamless booking experience", "Reliable backend support"] },
    ];
}
