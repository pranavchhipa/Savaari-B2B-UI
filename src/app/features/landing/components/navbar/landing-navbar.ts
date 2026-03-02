import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-landing-navbar',
    standalone: true,
    imports: [CommonModule, LucideAngularModule, RouterLink],
    templateUrl: './landing-navbar.html'
})
export class LandingNavbarComponent {
    mobileOpen = false;

    navLinks = [
        { label: "Solutions", href: "#solutions" },
        { label: "Why Savaari", href: "#value-props" },
        { label: "About", href: "#overview" },
        { label: "Contact", href: "#cta" },
    ];

    toggleMobile() {
        this.mobileOpen = !this.mobileOpen;
    }
}
