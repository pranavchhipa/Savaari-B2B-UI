import { Routes } from '@angular/router';
import { LandingComponent } from './features/landing/landing';
import { bookingGuard } from './core/guards/booking.guard';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
    { path: '', component: LandingComponent },
    { path: 'login', loadComponent: () => import('./features/auth/login/login').then(m => m.LoginComponent) },
    { path: 'register', loadComponent: () => import('./features/auth/register/register').then(m => m.RegisterComponent) },
    { path: 'dashboard', canActivate: [authGuard], loadComponent: () => import('./features/dashboard/dashboard').then(m => m.DashboardComponent) },
    { path: 'bookings', canActivate: [authGuard], loadComponent: () => import('./features/bookings/bookings').then(m => m.BookingsComponent) },
    { path: 'markup-settings', canActivate: [authGuard], loadComponent: () => import('./features/markup-settings/markup-settings').then(m => m.MarkupSettingsComponent) },
    { path: 'account-settings', canActivate: [authGuard], loadComponent: () => import('./features/account-settings/account-settings').then(m => m.AccountSettingsComponent) },
    { path: 'reports', canActivate: [authGuard], loadComponent: () => import('./features/reports/reports').then(m => m.ReportsComponent) },
    { path: 'select-car', canActivate: [authGuard], loadComponent: () => import('./features/select-car/select-car').then(m => m.SelectCarComponent) },
    { path: 'booking', canActivate: [authGuard, bookingGuard], loadComponent: () => import('./features/booking/booking').then(m => m.BookingComponent) },
    { path: 'wallet', canActivate: [authGuard], loadComponent: () => import('./features/wallet-dashboard/wallet-dashboard').then(m => m.WalletDashboardComponent) }
];
