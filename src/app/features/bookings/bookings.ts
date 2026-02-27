import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { FooterComponent } from '../../components/layout/footer/footer';

export type BookingTab = 'upcoming' | 'cancelled' | 'completed';

@Component({
    selector: 'app-bookings',
    standalone: true,
    imports: [CommonModule, RouterLink, LucideAngularModule, FooterComponent],
    templateUrl: './bookings.html',
    styleUrl: './bookings.css'
})
export class BookingsComponent {
    activeTab: BookingTab = 'upcoming';

    setActiveTab(tab: BookingTab) {
        this.activeTab = tab;
    }
}
