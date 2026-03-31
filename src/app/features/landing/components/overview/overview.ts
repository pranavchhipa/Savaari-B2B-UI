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
        { value: "20+", label: "Years of Experience", icon: "calendar-check" },
        { value: "2,000+", label: "Cities Covered", icon: "map-pin" },
        { value: "15L+", label: "Routes Served", icon: "route" },
        { value: "55+", label: "NPS Every Month", icon: "star" },
    ];
}
