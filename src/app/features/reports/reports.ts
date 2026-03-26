import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { FooterComponent } from '../../components/layout/footer/footer';
import { ReportApiService } from '../../core/services/report-api.service';
import { ReportDetailedEntry } from '../../core/models';

interface TripReport {
  id: string;
  date: string;
  passengerName: string;
  pickupCity: string;
  dropCity: string;
  tripType: string;
  status: 'Completed' | 'Cancelled' | 'Ongoing';
  fare: number;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, FooterComponent],
  templateUrl: './reports.html',
  styleUrl: './reports.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReportsComponent {
  private reportApi = inject(ReportApiService);
  private cdr = inject(ChangeDetectorRef);

  // Native date input uses YYYY-MM-DD strings
  startDateStr: string = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  endDateStr: string = new Date().toISOString().slice(0, 10);
  hasViewed = false;
  isLoading = false;
  reportError = '';

  trips: TripReport[] = [];

  get totalFare(): number {
    return this.trips.filter(t => t.status === 'Completed').reduce((acc, t) => acc + t.fare, 0);
  }

  get completedCount(): number {
    return this.trips.filter(t => t.status === 'Completed').length;
  }

  get cancelledCount(): number {
    return this.trips.filter(t => t.status === 'Cancelled').length;
  }

  viewReports() {
    this.isLoading = true;
    this.reportError = '';
    this.cdr.markForCheck();

    // Parse YYYY-MM-DD strings to Date objects for the API (uses Unix timestamps)
    const fromDate = new Date(this.startDateStr);
    const toDate = new Date(this.endDateStr);
    // Set toDate to end of day
    toDate.setHours(23, 59, 59);

    this.reportApi.getReportByDates(fromDate, toDate).subscribe({
      next: (entries: ReportDetailedEntry[]) => {
        // Debug: log first entry to see actual field names from API
        if (entries?.length) console.log('[REPORTS] Sample API entry keys:', Object.keys(entries[0]), 'Values:', JSON.stringify(entries[0]).substring(0, 500));
        this.trips = (entries || []).map(e => this.mapToTripReport(e));
        this.isLoading = false;
        this.hasViewed = true;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isLoading = false;
        this.reportError = err?.message || 'Failed to fetch reports. Please try again.';
        this.cdr.markForCheck();
      }
    });
  }

  /** Map API response to the TripReport view model.
   *  API returns Title Case keys like "Booking Id", "Customer Name", "City Name" etc.
   */
  private mapToTripReport(entry: any): TripReport {
    // Handle date — API uses "Start Date" (YYYY-MM-DD) or "Booking Date" (YYYY-MM-DD HH:MM:SS)
    let dateStr = '';
    const rawDate = entry['Start Date'] || entry['Booking Date'] || entry.start_date_time || '';
    if (rawDate) {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      } else {
        dateStr = rawDate;
      }
    }

    // Extract route from "Itinerary" field (e.g. "Bangalore &rarr; Mysore &rarr; Coorg→Bangalore")
    const itinerary = (entry['Itinerary'] || '').replace(/&rarr;/g, '→').trim();
    const routeParts = itinerary.split('→').map((s: string) => s.trim()).filter(Boolean);
    const pickupCity = entry['City Name'] || (routeParts.length > 0 ? routeParts[0] : '');
    const dropCity = routeParts.length > 1 ? routeParts[routeParts.length - 1] : '';

    // Map status from "Prepaid/Postpaid" or booking status
    const rawStatus = (entry['Prepaid/Postpaid'] || entry.booking_status || '').toLowerCase();
    const status: TripReport['status'] = (rawStatus === 'cancelled' || rawStatus === 'cancel') ? 'Cancelled'
      : rawStatus === 'ongoing' ? 'Ongoing'
      : 'Completed';

    return {
      id: entry['Booking Id'] || entry.booking_id || '',
      date: dateStr,
      passengerName: entry['Customer Name'] || entry.customer_name || '',
      pickupCity,
      dropCity,
      tripType: entry['Trip Type'] || entry.trip_type || '',
      status,
      fare: (() => { const f = parseFloat(entry['Booking Amount'] || entry.gross_amount); return Number.isNaN(f) ? 0 : f; })(),
    };
  }

  downloadCSV() {
    const headers = ['Trip ID', 'Date', 'Passenger', 'Pickup City', 'Drop City', 'Trip Type', 'Status', 'Fare (₹)'];
    const rows = this.trips.map(t => [t.id, t.date, t.passengerName, t.pickupCity, t.dropCity, t.tripType, t.status, t.fare]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trip-report-${this.startDateStr}-to-${this.endDateStr}.csv`;
    a.click();
  }
}
