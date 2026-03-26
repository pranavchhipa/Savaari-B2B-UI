import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

@Component({
    selector: 'app-get-started',
    standalone: true,
    imports: [CommonModule, RouterLink, LucideAngularModule],
    templateUrl: './get-started.html'
})
export class GetStartedComponent {
    steps = [
        {
            number: 1,
            title: 'Create Your Agent Account',
            description: 'Sign up in under 2 minutes with your business details — name, city, and contact info. No paperwork needed.'
        },
        {
            number: 2,
            title: 'Set Your Mark-up & Preferences',
            description: 'Configure your commission mark-ups, preferred routes, and customer defaults from the dashboard.'
        },
        {
            number: 3,
            title: 'Start Booking & Earning',
            description: 'Search availability across 2,000+ cities, book cabs instantly, and earn on every trip you create.'
        }
    ];
}
