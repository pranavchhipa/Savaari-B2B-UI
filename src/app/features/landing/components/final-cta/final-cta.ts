import { Component } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-final-cta',
    standalone: true,
    imports: [LucideAngularModule, RouterLink],
    templateUrl: './final-cta.html'
})
export class FinalCTAComponent { }
