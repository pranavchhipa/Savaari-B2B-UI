/**
 * Date formatting utilities for the Savaari API.
 *
 * The API expects dates in DD-MM-YYYY HH:MM (24-hour) format.
 * The UI works with JS Date objects and "09:30 PM" style time strings.
 */

/**
 * Converts a JS Date and a time string (e.g. "09:30 PM") to
 * the Savaari API format: "DD-MM-YYYY HH:MM"
 */
export function toSavaariDateTime(date: Date, time: string): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();

  // Parse "HH:MM AM/PM" or "HH:MM" (24h) formats
  const ampmMatch = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = ampmMatch[2];
    const period = ampmMatch[3].toUpperCase();

    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    return `${dd}-${mm}-${yyyy} ${String(hours).padStart(2, '0')}:${minutes}`;
  }

  // Already in 24h "HH:MM" format
  const h24Match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (h24Match) {
    return `${dd}-${mm}-${yyyy} ${h24Match[1].padStart(2, '0')}:${h24Match[2]}`;
  }

  // Fallback: noon
  return `${dd}-${mm}-${yyyy} 12:00`;
}

/**
 * Calculates the number of days between two dates (for round trip duration).
 * Inclusive of both pickup and return day (3rd→6th = 4 days).
 * Returns at least 1.
 */
export function calculateDuration(pickupDate: Date, returnDate: Date): number {
  const diffMs = returnDate.getTime() - pickupDate.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays + 1);
}

/**
 * Formats a Date to DD-MM-YYYY.
 * Used by availability endpoint (pickupDateTime: DD-MM-YYYY HH:MM).
 */
export function toSavaariDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Converts a Date to Unix timestamp in seconds.
 * Used by the B2B report endpoint (fromDate/toDate params).
 */
export function toUnixTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}
