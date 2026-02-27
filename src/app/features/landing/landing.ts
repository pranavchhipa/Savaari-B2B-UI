import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FooterComponent } from '../../components/layout/footer/footer';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, FooterComponent, LucideAngularModule],
  templateUrl: './landing.html',
  styleUrl: './landing.component.css',
})
export class LandingComponent {}

