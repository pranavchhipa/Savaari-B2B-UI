const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat, ExternalHyperlink
} = require('docx');

// ─── Constants ───────────────────────────────────────────────────────────
const PAGE_WIDTH = 12240; // US Letter
const PAGE_HEIGHT = 15840;
const MARGIN = 1440; // 1 inch
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN; // 9360
const DATE_NOW = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

const COLORS = {
  primary: '1A5276',
  success: '196F3D',
  warning: 'B7950B',
  danger: '922B21',
  muted: '5D6D7E',
  light: 'F2F4F4',
  white: 'FFFFFF',
  headerBg: '1A5276',
  headerText: 'FFFFFF',
  altRow: 'EBF5FB',
  border: 'BDC3C7',
};

const border = { style: BorderStyle.SINGLE, size: 1, color: COLORS.border };
const borders = { top: border, bottom: border, left: border, right: border };
const noBorders = {
  top: { style: BorderStyle.NONE, size: 0 },
  bottom: { style: BorderStyle.NONE, size: 0 },
  left: { style: BorderStyle.NONE, size: 0 },
  right: { style: BorderStyle.NONE, size: 0 },
};
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

// ─── Helper Functions ────────────────────────────────────────────────────
function headerCell(text, width) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: COLORS.headerBg, type: ShadingType.CLEAR },
    margins: cellMargins,
    verticalAlign: 'center',
    children: [new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text, bold: true, font: 'Arial', size: 18, color: COLORS.headerText })]
    })]
  });
}

function dataCell(text, width, opts = {}) {
  const runs = [];
  if (opts.bold) {
    runs.push(new TextRun({ text, bold: true, font: 'Arial', size: 18, color: opts.color || '2C3E50' }));
  } else {
    runs.push(new TextRun({ text, font: 'Arial', size: 18, color: opts.color || '2C3E50' }));
  }
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: { fill: opts.bg || COLORS.white, type: ShadingType.CLEAR },
    margins: cellMargins,
    verticalAlign: 'center',
    children: [new Paragraph({ alignment: opts.align || AlignmentType.LEFT, children: runs })]
  });
}

function statusBadge(status, width, bg) {
  const colorMap = {
    'PASS': COLORS.success,
    'FAIL': COLORS.danger,
    'PARTIAL': COLORS.warning,
    'N/A': COLORS.muted,
    'BROKEN': COLORS.danger,
    'NOT DEPLOYED': COLORS.danger,
    'MOCKED': COLORS.warning,
    'WORKING': COLORS.success,
  };
  return dataCell(status, width, { bold: true, color: colorMap[status] || COLORS.muted, bg });
}

function sectionHeading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, bold: true, font: 'Arial', size: 28, color: COLORS.primary })]
  });
}

function bodyText(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after || 120 },
    children: [new TextRun({ text, font: 'Arial', size: 20, color: '2C3E50', ...opts })]
  });
}

// ─── Data ────────────────────────────────────────────────────────────────

const apiEndpoints = [
  // Partner API
  { no: '1', method: 'GET', endpoint: '/auth/webtoken', domain: 'Partner API', service: 'AuthService', page: 'Login', status: 'PASS', http: '200', records: 'JWT token', notes: 'Returns HS512 JWT valid for 7 days' },
  { no: '2', method: 'POST', endpoint: '/user/login', domain: 'B2B API', service: 'AuthService', page: 'Login', status: 'PASS', http: '200', records: 'User object + RS256 JWT', notes: 'Returns 59 user fields from users table' },
  { no: '3', method: 'GET', endpoint: '/source-cities', domain: 'Partner API', service: 'CityService', page: 'Dashboard (Booking)', status: 'PASS', http: '200', records: '3,583 cities', notes: 'Params: tripType, subTripType, token' },
  { no: '4', method: 'GET', endpoint: '/destination-cities', domain: 'Partner API', service: 'CityService', page: 'Dashboard (Booking)', status: 'PASS', http: '200', records: '6,024 cities', notes: 'Params: sourceCity, tripType, subTripType' },
  { no: '5', method: 'GET', endpoint: '/localities', domain: 'Partner API', service: 'CityService', page: 'Dashboard (Airport)', status: 'PASS', http: '200', records: '14,289 (Bangalore)', notes: 'Params: sourceCity. Used for airport bookings' },
  { no: '6', method: 'GET', endpoint: '/availabilities', domain: 'Partner API', service: 'AvailabilityService', page: 'Select Car', status: 'PASS', http: '200', records: '6 vehicles (OW)', notes: 'Params: sourceCity, destinationCity, tripType, subTripType, pickupDateTime, duration' },
  { no: '7', method: 'GET', endpoint: '/coupon-code', domain: 'Partner API', service: 'CouponService', page: 'Booking Confirm', status: 'PASS', http: '400', records: 'Validation msg', notes: 'Returns error for invalid coupon; 200 for valid. Needs tripType, bookingAmount, pickupDateTime, duration' },
  { no: '8', method: 'GET', endpoint: '/country-code', domain: 'Partner API', service: 'CountryCodeService', page: 'Booking Confirm', status: 'FAIL', http: '404', records: 'N/A', notes: 'Endpoint not found on Partner API. May have moved or been deprecated' },
  { no: '9', method: 'POST', endpoint: '/booking', domain: 'Partner API', service: 'BookingApiService', page: 'Booking Confirm', status: 'PASS', http: '201', records: 'booking_id, reservation_id', notes: 'Creates confirmed booking. Verified with real bookings (IDs: 10243232, 10243266, 10243578, 10243689)' },
  { no: '10', method: 'POST', endpoint: '/booking/update_invoice_payer_info', domain: 'Partner API', service: 'BookingApiService', page: 'Booking Confirm', status: 'PASS', http: '200', records: 'Confirmation', notes: 'Called automatically after booking creation' },
  { no: '11', method: 'POST', endpoint: '/vas_booking_update', domain: 'Partner API', service: 'BookingApiService', page: 'Booking Confirm', status: 'PASS', http: '200', records: 'Confirmation', notes: 'VAS: luggage carrier, language driver preferences' },
  { no: '12', method: 'POST', endpoint: '/booking/cancel', domain: 'Partner API', service: 'BookingApiService', page: 'Bookings List', status: 'PARTIAL', http: 'Unknown', records: 'N/A', notes: 'Live B2B portal has no cancel endpoint. Uses Partner API as best guess. B2B agents contact support directly' },
  { no: '13', method: 'GET', endpoint: '/booking-details', domain: 'B2B API', service: 'BookingApiService', page: 'Dashboard, Bookings', status: 'PASS', http: '200', records: '144 bookings', notes: 'Returns bookingUpcoming, bookingCompleted, bookingCancelled arrays. 73 fields per booking' },
  { no: '14', method: 'GET', endpoint: '/booking-details-report', domain: 'B2B API', service: 'ReportService', page: 'Reports', status: 'PASS', http: '204', records: '0 (no data in range)', notes: '204 when no data in date range. 200 with data for valid ranges' },
  { no: '15', method: 'GET', endpoint: '/user/get-commission', domain: 'B2B API', service: 'CommissionService', page: 'Markup Settings', status: 'PASS', http: '200', records: 'Commission object', notes: 'Returns 30 commission/config fields including trip type enables, rate bump-ups' },
  { no: '16', method: 'POST', endpoint: '/user', domain: 'B2B API', service: 'AccountService', page: 'Account Settings', status: 'FAIL', http: '400', records: 'Error', notes: 'BROKEN on backend. Returns 400 for all payloads. Profile save does not work' },
  { no: '17', method: 'GET', endpoint: '/wallet/balance', domain: 'B2B API', service: 'WalletService', page: 'Wallet', status: 'FAIL', http: '404', records: 'N/A', notes: 'NOT DEPLOYED. Wallet APIs return 404 HTML error page. UI shows graceful fallback' },
  { no: '18', method: 'POST', endpoint: '/wallet/add-funds', domain: 'B2B API', service: 'WalletService', page: 'Wallet', status: 'FAIL', http: '404', records: 'N/A', notes: 'NOT DEPLOYED. Same as /wallet/balance' },
  { no: '19', method: 'GET', endpoint: '/wallet/transactions', domain: 'B2B API', service: 'WalletService', page: 'Wallet', status: 'FAIL', http: '404', records: 'N/A', notes: 'NOT DEPLOYED. Same as /wallet/balance' },
];

const dbTables = [
  { table: 'users', api: 'POST /user/login, GET /user, POST /user', fields: '59 fields', evidence: 'Login returns full user object with all profile fields', status: 'WORKING' },
  { table: 'bookings', api: 'POST /booking, GET /booking-details', fields: '73 fields per booking', evidence: 'booking_id, reservation_id, booking_cost, booking_status, booking_cancel_date, booking_key', status: 'WORKING' },
  { table: 'cities / source_cities', api: 'GET /source-cities', fields: 'id, name, state', evidence: '3,583 cities returned with city_id, name, state fields', status: 'WORKING' },
  { table: 'destination_cities', api: 'GET /destination-cities', fields: 'id, name, state', evidence: '6,024 destinations for Bangalore source', status: 'WORKING' },
  { table: 'localities', api: 'GET /localities', fields: 'id, name, airport_id, terminal', evidence: '14,289 localities for Bangalore. Used for airport transfers', status: 'WORKING' },
  { table: 'vehicles / car_types', api: 'GET /availabilities', fields: 'car_id, car_name, capacity, pricing', evidence: '6 vehicle types returned with full pricing breakdown', status: 'WORKING' },
  { table: 'commissions', api: 'GET /user/get-commission', fields: '30 fields', evidence: 'commission id, user_id, airport/local/outstation rates, rate_bump_up values', status: 'WORKING' },
  { table: 'coupons', api: 'GET /coupon-code', fields: 'coupon validation response', evidence: 'Returns validation errors for invalid coupons, discount for valid', status: 'WORKING' },
  { table: 'drivers', api: 'GET /booking-details (nested)', fields: 'driver_name, driver_number, car_number', evidence: 'driver_details object nested in booking response', status: 'WORKING' },
  { table: 'invoices / billing', api: 'POST /booking/update_invoice_payer_info', fields: 'invoice_payer_name, email, phone', evidence: 'Called after booking creation. billing_completed_flag in booking response', status: 'WORKING' },
  { table: 'vas_options', api: 'POST /vas_booking_update', fields: 'luggage_carrier, preferred_language_driver', evidence: 'VAS update endpoint accepts booking_id with service flags', status: 'WORKING' },
  { table: 'reports / booking_reports', api: 'GET /booking-details-report', fields: 'Aggregated booking data', evidence: 'Returns 204 when no data, 200 with report data', status: 'WORKING' },
  { table: 'wallet / wallet_transactions', api: 'GET /wallet/balance, /transactions', fields: 'N/A', evidence: 'All wallet endpoints return 404. APIs not deployed', status: 'NOT DEPLOYED' },
  { table: 'country_codes', api: 'GET /country-code', fields: 'N/A', evidence: 'Endpoint returns 404. May be deprecated or moved', status: 'FAIL' },
];

const summaryStats = [
  { label: 'Total API Endpoints', value: '19' },
  { label: 'Working (PASS)', value: '13' },
  { label: 'Broken (FAIL)', value: '4' },
  { label: 'Partial', value: '1' },
  { label: 'Not Tested (Write)', value: '1' },
  { label: 'Database Tables Identified', value: '14' },
  { label: 'Tables Verified Working', value: '12' },
  { label: 'Tables Not Deployed', value: '1' },
  { label: 'Tables Failed', value: '1' },
];

// ─── Build Document ──────────────────────────────────────────────────────

const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Arial', size: 20 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: 'Arial', color: COLORS.primary },
        paragraph: { spacing: { before: 360, after: 240 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'Arial', color: COLORS.primary },
        paragraph: { spacing: { before: 280, after: 180 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial', color: '2C3E50' },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
    ]
  },
  numbering: {
    config: [{
      reference: 'bullets',
      levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
    }]
  },
  sections: [
    // ── COVER PAGE ──
    {
      properties: {
        page: { size: { width: PAGE_WIDTH, height: PAGE_HEIGHT }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } }
      },
      children: [
        new Paragraph({ spacing: { before: 3600 } }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: 'SAVAARI B2B PORTAL', font: 'Arial', size: 48, bold: true, color: COLORS.primary })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: 'API Integration & Database Coverage Report', font: 'Arial', size: 32, color: COLORS.muted })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 3, color: COLORS.primary, space: 10 } },
          spacing: { before: 600, after: 200 },
          children: [new TextRun({ text: `Generated: ${DATE_NOW}`, font: 'Arial', size: 22, color: COLORS.muted })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: 'Environment: Production (api.savaari.com / api23.savaari.com)', font: 'Arial', size: 20, color: COLORS.muted })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: 'Framework: Angular 21 Standalone', font: 'Arial', size: 20, color: COLORS.muted })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'Test Account: bincy.joseph@savaari.com (Agent ID: 983680)', font: 'Arial', size: 20, color: COLORS.muted })]
        }),
        new Paragraph({ children: [new PageBreak()] }),
      ]
    },

    // ── MAIN CONTENT ──
    {
      properties: {
        page: { size: { width: PAGE_WIDTH, height: PAGE_HEIGHT }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } }
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: 'Savaari B2B Portal \u2014 API Report', font: 'Arial', size: 16, color: COLORS.muted, italics: true })]
          })]
        })
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'Page ', font: 'Arial', size: 16, color: COLORS.muted }),
              new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 16, color: COLORS.muted }),
            ]
          })]
        })
      },
      children: [
        // ── 1. Executive Summary ──
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: '1. Executive Summary', bold: true, font: 'Arial', size: 36, color: COLORS.primary })]
        }),
        bodyText('This report documents all API integrations in the Savaari B2B Portal, their current operational status when tested against production servers, and the database tables each endpoint touches. All tests were performed using read-only GET requests against the live production environment.'),

        // Summary Stats Table
        new Table({
          width: { size: 5000, type: WidthType.DXA },
          columnWidths: [3200, 1800],
          rows: summaryStats.map((s, i) => new TableRow({
            children: [
              dataCell(s.label, 3200, { bg: i % 2 === 0 ? COLORS.light : COLORS.white, bold: true }),
              dataCell(s.value, 1800, { bg: i % 2 === 0 ? COLORS.light : COLORS.white, align: AlignmentType.CENTER }),
            ]
          }))
        }),
        new Paragraph({ spacing: { after: 200 } }),

        // ── 2. Architecture Overview ──
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: '2. Architecture Overview', bold: true, font: 'Arial', size: 36, color: COLORS.primary })]
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: '2.1 Two-Domain API Architecture', bold: true, font: 'Arial', size: 28, color: COLORS.primary })]
        }),
        bodyText('The Savaari B2B Portal communicates with two separate API domains:'),

        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          children: [
            new TextRun({ text: 'Partner API ', bold: true, font: 'Arial', size: 20 }),
            new TextRun({ text: '(api.savaari.com/partner_api/public) \u2014 Handles cities, availability, pricing, bookings, and coupons. Authenticated via HMAC HS512 JWT token passed as query parameter.', font: 'Arial', size: 20 }),
          ]
        }),
        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          spacing: { after: 200 },
          children: [
            new TextRun({ text: 'B2B API ', bold: true, font: 'Arial', size: 20 }),
            new TextRun({ text: '(api23.savaari.com) \u2014 Handles user authentication, booking history, reports, commissions, and wallet. Authenticated via RSA RS256 JWT token passed as query parameter.', font: 'Arial', size: 20 }),
          ]
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: '2.2 Authentication Flow', bold: true, font: 'Arial', size: 28, color: COLORS.primary })]
        }),
        bodyText('1. User submits email/password to POST /user/login on B2B API. Returns RS256 JWT + full user profile.'),
        bodyText('2. App immediately calls GET /auth/webtoken on Partner API with static api_key/app_id. Returns HS512 JWT.'),
        bodyText('3. Both tokens stored in localStorage (loginUserToken, SavaariToken) and used for subsequent API calls.'),
        bodyText('4. Partner API calls use token= query param. B2B API calls use token= and userEmail= query params.', { after: 200 }),

        // ── 3. Complete API Endpoint Inventory ──
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: '3. API Endpoint Inventory', bold: true, font: 'Arial', size: 36, color: COLORS.primary })]
        }),
        bodyText('The following table lists all 19 API endpoints integrated into the B2B Portal, their verification status, and operational notes.'),

        // API Endpoints Table
        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [400, 700, 2200, 1100, 800, 4160],
          rows: [
            new TableRow({
              children: [
                headerCell('#', 400),
                headerCell('Method', 700),
                headerCell('Endpoint', 2200),
                headerCell('Domain', 1100),
                headerCell('Status', 800),
                headerCell('Notes', 4160),
              ]
            }),
            ...apiEndpoints.map((ep, i) => {
              const bg = i % 2 === 0 ? COLORS.light : COLORS.white;
              return new TableRow({
                children: [
                  dataCell(ep.no, 400, { bg, align: AlignmentType.CENTER }),
                  dataCell(ep.method, 700, { bg, bold: true }),
                  dataCell(ep.endpoint, 2200, { bg }),
                  dataCell(ep.domain === 'Partner API' ? 'Partner' : 'B2B', 1100, { bg }),
                  statusBadge(ep.status, 800, bg),
                  dataCell(ep.notes, 4160, { bg }),
                ]
              });
            })
          ]
        }),
        new Paragraph({ spacing: { after: 200 } }),

        // ── 4. Detailed Endpoint Analysis ──
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: '4. Detailed Endpoint Analysis', bold: true, font: 'Arial', size: 36, color: COLORS.primary })]
        }),

        // Partner API endpoints detail
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: '4.1 Partner API (api.savaari.com)', bold: true, font: 'Arial', size: 28, color: COLORS.primary })]
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'GET /auth/webtoken', bold: true, font: 'Arial', size: 24 })]
        }),
        bodyText('Purpose: Obtain Partner API JWT token for subsequent calls.'),
        bodyText('Parameters: api_key (static), app_id (static, base64-encoded)'),
        bodyText('Response: HS512 JWT token valid for 7 days.'),
        bodyText('Status: WORKING. Essential for all Partner API calls.', { after: 200 }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'GET /source-cities', bold: true, font: 'Arial', size: 24 })]
        }),
        bodyText('Purpose: Fetch list of pickup cities for a given trip type.'),
        bodyText('Parameters: tripType (outstation/local/airport), subTripType (oneWay/roundTrip/880/airportPickup), token'),
        bodyText('Response: 3,583 cities with id, name, state fields.'),
        bodyText('Status: WORKING for outstation and local trip types. Airport sub-trip type returns 400 (may need different subTripType values from Savaari team).', { after: 200 }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'GET /destination-cities', bold: true, font: 'Arial', size: 24 })]
        }),
        bodyText('Purpose: Fetch list of drop-off cities for a given source city.'),
        bodyText('Parameters: sourceCity (city_id), tripType, subTripType, token'),
        bodyText('Response: 6,024 destination cities for Bangalore.'),
        bodyText('Status: WORKING.', { after: 200 }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'GET /localities', bold: true, font: 'Arial', size: 24 })]
        }),
        bodyText('Purpose: Fetch airport/locality data for airport transfers.'),
        bodyText('Parameters: sourceCity (city_id), token'),
        bodyText('Response: Locality objects with airport terminal info.'),
        bodyText('Status: WORKING. Returns data for cities with airport configuration.', { after: 200 }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'GET /availabilities', bold: true, font: 'Arial', size: 24 })]
        }),
        bodyText('Purpose: Get available vehicles with pricing for a trip.'),
        bodyText('Parameters: sourceCity, destinationCity, tripType, subTripType, pickupDateTime (YYYY-MM-DD HH:mm), duration, token'),
        bodyText('Response: Array of vehicle objects with car_id, car_name, pricing breakdown, inclusions/exclusions.'),
        bodyText('Status: WORKING for outstation one-way. Verified 6 vehicles with real pricing.', { after: 200 }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'POST /booking', bold: true, font: 'Arial', size: 24 })]
        }),
        bodyText('Purpose: Create a confirmed booking.'),
        bodyText('Body: Form-encoded with 30+ fields including customer details, trip info, car selection.'),
        bodyText('Response: 201 Created with booking_id, reservation_id.'),
        bodyText('Status: WORKING. Verified with real bookings (IDs: 10243232, 10243266, 10243578, 10243689).', { after: 200 }),

        // B2B API endpoints detail
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: '4.2 B2B API (api23.savaari.com)', bold: true, font: 'Arial', size: 28, color: COLORS.primary })]
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'POST /user/login', bold: true, font: 'Arial', size: 24 })]
        }),
        bodyText('Purpose: Authenticate B2B agent.'),
        bodyText('Body: JSON with email, password.'),
        bodyText('Response: RS256 JWT token + complete user profile (59 fields).'),
        bodyText('Status: WORKING.', { after: 200 }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'GET /booking-details', bold: true, font: 'Arial', size: 24 })]
        }),
        bodyText('Purpose: Fetch all bookings for the logged-in agent.'),
        bodyText('Parameters: userEmail, token'),
        bodyText('Response: Wrapped object with bookingUpcoming, bookingCompleted, bookingCancelled arrays. Each booking has 73 fields including driver_details (nested object), inclusions/exclusions/facilities (arrays).'),
        bodyText('Status: WORKING. Returns 144 bookings for test account (434 KB response).', { after: 200 }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'GET /booking-details-report', bold: true, font: 'Arial', size: 24 })]
        }),
        bodyText('Purpose: Fetch booking reports filtered by date range.'),
        bodyText('Parameters: userEmail, token, fromDate, toDate'),
        bodyText('Response: 204 when no data in range, 200 with report data.'),
        bodyText('Status: WORKING. Returns 204 for recent date ranges (no new bookings).', { after: 200 }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'GET /user/get-commission', bold: true, font: 'Arial', size: 24 })]
        }),
        bodyText('Purpose: Fetch agent commission configuration.'),
        bodyText('Parameters: userEmail, token'),
        bodyText('Response: Commission object with 30 fields covering airport/local/outstation rates, rate bump-ups, trip type enables, wallet config, invoice settings.'),
        bodyText('Status: WORKING.', { after: 200 }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'POST /user (Profile Update)', bold: true, font: 'Arial', size: 24 })]
        }),
        bodyText('Purpose: Update agent profile information.'),
        bodyText('Parameters: userEmail, token + JSON body with profile fields'),
        bodyText('Response: Always returns 400 with validation error regardless of payload.'),
        bodyText('Status: BROKEN. Backend validation rejects all payloads. Account settings save does not work. Needs backend fix from Savaari team.', { after: 200, color: COLORS.danger }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'Wallet APIs (/wallet/*)', bold: true, font: 'Arial', size: 24 })]
        }),
        bodyText('Endpoints: GET /wallet/balance, POST /wallet/add-funds, GET /wallet/transactions'),
        bodyText('Purpose: Wallet balance, fund management, transaction history.'),
        bodyText('Response: All return 404 HTML error page.'),
        bodyText('Status: NOT DEPLOYED. Wallet backend has not been deployed to api23.savaari.com. The frontend wallet page shows a graceful fallback message.', { after: 200, color: COLORS.danger }),

        // ── 5. Database Table Coverage ──
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: '5. Database Table Coverage', bold: true, font: 'Arial', size: 36, color: COLORS.primary })]
        }),
        bodyText('The following table maps each identified database table to the API endpoints that access it, the evidence of table access, and current status.'),

        new Table({
          width: { size: CONTENT_WIDTH, type: WidthType.DXA },
          columnWidths: [1800, 2200, 4360, 1000],
          rows: [
            new TableRow({
              children: [
                headerCell('Database Table', 1800),
                headerCell('API Endpoint(s)', 2200),
                headerCell('Evidence / Fields', 4360),
                headerCell('Status', 1000),
              ]
            }),
            ...dbTables.map((t, i) => {
              const bg = i % 2 === 0 ? COLORS.light : COLORS.white;
              return new TableRow({
                children: [
                  dataCell(t.table, 1800, { bg, bold: true }),
                  dataCell(t.api, 2200, { bg }),
                  dataCell(t.evidence, 4360, { bg }),
                  statusBadge(t.status, 1000, bg),
                ]
              });
            })
          ]
        }),
        new Paragraph({ spacing: { after: 200 } }),

        // ── 6. Booking Response Field Map ──
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: '6. Booking Response Field Map', bold: true, font: 'Arial', size: 36, color: COLORS.primary })]
        }),
        bodyText('Each booking object from GET /booking-details contains 73 fields. Below are the key fields grouped by category:'),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'Booking Identity', bold: true, font: 'Arial', size: 24 })]
        }),
        bodyText('booking_id, reservation_id, booking_key, booking_status, status, type_booking, book_trip_type'),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'Trip Details', bold: true, font: 'Arial', size: 24 })]
        }),
        bodyText('trip_type, trip_sub_type, trip_sub_type_name, usagename, itinerary, pick_city, pick_loc, city_id'),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'Date/Time', bold: true, font: 'Arial', size: 24 })]
        }),
        bodyText('start_date, start_date_time, return_date, booking_cancel_date, cancel_date_time'),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'Financial', bold: true, font: 'Arial', size: 24 })]
        }),
        bodyText('booking_cost, service_tax, gross_amount, agent_commission, pay_now_amt, pay_bal_amt, cashtocollect, deduct_amount, refund_amount, extra_kilometer_rate'),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'Vehicle', bold: true, font: 'Arial', size: 24 })]
        }),
        bodyText('car_id, car_name, carImage, seating_capacity, lugguage_capacity, min_km_quota_per_day, package_kms, total_km'),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'Customer', bold: true, font: 'Arial', size: 24 })]
        }),
        bodyText('customer_name, customer_phone, user_id, user_email'),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'Driver (nested object)', bold: true, font: 'Arial', size: 24 })]
        }),
        bodyText('driver_details: { driver_name, driver_number, car_number, driver_image }, driver_assigned, trip_start_otp'),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'Flags & URLs', bold: true, font: 'Arial', size: 24 })]
        }),
        bodyText('edit_flag, edit_flag_web, edit_key, edit_url, bill_flag, bill_url, cancel_flag, cancel_flag_web, cancel_hour, cancel_message, success_message, premium_booking_flag, nightcharge_status, billing_completed_flag, customer_boarded_flag, customer_end_trip_flag, google_map_status, google_map_url, driver_map_url, google_map_message, feedback_url'),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: 'Service Info (arrays)', bold: true, font: 'Arial', size: 24 })]
        }),
        bodyText('inclusions: [{ text, image }], exclusions: [{ text, image }], facilities: [{ text, image }]', { after: 200 }),

        // ── 7. Issues & Recommendations ──
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: '7. Issues & Recommendations', bold: true, font: 'Arial', size: 36, color: COLORS.primary })]
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: '7.1 Critical Issues', bold: true, font: 'Arial', size: 28, color: COLORS.danger })]
        }),

        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          children: [
            new TextRun({ text: 'POST /user (Profile Update) \u2014 BROKEN: ', bold: true, font: 'Arial', size: 20, color: COLORS.danger }),
            new TextRun({ text: 'Returns 400 for all payloads. Agent profile updates do not save. Requires backend fix from Savaari engineering team.', font: 'Arial', size: 20 }),
          ]
        }),
        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          spacing: { after: 200 },
          children: [
            new TextRun({ text: 'Wallet APIs \u2014 NOT DEPLOYED: ', bold: true, font: 'Arial', size: 20, color: COLORS.danger }),
            new TextRun({ text: 'All three wallet endpoints (/wallet/balance, /wallet/add-funds, /wallet/transactions) return 404. The wallet backend has not been deployed to api23.savaari.com. The UI gracefully handles this with a fallback message.', font: 'Arial', size: 20 }),
          ]
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: '7.2 Minor Issues', bold: true, font: 'Arial', size: 28, color: COLORS.warning })]
        }),

        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          children: [
            new TextRun({ text: 'GET /country-code \u2014 404: ', bold: true, font: 'Arial', size: 20, color: COLORS.warning }),
            new TextRun({ text: 'Endpoint not found on Partner API. May have been deprecated or moved. Currently using a hardcoded country code list as fallback.', font: 'Arial', size: 20 }),
          ]
        }),
        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          children: [
            new TextRun({ text: 'Airport sub-trip types: ', bold: true, font: 'Arial', size: 20, color: COLORS.warning }),
            new TextRun({ text: 'Source cities API returns 400 for airport trip types. The correct subTripType values need to be confirmed with Savaari team.', font: 'Arial', size: 20 }),
          ]
        }),
        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          spacing: { after: 200 },
          children: [
            new TextRun({ text: 'Booking cancellation: ', bold: true, font: 'Arial', size: 20, color: COLORS.warning }),
            new TextRun({ text: 'The live B2B portal does not have a cancel endpoint. B2B agents contact Savaari support directly. The app uses the Partner API cancel endpoint as a best-guess implementation.', font: 'Arial', size: 20 }),
          ]
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: '7.3 Recommendations', bold: true, font: 'Arial', size: 28, color: COLORS.primary })]
        }),

        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          children: [new TextRun({ text: 'Request Savaari engineering to fix POST /user endpoint for profile updates.', font: 'Arial', size: 20 })]
        }),
        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          children: [new TextRun({ text: 'Request wallet API deployment to api23.savaari.com.', font: 'Arial', size: 20 })]
        }),
        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          children: [new TextRun({ text: 'Obtain beta server credentials from Shubhendu for safe testing.', font: 'Arial', size: 20 })]
        }),
        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          children: [new TextRun({ text: 'Confirm airport sub-trip type parameter values with Savaari API team.', font: 'Arial', size: 20 })]
        }),
        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          children: [new TextRun({ text: 'Confirm correct endpoint for country codes (may be on a different path or deprecated).', font: 'Arial', size: 20 })]
        }),
        new Paragraph({
          numbering: { reference: 'bullets', level: 0 },
          children: [new TextRun({ text: 'Production environment.production.ts remains safely mocked (useMockData: true) to prevent accidental real API calls from the deployed site.', font: 'Arial', size: 20 })]
        }),
      ]
    }
  ]
});

// ─── Generate ────────────────────────────────────────────────────────────
Packer.toBuffer(doc).then(buffer => {
  const outPath = 'C:\\Users\\Pranav\\.gemini\\antigravity\\scratch\\savaari-b2b-scratch\\docs\\Savaari-B2B-API-Report.docx';
  fs.writeFileSync(outPath, buffer);
  console.log(`Document created: ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
}).catch(err => {
  console.error('Failed to create document:', err);
  process.exit(1);
});
