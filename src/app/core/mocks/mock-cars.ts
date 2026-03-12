import { AvailabilityResponse } from '../models';

/**
 * Mock availability response for development.
 * Car types and pricing based on the existing hardcoded data in select-car component.
 */
export const MOCK_AVAILABILITY_RESPONSE: AvailabilityResponse = {
  status: 'success',
  cars: [
    {
      carTypeId: 49,
      carName: 'Wagon R or Equivalent',
      fare: 2196,
      kmsIncluded: 145,
      extraKmRate: 12,
      nightAllowance: 300,
      tollsIncluded: false,
      termsAndConditions: 'Fuel, Toll, State tax, Parking extra',
    },
    {
      carTypeId: 4,
      carName: 'Etios or Equivalent',
      fare: 2616,
      kmsIncluded: 145,
      extraKmRate: 14,
      nightAllowance: 300,
      tollsIncluded: false,
      termsAndConditions: 'Fuel, Toll, State tax, Parking extra',
    },
    {
      carTypeId: 7,
      carName: 'Ertiga or Equivalent',
      fare: 3392,
      kmsIncluded: 145,
      extraKmRate: 18,
      nightAllowance: 300,
      tollsIncluded: false,
      termsAndConditions: 'Fuel, Toll, State tax, Parking extra',
    },
    {
      carTypeId: 52,
      carName: 'Innova or Equivalent',
      fare: 4136,
      kmsIncluded: 145,
      extraKmRate: 20,
      nightAllowance: 300,
      tollsIncluded: false,
      termsAndConditions: 'Fuel, Toll, State tax, Parking extra',
    },
    {
      carTypeId: 53,
      carName: 'Innova Crysta or Equivalent',
      fare: 4896,
      kmsIncluded: 145,
      extraKmRate: 23,
      nightAllowance: 350,
      tollsIncluded: false,
      termsAndConditions: 'Fuel, Toll, State tax, Parking extra',
    },
  ],
};

/**
 * Image URLs for car types -- used to map API car type IDs to display images.
 * These are placeholder URLs; replace with actual asset paths.
 */
export const CAR_IMAGE_MAP: Record<number, string> = {
  4:  'assets/images/cars/sedan.png',
  5:  'assets/images/cars/sedan.png',
  7:  'assets/images/cars/suv.png',
  43: 'assets/images/cars/sedan.png',
  44: 'assets/images/cars/sedan.png',
  45: 'assets/images/cars/sedan.png',
  46: 'assets/images/cars/hatchback.png',
  49: 'assets/images/cars/hatchback.png',
  52: 'assets/images/cars/innova.png',
  53: 'assets/images/cars/crysta.png',
  54: 'assets/images/cars/innova.png',
  48: 'assets/images/cars/tempo.png',
  57: 'assets/images/cars/tempo.png',
  58: 'assets/images/cars/minibus.png',
};

/**
 * Additional display info for car types (seats, bags, AC).
 * Maps API car type IDs to the format the select-car UI expects.
 */
export const CAR_DISPLAY_INFO: Record<number, { seats: string; bags: string; ac: string; type: string }> = {
  4:  { seats: '4 Seater', bags: '2 Bags', ac: 'AC', type: 'SEDAN' },
  5:  { seats: '4 Seater', bags: '2 Bags', ac: 'AC', type: 'SEDAN' },
  7:  { seats: '6 Seater', bags: '3 Bags', ac: 'AC', type: 'SUV' },
  49: { seats: '4 Seater', bags: '1 Bag',  ac: 'AC', type: 'SEDAN' },
  52: { seats: '6 Seater', bags: '3 Bags', ac: 'AC', type: 'SUV' },
  53: { seats: '7 Seater', bags: '4 Bags', ac: 'AC', type: 'SUV' },
  48: { seats: '12 Seater', bags: '12 Bags', ac: 'AC', type: 'TEMPO' },
  54: { seats: '6 Seater', bags: '3 Bags', ac: 'AC', type: 'SUV' },
  56: { seats: '20 Seater', bags: '20 Bags', ac: 'AC', type: 'MINIBUS' },
  57: { seats: '13 Seater', bags: '13 Bags', ac: 'AC', type: 'TEMPO' },
  58: { seats: '25 Seater', bags: '25 Bags', ac: 'AC', type: 'MINIBUS' },
};
