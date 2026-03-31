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
            title: 'Register Your Agent Account',
            description: 'Sign up in under 2 minutes with your name, city, and contact details. No paperwork required.'
        },
        {
            number: 2,
            title: 'Choose Trip & Route',
            description: 'Pick from 4 trip types and explore 15L+ routes across India.'
        },
        {
            number: 3,
            title: 'Confirm Your Booking',
            description: 'Complete your booking with 3 simple and flexible payment options.'
        }
    ];
}
