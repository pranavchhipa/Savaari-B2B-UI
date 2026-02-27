import { Routes } from '@angular/router';
import { LandingComponent } from './features/landing/landing';
import { LoginComponent } from './features/auth/login/login';
import { RegisterComponent } from './features/auth/register/register';
import { DashboardComponent } from './features/dashboard/dashboard';
import { BookingsComponent } from './features/bookings/bookings';
import { MarkupSettingsComponent } from './features/markup-settings/markup-settings';
import { AccountSettingsComponent } from './features/account-settings/account-settings';
import { ReportsComponent } from './features/reports/reports';
import { SelectCarComponent } from './features/select-car/select-car';
import { BookingComponent } from './features/booking/booking';
import { bookingGuard } from './core/guards/booking.guard';
import { WalletDashboardComponent } from './features/wallet-dashboard/wallet-dashboard';

export const routes: Routes = [
    { path: '', component: LandingComponent },
    { path: 'login', component: LoginComponent },
    { path: 'register', component: RegisterComponent },
    { path: 'dashboard', component: DashboardComponent },
    { path: 'bookings', component: BookingsComponent },
    { path: 'markup-settings', component: MarkupSettingsComponent },
    { path: 'account-settings', component: AccountSettingsComponent },
    { path: 'reports', component: ReportsComponent },
    { path: 'select-car', component: SelectCarComponent },
    { path: 'booking', component: BookingComponent, canActivate: [bookingGuard] },
    { path: 'wallet', component: WalletDashboardComponent }
];
