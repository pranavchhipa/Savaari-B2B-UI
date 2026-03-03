import { Routes } from '@angular/router';
import { LandingComponent } from './features/landing/landing';
import { bookingGuard } from './core/guards/booking.guard';

export const routes: Routes = [
    { path: '', component: LandingComponent },
    { path: 'login', loadComponent: () => import('./features/auth/login/login').then(m => m.LoginComponent) },
    { path: 'register', loadComponent: () => import('./features/auth/register/register').then(m => m.RegisterComponent) },
    { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard').then(m => m.DashboardComponent) },
    { path: 'bookings', loadComponent: () => import('./features/bookings/bookings').then(m => m.BookingsComponent) },
    { path: 'markup-settings', loadComponent: () => import('./features/markup-settings/markup-settings').then(m => m.MarkupSettingsComponent) },
    { path: 'account-settings', loadComponent: () => import('./features/account-settings/account-settings').then(m => m.AccountSettingsComponent) },
    { path: 'reports', loadComponent: () => import('./features/reports/reports').then(m => m.ReportsComponent) },
    { path: 'select-car', loadComponent: () => import('./features/select-car/select-car').then(m => m.SelectCarComponent) },
    { path: 'booking', loadComponent: () => import('./features/booking/booking').then(m => m.BookingComponent), canActivate: [bookingGuard] },
    { path: 'wallet', loadComponent: () => import('./features/wallet-dashboard/wallet-dashboard').then(m => m.WalletDashboardComponent) }
];
