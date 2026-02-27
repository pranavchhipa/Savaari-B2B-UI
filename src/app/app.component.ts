import { Component, signal } from '@angular/core';
import { Router, RouterOutlet, NavigationEnd, Event } from '@angular/router';
import { filter } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from './components/layout/header/header';

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, CommonModule, HeaderComponent],
    templateUrl: './app.component.html',
    styleUrl: './app.component.css'
})
export class AppComponent {
    protected readonly title = signal('savaari-b2b-scratch');
    isPublicRoute = false;

    constructor(private router: Router) {
        this.checkRoute(this.router.url);
        this.router.events.pipe(
            filter((event: Event): event is NavigationEnd => event instanceof NavigationEnd)
        ).subscribe((event: NavigationEnd) => {
            this.checkRoute(event.urlAfterRedirects);
        });
    }

    private checkRoute(url: string) {
        this.isPublicRoute = url === '/' || url.startsWith('/login') || url.startsWith('/register');
    }
}
