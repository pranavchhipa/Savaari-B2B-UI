import { BookingDetails } from '../models';

/**
 * Mock booking details for development.
 */
export const MOCK_BOOKING_DETAILS: BookingDetails = {
  bookingId: 'SBN-8821',
  status: 'confirmed',
  sourceCity: 'Bangalore',
  destinationCity: 'Mysore',
  tripType: 'outstation',
  subTripType: 'oneWay',
  pickupDateTime: '15-03-2026 09:30',
  pickupAddress: 'MG Road, Bangalore',
  carType: 'Innova Crysta',
  customerName: 'Test Agent',
  customerMobile: '9876543210',
  customerEmail: 'agent@test.com',
  fare: 4896,
  totalFare: 4896,
  prePayment: 1224,
};

/**
 * Mock booking list for the bookings page.
 */
export const MOCK_BOOKINGS_LIST: BookingDetails[] = [
  {
    bookingId: 'SBN-8821',
    status: 'confirmed',
    sourceCity: 'Bangalore',
    destinationCity: 'Mysore',
    pickupDateTime: '15-03-2026 09:30',
    carType: 'Innova Crysta',
    customerName: 'Raj Kumar',
    customerMobile: '9876543210',
    fare: 4896,
    totalFare: 4896,
  },
  {
    bookingId: 'SBN-7732',
    status: 'driver_assigned',
    sourceCity: 'Mumbai',
    destinationCity: 'Pune',
    pickupDateTime: '16-03-2026 06:00',
    carType: 'Ertiga',
    carModel: 'Maruti Ertiga',
    carNumber: 'MH-01-AB-1234',
    driverName: 'Suresh Driver',
    driverMobile: '9898989898',
    customerName: 'Priya Sharma',
    customerMobile: '9123456789',
    fare: 3392,
    totalFare: 3392,
  },
  {
    bookingId: 'SBN-6543',
    status: 'completed',
    sourceCity: 'Delhi',
    destinationCity: 'Agra',
    pickupDateTime: '10-03-2026 07:00',
    carType: 'Etios',
    customerName: 'Amit Patel',
    customerMobile: '9111222333',
    fare: 2616,
    totalFare: 2816,
    extraCharges: 200,
    prePayment: 654,
    postPayment: 2162,
  },
  {
    bookingId: 'SBN-5544',
    status: 'cancelled',
    sourceCity: 'Chennai',
    destinationCity: 'Pondicherry',
    pickupDateTime: '08-03-2026 10:00',
    carType: 'Wagon R',
    customerName: 'Deepa Rani',
    customerMobile: '9444555666',
    fare: 2196,
    totalFare: 2196,
  },
];
