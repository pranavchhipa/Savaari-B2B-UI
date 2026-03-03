import { Component, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { FooterComponent } from '../../components/layout/footer/footer';

export type BookingTab = 'upcoming' | 'cancelled' | 'completed';

@Component({
    selector: 'app-bookings',
    standalone: true,
    imports: [CommonModule, RouterLink, LucideAngularModule, FooterComponent],
    templateUrl: './bookings.html',
    styleUrl: './bookings.css',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class BookingsComponent {
    activeTab: BookingTab = 'upcoming';
    isLoading = false;
    private location = inject(Location);
    private cdr = inject(ChangeDetectorRef);

    setActiveTab(tab: BookingTab) {
        if (this.activeTab === tab) return;
        this.activeTab = tab;
        this.isLoading = true;
        this.cdr.markForCheck();

        setTimeout(() => {
            this.isLoading = false;
            this.cdr.markForCheck();
        }, 800);
    }

    goBack() {
        this.location.back();
    }
}
