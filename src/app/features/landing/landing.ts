import { Component } from '@angular/core';
import { LandingNavbarComponent } from './components/navbar/landing-navbar';
import { LandingFooterComponent } from './components/footer/landing-footer';
import { HeroComponent } from './components/hero/hero';
import { OverviewComponent } from './components/overview/overview';
import { ValuePropsComponent } from './components/value-props/value-props';
import { SolutionsComponent } from './components/solutions/solutions';
import { FinalCTAComponent } from './components/final-cta/final-cta';
import { GetStartedComponent } from './components/get-started/get-started';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    LandingNavbarComponent,
    LandingFooterComponent,
    HeroComponent,
    GetStartedComponent,
    OverviewComponent,
    ValuePropsComponent,
    SolutionsComponent,
    FinalCTAComponent
  ],
  templateUrl: './landing.html',
  styleUrl: './landing.component.css',
})
export class LandingComponent { }
