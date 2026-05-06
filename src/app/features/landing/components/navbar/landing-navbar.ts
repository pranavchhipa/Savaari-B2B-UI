import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { RouterLink } from '@angular/router';
import { environment } from '../../../../../environments/environment';

@Component({
    selector: 'app-landing-navbar',
    standalone: true,
    imports: [CommonModule, LucideAngularModule, RouterLink],
    templateUrl: './landing-navbar.html',
    host: { class: 'block sticky top-0 z-50' }
})
export class LandingNavbarComponent {
    mobileOpen = false;
    scrolled = false;
    supportPhone = environment.supportPhone;
    supportPhoneTel = environment.supportPhoneTel;

    navLinks = [
        { label: "Solutions", href: "#solutions" },
        { label: "Why B2B CAB", href: "#value-props" },
        { label: "About", href: "#overview" },
        { label: "Contact", href: "#cta" },
    ];

    @HostListener('window:scroll')
    onScroll() {
        this.scrolled = window.scrollY > 20;
    }

    toggleMobile() {
        this.mobileOpen = !this.mobileOpen;
    }
}
