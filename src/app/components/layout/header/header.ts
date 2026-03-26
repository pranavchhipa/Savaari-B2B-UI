import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener, ElementRef } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, NavigationEnd, Event } from '@angular/router';
import { LucideAngularModule, Wallet } from 'lucide-angular';
import { CommonModule } from '@angular/common';
import { filter, Subscription, Observable } from 'rxjs';
import { WalletService } from '../../../core/services/wallet.service';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule, CommonModule],
  templateUrl: './header.html',
  styleUrl: './header.component.css',
})
export class HeaderComponent implements OnInit, OnDestroy {
  isPublicRoute = false;
  isLandingPage = false;
  isUserDropdownOpen = false;
  isScrolled = false;
  showLogoutConfirm = false;
  supportPhone = environment.supportPhone;
  supportPhoneTel = environment.supportPhoneTel;
  brandName = environment.brandName;
  private routeSub!: Subscription;
  balance$!: Observable<number>;

  get userName(): string {
    const u = this.authService.getUserProfile() as any;
    return u?.firstname || u?.companyname || 'Agent';
  }
  get userFullName(): string {
    const u = this.authService.getUserProfile() as any;
    const full = [u?.firstname, u?.lastname].filter(Boolean).join(' ');
    return full || u?.companyname || 'Agent';
  }
  get userEmail(): string {
    return this.authService.getUserEmail() || '';
  }
  get userInitial(): string {
    const parts = this.userFullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }
    return this.userName.charAt(0).toUpperCase();
  }
  get agentLogo(): string | null {
    return localStorage.getItem('agentLogo');
  }

  constructor(
    private router: Router,
    private cdr: ChangeDetectorRef,
    private walletService: WalletService,
    private elementRef: ElementRef,
    private authService: AuthService
  ) {
    this.balance$ = this.walletService.balance$;

    this.routeSub = this.router.events.pipe(
      filter((event: Event): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.checkRoute(event.urlAfterRedirects);
      // Reload wallet balance when navigating to authenticated routes
      // This catches the post-login case where token wasn't available during ngOnInit
      if (!this.isPublicRoute && this.authService.getB2bToken()) {
        this.walletService.loadBalance();
      }
      this.cdr.detectChanges();
    });
  }

  ngOnInit() {
    this.checkRoute(this.router.url);
    // Load wallet balance on startup if user is logged in
    if (this.authService.getB2bToken()) {
      this.walletService.loadBalance();
    }
  }

  ngOnDestroy() {
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }
  }

  private checkRoute(url: string) {
    const path = url ? url.split('?')[0].split('#')[0] : ''; // Remove query params and hashes, safely
    this.isLandingPage = path === '/' || path === '' || path.startsWith('/login') || path.startsWith('/register')
      || path.startsWith('/about-us') || path.startsWith('/privacy-policy') || path.startsWith('/terms-conditions') || path.startsWith('/contact-us');
    this.isPublicRoute = this.isLandingPage;
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

  onLogout() {
    this.isUserDropdownOpen = false;
    this.showLogoutConfirm = true;
  }

  confirmLogout() {
    this.showLogoutConfirm = false;
    this.authService.logout();
    this.router.navigate(['/'], { replaceUrl: true });
  }

  cancelLogout() {
    this.showLogoutConfirm = false;
  }
}
