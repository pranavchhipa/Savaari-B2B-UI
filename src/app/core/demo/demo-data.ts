/**
 * DEMO MODE — all mock data used across services when environment.demoMode === true.
 * No real API calls are made in demo mode.
 */

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const DEMO_B2B_TOKEN = 'demo-b2b-token-2026';
export const DEMO_PARTNER_TOKEN = 'demo-partner-token-2026';

export const DEMO_USER = {
  user_id: 9001,
  email: 'demo@b2bcab.in',
  name: 'Demo Agent',
  mobile: '9999999999',
  company_name: 'Demo Travels Pvt Ltd',
  city: 'Bangalore',
  state: 'Karnataka',
  is_agent: '1',
  agent_id: '9001',
  profile_image: '',
  gst_number: '29AADCB2230M1ZP',
  pan_number: 'AADCB2230M',
};

export const DEMO_USER_GST = {
  user_id: '9001',
  gst_number: '29AADCB2230M1ZP',
  pan_number: 'AADCB2230M',
  company_logo: '',
  is_agent: '1',
};

export const DEMO_LOGIN_RESPONSE = {
  statusCode: 200,
  message: 'Login successful',
  token: DEMO_B2B_TOKEN,
  user: DEMO_USER,
  userGst: DEMO_USER_GST,
};

export const DEMO_PARTNER_TOKEN_RESPONSE = {
  data: { token: DEMO_PARTNER_TOKEN },
};

// ─── Commission ───────────────────────────────────────────────────────────────

export const DEMO_COMMISSION = {
  statusCode: 200,
  commission: {
    airport_commision: 5,
    local_commision: 5,
    outstation_commision: 5,
    display_commission_flag: 1,
    wallet_user: 1,
    invoice_payer: 'pay_by_agent',
    enable_oneway: 1,
    enable_roundtrip: 1,
    enable_local: 1,
    enable_transfer: 1,
    airport_rate_bump_up: 0,
    local_rate_bump_up: 0,
    outstation_rate_bump_up: 0,
  },
};

// ─── Cities ───────────────────────────────────────────────────────────────────

export const DEMO_SOURCE_CITIES_RAW = [
  { cityId: 377, cityName: 'Bangalore, Karnataka', ll: '12.9716,77.5946', aid: '859', seoCityName: 'bangalore' },
  { cityId: 1,   cityName: 'Mumbai, Maharashtra',  ll: '19.0760,72.8777', aid: '1',   seoCityName: 'mumbai'    },
  { cityId: 2,   cityName: 'Delhi, Delhi',          ll: '28.6139,77.2090', aid: '2',   seoCityName: 'delhi'     },
  { cityId: 3,   cityName: 'Hyderabad, Telangana',  ll: '17.3850,78.4867', aid: '3',   seoCityName: 'hyderabad' },
  { cityId: 4,   cityName: 'Chennai, Tamil Nadu',   ll: '13.0827,80.2707', aid: '4',   seoCityName: 'chennai'   },
  { cityId: 5,   cityName: 'Pune, Maharashtra',     ll: '18.5204,73.8567', aid: '5',   seoCityName: 'pune'      },
  { cityId: 6,   cityName: 'Ahmedabad, Gujarat',    ll: '23.0225,72.5714', aid: '6',   seoCityName: 'ahmedabad' },
  { cityId: 7,   cityName: 'Kolkata, West Bengal',  ll: '22.5726,88.3639', aid: '7',   seoCityName: 'kolkata'   },
  { cityId: 8,   cityName: 'Jaipur, Rajasthan',     ll: '26.9124,75.7873', aid: '8',   seoCityName: 'jaipur'    },
  { cityId: 9,   cityName: 'Mysore, Karnataka',     ll: '12.2958,76.6394', aid: '9',   seoCityName: 'mysore'    },
  { cityId: 10,  cityName: 'Agra, Uttar Pradesh',   ll: '27.1767,78.0081', aid: '10',  seoCityName: 'agra'      },
  { cityId: 11,  cityName: 'Goa, Goa',              ll: '15.2993,74.1240', aid: '11',  seoCityName: 'goa'       },
  { cityId: 12,  cityName: 'Coimbatore, Tamil Nadu',ll: '11.0168,76.9558', aid: '12',  seoCityName: 'coimbatore'},
  { cityId: 13,  cityName: 'Surat, Gujarat',        ll: '21.1702,72.8311', aid: '13',  seoCityName: 'surat'     },
];

export const DEMO_SOURCE_CITIES_API = { status: 'success', data: DEMO_SOURCE_CITIES_RAW };

export const DEMO_AIRPORT_LIST_RAW = [
  { cityId: 377, cityName: 'Kempegowda International Airport, Bangalore', ll: '13.1986,77.7066', aid: '101', airportAddress: 'KIAL, Devanahalli', airportId: 101, seoCityName: 'bangalore-airport' },
  { cityId: 1,   cityName: 'Chhatrapati Shivaji Maharaj International Airport, Mumbai', ll: '19.0896,72.8656', aid: '102', airportAddress: 'CSIA, Sahar', airportId: 102, seoCityName: 'mumbai-airport' },
  { cityId: 2,   cityName: 'Indira Gandhi International Airport, Delhi', ll: '28.5562,77.1000', aid: '103', airportAddress: 'IGI Airport, New Delhi', airportId: 103, seoCityName: 'delhi-airport' },
  { cityId: 3,   cityName: 'Rajiv Gandhi International Airport, Hyderabad', ll: '17.2403,78.4294', aid: '104', airportAddress: 'RGIA, Shamshabad', airportId: 104, seoCityName: 'hyderabad-airport' },
  { cityId: 4,   cityName: 'Chennai International Airport', ll: '12.9941,80.1709', aid: '105', airportAddress: 'Meenambakkam, Chennai', airportId: 105, seoCityName: 'chennai-airport' },
];

export const DEMO_AIRPORT_LIST_API = { status: 'success', data: DEMO_AIRPORT_LIST_RAW };

// ─── Trip Types ───────────────────────────────────────────────────────────────

export const DEMO_TRIP_TYPES = [
  { id: 1, name: 'One Way',    value: 'outstation' },
  { id: 2, name: 'Round Trip', value: 'outstation' },
  { id: 3, name: 'Local',      value: 'local'      },
  { id: 4, name: 'Airport',    value: 'airport'    },
];

export const DEMO_SUB_TRIP_TYPES: Record<string, any[]> = {
  outstation: [
    { id: 1, name: 'One Way',    value: 'oneWay',    tripType: 'outstation' },
    { id: 2, name: 'Round Trip', value: 'roundTrip', tripType: 'outstation' },
  ],
  local: [
    { id: 3, name: '8 Hr / 80 Km',   value: '880',   tripType: 'local' },
    { id: 4, name: '12 Hr / 120 Km', value: '12120', tripType: 'local' },
    { id: 5, name: '4 Hr / 40 Km',   value: '440',   tripType: 'local' },
  ],
  airport: [
    { id: 6, name: 'Airport Drop',   value: 'airportDrop',   tripType: 'airport' },
    { id: 7, name: 'Airport Pickup', value: 'airportPickup', tripType: 'airport' },
  ],
};

// ─── Availability (Cars) ──────────────────────────────────────────────────────

export const DEMO_AVAILABLE_CARS = {
  status: 'success',
  data: {
    R1: {
      availableCars: [
        {
          carId: 1, carType: 'HATCHBACK', carName: 'Hatchback',
          carImage: '/assets/cars/hatchback.png', carImageLarge: '/assets/cars/hatchback.png',
          seatCapacity: 4, lugguageCapacity: 2,
          soldoutFlag: false, urgent_booking_flag: '0', package: 'PKG001',
          rates: {
            discounted: { totalAmount: 3200, packageKilometer: 300, packageHour: 8, extraKilometer: 11, nightCharge: 250 },
            regular:    { totalAmount: 3500 },
          },
          inclusions: [{ text: 'Toll & Parking extra' }, { text: 'GST included' }],
          exclusions: [{ text: 'Driver allowance extra' }],
          tnc_data: [],
        },
        {
          carId: 2, carType: 'SEDAN', carName: 'Sedan',
          carImage: '/assets/cars/sedan.png', carImageLarge: '/assets/cars/sedan.png',
          seatCapacity: 4, lugguageCapacity: 3,
          soldoutFlag: false, urgent_booking_flag: '0', package: 'PKG002',
          rates: {
            discounted: { totalAmount: 4200, packageKilometer: 300, packageHour: 8, extraKilometer: 13, nightCharge: 300 },
            regular:    { totalAmount: 4600 },
          },
          inclusions: [{ text: 'Toll & Parking extra' }, { text: 'GST included' }],
          exclusions: [{ text: 'Driver allowance extra' }],
          tnc_data: [],
        },
        {
          carId: 3, carType: 'SUV', carName: 'SUV',
          carImage: '/assets/cars/suv.png', carImageLarge: '/assets/cars/suv.png',
          seatCapacity: 6, lugguageCapacity: 4,
          soldoutFlag: false, urgent_booking_flag: '0', package: 'PKG003',
          rates: {
            discounted: { totalAmount: 5800, packageKilometer: 300, packageHour: 8, extraKilometer: 15, nightCharge: 400 },
            regular:    { totalAmount: 6400 },
          },
          inclusions: [{ text: 'Toll & Parking extra' }, { text: 'GST included' }],
          exclusions: [{ text: 'Driver allowance extra' }],
          tnc_data: [],
        },
        {
          carId: 4, carType: 'INNOVA', carName: 'Innova',
          carImage: '/assets/cars/innova.png', carImageLarge: '/assets/cars/innova.png',
          seatCapacity: 7, lugguageCapacity: 5,
          soldoutFlag: false, urgent_booking_flag: '0', package: 'PKG004',
          rates: {
            discounted: { totalAmount: 7200, packageKilometer: 300, packageHour: 8, extraKilometer: 18, nightCharge: 500 },
            regular:    { totalAmount: 7800 },
          },
          inclusions: [{ text: 'Toll & Parking extra' }, { text: 'GST included' }],
          exclusions: [{ text: 'Driver allowance extra' }],
          tnc_data: [],
        },
        {
          carId: 5, carType: 'CRYSTA', carName: 'Crysta',
          carImage: '/assets/cars/crysta.png', carImageLarge: '/assets/cars/crysta.png',
          seatCapacity: 7, lugguageCapacity: 5,
          soldoutFlag: false, urgent_booking_flag: '0', package: 'PKG005',
          rates: {
            discounted: { totalAmount: 9500, packageKilometer: 300, packageHour: 8, extraKilometer: 22, nightCharge: 600 },
            regular:    { totalAmount: 10200 },
          },
          inclusions: [{ text: 'Toll & Parking extra' }, { text: 'GST included' }],
          exclusions: [{ text: 'Driver allowance extra' }],
          tnc_data: [],
        },
      ],
    },
  },
};

// ─── Booking Create ───────────────────────────────────────────────────────────

let _demoBkCounter = 1000;
export function nextDemoBookingId(): string {
  return `DEMO${++_demoBkCounter}`;
}

export function buildDemoBookingCreateResponse(bookingId: string) {
  return {
    status: 'success',
    data: {
      booking_id: bookingId,
      reservation_id: `S0526-${bookingId}`,
      booking_key: 'demo-booking-key',
      pre_payment: 0,
      total_amount: 4200,
      payment_gateway: '16',
    },
  };
}

// ─── Booking List (for Manage Bookings) ──────────────────────────────────────

export const DEMO_BOOKINGS_LIST = {
  statusCode: 200,
  message: 'Success',
  bookingDetails: {
    bookingUpcoming: [
      {
        booking_id: 'DEMO1001', reservation_id: 'S0526-DEMO1001',
        pick_city: 'Bangalore', drop_city: 'Mysore',
        start_date_time: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
        car_name: 'Sedan', trip_type: 'One Way',
        customer_name: 'Rahul Sharma', customer_mobile: '9876543210',
        gross_amount: 4200, booking_status: 'confirmed',
        pick_loc: 'Bengaluru City Railway Station, Majestic',
        drop_loc: 'Mysore Palace, Mysore',
        pre_payment: 1050, payment_option: 2,
        driver_details: { name: '', mobile: '', car_number: '' },
        _bucket: 'upcoming',
      },
      {
        booking_id: 'DEMO1002', reservation_id: 'S0526-DEMO1002',
        pick_city: 'Mumbai', drop_city: 'Pune',
        start_date_time: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        car_name: 'SUV', trip_type: 'One Way',
        customer_name: 'Priya Mehta', customer_mobile: '9988776655',
        gross_amount: 5800, booking_status: 'confirmed',
        pick_loc: 'Mumbai Airport T2',
        drop_loc: 'Hinjewadi IT Park, Pune',
        pre_payment: 1450, payment_option: 1,
        driver_details: { name: '', mobile: '', car_number: '' },
        _bucket: 'upcoming',
      },
    ],
    bookingCompleted: [
      {
        booking_id: 'DEMO0900', reservation_id: 'S0426-DEMO0900',
        pick_city: 'Delhi', drop_city: 'Agra',
        start_date_time: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
        car_name: 'Innova', trip_type: 'Round Trip',
        customer_name: 'Amit Kapoor', customer_mobile: '9123456789',
        gross_amount: 9200, booking_status: 'completed',
        pick_loc: 'Connaught Place, New Delhi',
        drop_loc: 'Taj Mahal, Agra',
        pre_payment: 9200, payment_option: 3,
        driver_details: { name: 'Ravi Kumar', mobile: '9876512345', car_number: 'DL 01 AB 1234' },
        _bucket: 'completed',
      },
    ],
    bookingCancelled: [
      {
        booking_id: 'DEMO0850', reservation_id: 'S0426-DEMO0850',
        pick_city: 'Chennai', drop_city: 'Pondicherry',
        start_date_time: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
        car_name: 'Hatchback', trip_type: 'One Way',
        customer_name: 'Sneha Iyer', customer_mobile: '9445566778',
        gross_amount: 3200, booking_status: 'cancelled',
        pick_loc: 'Chennai Central',
        drop_loc: 'Promenade Beach, Pondicherry',
        pre_payment: 0, payment_option: 1,
        driver_details: { name: '', mobile: '', car_number: '' },
        _bucket: 'cancelled',
      },
    ],
  },
};

// ─── Wallet ───────────────────────────────────────────────────────────────────

export const DEMO_WALLET_BALANCE = 15000;

export const DEMO_WALLET_STATUS = {
  statusCode: 200,
  data: { balance: DEMO_WALLET_BALANCE, walletStatus: 'ACTIVE', walletId: 'DEMO-WALLET-9001' },
};

export const DEMO_WALLET_CREATE = { statusCode: 200, status: 'success', message: 'Wallet created successfully' };

export const DEMO_WALLET_HISTORY = {
  statusCode: 200,
  transactions: [
    { id: 'TXN001', date: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(), type: 'TOPUP',           amount: 10000, balanceAfter: 15000, description: 'Wallet Top-up via Razorpay',        status: 'SUCCESS' },
    { id: 'TXN002', date: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(), type: 'BOOKING_PAYMENT', amount: -1050, balanceAfter: 5000,  description: 'Advance for Booking #DEMO1001',   status: 'SUCCESS' },
    { id: 'TXN003', date: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString(), type: 'TOPUP',           amount: 5000,  balanceAfter: 6050,  description: 'Wallet Top-up via Razorpay',        status: 'SUCCESS' },
    { id: 'TXN004', date: new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString(), type: 'REFUND',          amount: 3200,  balanceAfter: 1050,  description: 'Refund for Booking #DEMO0850',   status: 'SUCCESS' },
  ],
};

export const DEMO_WALLET_PAY_BOOKING = {
  statusCode: 200,
  data: { transaction_id: `TXN-DEMO-${Date.now()}` },
};

export const DEMO_TOPUP_INITIATE = {
  statusCode: 200,
  data: { orderId: 'order_DEMO123', amount: 100000, currency: 'INR', razorpayKeyId: 'rzp_test_SWAcB744ApXvsB' },
};

export const DEMO_TOPUP_VERIFY = { statusCode: 200, message: 'Wallet topped up successfully' };

// ─── Payment ──────────────────────────────────────────────────────────────────

export const DEMO_ADVANCE_CHECK = {
  status: 'success',
  advance_payment_status: 1,
  advance_percent: [25],
  advance_percent_ids: [8],
  advance_amount: 1050,
  advance_percentage: 25,
  encoded_amount: 'demo-encoded',
};

export const DEMO_RAZORPAY_ORDER = {
  order_id: 'order_DEMO456',
  razorpay_order_id: 'order_DEMO456',
  amount: 105000,
  status: 'created',
};

export const DEMO_PAYMENT_CONFIRM = { status_code: 101, status: 'success' };

// ─── Address Autocomplete ─────────────────────────────────────────────────────

export const DEMO_ADDRESS_SUGGESTIONS = [
  { place_id: 'demo_place_1', address: 'Majestic Bus Stand, Bangalore', main_text: 'Majestic Bus Stand', secondary_text: 'Bangalore, Karnataka', latlng: '12.977,77.572' },
  { place_id: 'demo_place_2', address: 'Indiranagar, Bangalore', main_text: 'Indiranagar', secondary_text: 'Bangalore, Karnataka', latlng: '12.978,77.638' },
  { place_id: 'demo_place_3', address: 'Koramangala, Bangalore', main_text: 'Koramangala', secondary_text: 'Bangalore, Karnataka', latlng: '12.935,77.624' },
  { place_id: 'demo_place_4', address: 'Whitefield, Bangalore', main_text: 'Whitefield', secondary_text: 'Bangalore, Karnataka', latlng: '12.969,77.750' },
  { place_id: 'demo_place_5', address: 'Electronic City, Bangalore', main_text: 'Electronic City', secondary_text: 'Bangalore, Karnataka', latlng: '12.839,77.677' },
];

export const DEMO_PLACE_DETAILS = {
  placeId: 'demo_place_1',
  place_name: 'Majestic Bus Stand',
  formattedAddress: 'Majestic Bus Stand, Bangalore, Karnataka',
  location: { lat: 12.977, long: 77.572 },
  source_city_map_info: { city_id: 377 },
  destination_city_map_info: { city_id: 377 },
  address_components: [],
};
