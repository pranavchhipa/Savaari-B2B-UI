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
        { icon: 'globe', title: "Limitless Pan-India Presence", description: "Immediate access to top-tier cabs across Tier 1, 2, and 3 cities. One platform for all your ground transport needs — anywhere in India.", highlight: "2,000+ cities", accent: 'cyan' },
        { icon: 'layout-dashboard', title: "Centralized Corporate Dashboard", description: "A single platform to book, track, and manage all employee rides. Set departmental limits, control workflows, and get real-time visibility.", highlight: "One dashboard", accent: 'blue' },
        { icon: 'file-text', title: "Transparent, GST-Ready Billing", description: "100% compliant monthly billing with easy input tax credit claims. Zero hidden surges, no surprises — just clean, auditable invoices.", highlight: "100% compliant", accent: 'emerald' },
        { icon: 'car', title: "Executive-Grade Fleet & Chauffeurs", description: "Premium sedans and SUVs with background-verified, courteous drivers trained in corporate etiquette. Every ride reflects your brand.", highlight: "Premium fleet", accent: 'amber' },
        { icon: 'headphones', title: "24/7 Dedicated Account Manager", description: "Priority support and a single point of contact for instant issue resolution. Your dedicated manager ensures nothing falls through the cracks.", highlight: "24/7 support", accent: 'violet' },
        { icon: 'shield-check', title: "Zero Cancellations Guaranteed", description: "Every booking is confirmed and fulfilled. No last-minute cancellations, no driver no-shows — your clients always get their ride.", highlight: "100% reliable", accent: 'rose' },
    ];
}
