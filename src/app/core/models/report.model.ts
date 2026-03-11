/**
 * Report models — confirmed from live API.
 *
 * GET /booking-details-report → api23.savaari.com/booking-details-report
 *
 * IMPORTANT: Dates are Unix timestamps (seconds), NOT DD-MM-YYYY!
 * Status 204 = no records for the given period.
 */

export interface ReportRequest {
  fromDate: number;       // Unix timestamp in seconds (NOT DD-MM-YYYY!)
  toDate: number;         // Unix timestamp in seconds
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
