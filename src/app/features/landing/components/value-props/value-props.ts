import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

@Component({
    selector: 'app-value-props',
    standalone: true,
    imports: [CommonModule, LucideAngularModule],
    templateUrl: './value-props.html'
})
export class ValuePropsComponent {
    props = [
        { icon: 'map-pin', title: "Pan-India Coverage", description: "Book cabs across metros, towns, and remote routes with one single platform.", highlight: "2,000+ Cities", accent: 'cyan' },
        { icon: 'layout-dashboard', title: "Smart Agent Dashboard", description: "Search, book, track, and manage all trips with full control and visibility.", highlight: "One Dashboard", accent: 'blue' },
        { icon: 'file-text', title: "Easy GST Billing", description: "Download clean invoices and manage billing effortlessly for all bookings.", highlight: "GST Ready", accent: 'emerald' },
        { icon: 'wallet', title: "Flexible Wallet System", description: "Add funds, set markups, and pay easily with a seamless wallet experience.", highlight: "Instant Payments", accent: 'amber' },
        { icon: 'headphones', title: "24/7 Dedicated Support", description: "Get quick help anytime with a team that understands your needs.", highlight: "Always Available", accent: 'violet' },
        { icon: 'shield-check', title: "High Fulfillment & On-Time Rides", description: "99% trips executed with 97% on-time performance — no last-minute issues.", highlight: "100% Reliable", accent: 'rose' },
    ];
}
