import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

@Component({
    selector: 'app-landing-footer',
    standalone: true,
    imports: [LucideAngularModule, RouterLink],
    templateUrl: './landing-footer.html'
})
export class LandingFooterComponent { }

