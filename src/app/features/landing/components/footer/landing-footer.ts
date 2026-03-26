import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../../../environments/environment';

@Component({
    selector: 'app-landing-footer',
    standalone: true,
    imports: [LucideAngularModule, RouterLink],
    templateUrl: './landing-footer.html'
})
export class LandingFooterComponent {
    supportPhone = environment.supportPhone;
    companyName = environment.companyName;
    brandName = environment.brandName;
    supportEmail = environment.supportEmail;
}

