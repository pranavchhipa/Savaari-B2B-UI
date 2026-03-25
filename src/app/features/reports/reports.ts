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
   *  Handles both our model's camelCase and the real API's snake_case fields.
   */
  private mapToTripReport(entry: any): TripReport {
    // Handle date — API uses start_date_time "YYYY-MM-DD HH:MM:SS" or pickupDateTime "DD-MM-YYYY"
    let dateStr = '';
    const rawDate = entry.start_date_time || entry.pickupDateTime || '';
    if (rawDate) {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      } else {
        // Try DD-MM-YYYY format
        const match = rawDate.match(/(\d{2})-(\d{2})-(\d{4})/);
        if (match) {
          const parsed = new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
          dateStr = parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } else {
          dateStr = rawDate;
        }
      }
    }

    // Map status — API returns "CANCEL", "COMPLETED", "CONFIRMED" etc.
    const rawStatus = (entry.booking_status || entry.status || 'completed').toLowerCase();
    const status: TripReport['status'] = (rawStatus === 'cancelled' || rawStatus === 'cancel') ? 'Cancelled'
      : rawStatus === 'ongoing' ? 'Ongoing'
      : 'Completed';

    return {
      id: entry.booking_id || entry.bookingId || '',
      date: dateStr,
      passengerName: entry.customer_name || entry.customerName || '',
      pickupCity: entry.pick_city || entry.sourceCity || '',
      dropCity: entry.drop_city || entry.destinationCity || '',
      tripType: entry.trip_type || entry.tripType || '',
      status,
      fare: (() => { const f = parseFloat(entry.gross_amount); return Number.isNaN(f) ? (entry.fare ?? 0) : f; })(),
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
