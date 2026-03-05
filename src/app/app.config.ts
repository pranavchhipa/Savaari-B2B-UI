import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import {
  LUCIDE_ICONS, LucideIconProvider,
  Luggage, Clock, Plane, LogOut, Moon, Sun,
  Headset, CircleUser, Mail, Phone, MapPin,
  Facebook, Linkedin, X, CheckCircle, Search,
  Calendar, ChevronDown, User, ShieldCheck, Zap, Wallet,
  Building2, UserPlus, ArrowRight, Lock, PlusCircle,
  Sparkles, ReceiptText, UserCheck, Train, Globe, Car,
  ListEnd, XCircle, Home, ChevronRight, PercentCircle, FileText, Settings, Settings2,
  Lightbulb, Save, FileBarChart, Shield, UploadCloud,
  Info, Route, IndianRupee, Download, CalendarSearch,
  KeyRound, Copy, TrainFront, Receipt, BadgeCheck, CalendarClock, Ticket, Star,
  ParkingCircle, Gauge, Users, Briefcase, Snowflake, Fuel, Banknote,
  ArrowDownLeft, ArrowUpRight, CreditCard, Loader2, Filter, AlertTriangle,
  ArrowLeft, Plus, Check,
  TrendingUp, Menu, LayoutDashboard, Headphones, CheckCircle2,
  Crosshair, AlertCircle
} from 'lucide-angular';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.dark'
        }
      }
    }),
    {
      provide: LUCIDE_ICONS,
      useValue: new LucideIconProvider({
        Luggage, Clock, Plane, LogOut, Moon, Sun,
        Headset, CircleUser, Mail, Phone, MapPin,
        Facebook, Linkedin, X, CheckCircle, Search,
        Calendar, ChevronDown, User, ShieldCheck, Zap, Wallet,
        Building2, UserPlus, ArrowRight, Lock, PlusCircle,
        Sparkles, ReceiptText, UserCheck, Train, Globe, Car,
        ListEnd, XCircle, Home, ChevronRight, PercentCircle, FileText, Settings, Settings2,
        Lightbulb, Save, FileBarChart, Shield, UploadCloud,
        Info, Route, IndianRupee, Download, CalendarSearch,
        KeyRound, Copy, TrainFront, Receipt, BadgeCheck, CalendarClock, Ticket, Star,
        ParkingCircle, Gauge, Users, Briefcase, Snowflake, Fuel, Banknote,
        ArrowDownLeft, ArrowUpRight, CreditCard, Loader2, Filter, AlertTriangle,
        ArrowLeft, Plus, Check,
        TrendingUp, Menu, LayoutDashboard, Headphones, CheckCircle2,
        Crosshair, AlertCircle
      })
    }
  ]
};
