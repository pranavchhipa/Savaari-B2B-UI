import { Component } from '@angular/core';
import { LandingNavbarComponent } from './components/navbar/landing-navbar';
import { LandingFooterComponent } from './components/footer/landing-footer';
import { HeroComponent } from './components/hero/hero';
import { TrustedByComponent } from './components/trusted-by/trusted-by';
import { OverviewComponent } from './components/overview/overview';
import { ValuePropsComponent } from './components/value-props/value-props';
import { SolutionsComponent } from './components/solutions/solutions';
import { FinalCTAComponent } from './components/final-cta/final-cta';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    LandingFooterComponent,
    HeroComponent,
    TrustedByComponent,
    OverviewComponent,
    ValuePropsComponent,
    SolutionsComponent,
    FinalCTAComponent
  ],
  templateUrl: './landing.html',
  styleUrl: './landing.component.css',
})
export class LandingComponent { }
