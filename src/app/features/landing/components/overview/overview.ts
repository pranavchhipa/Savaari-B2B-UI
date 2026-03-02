import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

@Component({
    selector: 'app-overview',
    standalone: true,
    imports: [CommonModule, LucideAngularModule],
    templateUrl: './overview.html'
})
export class OverviewComponent {
    stats = [
        { value: "17+", label: "Years of Experience", icon: "trending-up" },
        { value: "2,000+", label: "Cities Covered", icon: "map-pin" },
        { value: "5L+", label: "Routes Served", icon: "route" },
        { value: "500+", label: "Enterprise Clients", icon: "users" },
    ];
}
