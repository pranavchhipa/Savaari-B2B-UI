import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener, ElementRef } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, NavigationEnd, Event } from '@angular/router';
import { LucideAngularModule, Wallet } from 'lucide-angular';
import { CommonModule } from '@angular/common';
import { filter, Subscription, Observable } from 'rxjs';
import { WalletService } from '../../../core/services/wallet.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule, CommonModule],
  templateUrl: './header.html',
  styleUrl: './header.component.css',
})
export class HeaderComponent implements OnInit, OnDestroy {
  isPublicRoute = false;
  isUserDropdownOpen = false;
  isScrolled = false;
  private routeSub!: Subscription;
  balance$!: Observable<number>;

  constructor(
    private router: Router,
    private cdr: ChangeDetectorRef,
    private walletService: WalletService,
    private elementRef: ElementRef
  ) {
    this.balance$ = this.walletService.balance$;

    this.routeSub = this.router.events.pipe(
      filter((event: Event): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.checkRoute(event.urlAfterRedirects);
      this.cdr.detectChanges();
    });
  }

  ngOnInit() {
    this.checkRoute(this.router.url);
  }

  ngOnDestroy() {
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }
  }

  private checkRoute(url: string) {
    const path = url ? url.split('?')[0].split('#')[0] : ''; // Remove query params and hashes, safely
    this.isPublicRoute = path === '/' || path === '' || path.startsWith('/login') || path.startsWith('/register');
  }

  toggleDarkMode() {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark');
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    // If the dropdown is open and the click is outside this component, close it
    if (this.isUserDropdownOpen && !this.elementRef.nativeElement.contains(event.target)) {
      this.isUserDropdownOpen = false;
    }
  }

  @HostListener('window:scroll', [])
  onWindowScroll() {
    this.isScrolled = window.scrollY > 10;
  }
}
