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
        { icon: 'route', number: "15L+", text: "Routes Served", label: "15L+ Routes Served", sub: "Pan-India coverage" },
        { icon: 'shield-check', number: "99.7%", text: "Trips Executed", label: "99.7% Trips Executed", sub: "" },
        { icon: 'car', number: "100%", text: "Verified Fleet", label: "100% Verified Fleet", sub: "" },
    ];
}
