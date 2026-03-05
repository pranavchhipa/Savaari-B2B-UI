/**
 * Report models.
 *
 * All four report endpoints share the same request parameters:
 * GET /report-overview.php
 * GET /report-detailed.php
 * GET /report-cancellation.php
 * GET /report-financial.php
 */

export interface ReportRequest {
  fromDate: string;       // DD-MM-YYYY (format TBD from Savaari)
  toDate: string;         // DD-MM-YYYY
  filterType: string;     // 'booking_date' | 'travel_date'
}

export interface ReportOverview {
  totalBookings?: number;
  completedBookings?: number;
  cancelledBookings?: number;
  totalRevenue?: number;
  [key: string]: unknown;
}

export interface ReportDetailedEntry {
  bookingId?: string;
  customerName?: string;
  sourceCity?: string;
  destinationCity?: string;
  tripType?: string;
  pickupDateTime?: string;
  carType?: string;
  driverName?: string;
  fare?: number;
  status?: string;
  [key: string]: unknown;
}

export interface ReportCancellationEntry {
  bookingId?: string;
  cancellationReason?: string;
  cancellationTime?: string;
  cancellationCharge?: number;
  [key: string]: unknown;
}

export interface ReportFinancialEntry {
  bookingId?: string;
  baseFare?: number;
  extras?: number;
  commission?: number;
  settlementAmount?: number;
  [key: string]: unknown;
}
