import { City, Locality } from '../models';

/**
 * Mock city data for development.
 * City IDs are based on known Savaari values from the API documentation.
 */
export const MOCK_SOURCE_CITIES: City[] = [
  { id: 377, name: 'Bangalore', state: 'Karnataka' },
  { id: 145, name: 'New Delhi', state: 'Delhi' },
  { id: 114, name: 'Mumbai', state: 'Maharashtra' },
  { id: 81, name: 'Chennai', state: 'Tamil Nadu' },
  { id: 178, name: 'Hyderabad', state: 'Telangana' },
  { id: 263, name: 'Pune', state: 'Maharashtra' },
  { id: 191, name: 'Jaipur', state: 'Rajasthan' },
  { id: 210, name: 'Kolkata', state: 'West Bengal' },
  { id: 7, name: 'Ahmedabad', state: 'Gujarat' },
  { id: 152, name: 'Goa', state: 'Goa' },
  { id: 237, name: 'Mysore', state: 'Karnataka' },
  { id: 6, name: 'Agra', state: 'Uttar Pradesh' },
  { id: 214, name: 'Kochi', state: 'Kerala' },
  { id: 222, name: 'Lucknow', state: 'Uttar Pradesh' },
  { id: 84, name: 'Chandigarh', state: 'Chandigarh' },
  { id: 90, name: 'Coimbatore', state: 'Tamil Nadu' },
  { id: 380, name: 'Visakhapatnam', state: 'Andhra Pradesh' },
  { id: 379, name: 'Udaipur', state: 'Rajasthan' },
  { id: 300, name: 'Shimla', state: 'Himachal Pradesh' },
  { id: 231, name: 'Manali', state: 'Himachal Pradesh' },
];

export const MOCK_DESTINATION_CITIES: City[] = [
  { id: 237, name: 'Mysore', state: 'Karnataka' },
  { id: 152, name: 'Goa', state: 'Goa' },
  { id: 263, name: 'Pune', state: 'Maharashtra' },
  { id: 6, name: 'Agra', state: 'Uttar Pradesh' },
  { id: 191, name: 'Jaipur', state: 'Rajasthan' },
  { id: 145, name: 'New Delhi', state: 'Delhi' },
  { id: 114, name: 'Mumbai', state: 'Maharashtra' },
  { id: 81, name: 'Chennai', state: 'Tamil Nadu' },
  { id: 178, name: 'Hyderabad', state: 'Telangana' },
  { id: 377, name: 'Bangalore', state: 'Karnataka' },
  { id: 214, name: 'Kochi', state: 'Kerala' },
  { id: 379, name: 'Udaipur', state: 'Rajasthan' },
  { id: 300, name: 'Shimla', state: 'Himachal Pradesh' },
  { id: 231, name: 'Manali', state: 'Himachal Pradesh' },
  { id: 90, name: 'Coimbatore', state: 'Tamil Nadu' },
  { id: 210, name: 'Kolkata', state: 'West Bengal' },
];

export const MOCK_LOCALITIES: Locality[] = [
  { id: 1, name: 'Kempegowda International Airport', cityId: 377 },
  { id: 2, name: 'HAL Airport', cityId: 377 },
  { id: 3, name: 'Indira Gandhi International Airport', cityId: 145 },
  { id: 4, name: 'Chhatrapati Shivaji International Airport', cityId: 114 },
  { id: 5, name: 'Chennai International Airport', cityId: 81 },
  { id: 6, name: 'Rajiv Gandhi International Airport', cityId: 178 },
  { id: 7, name: 'Pune Airport', cityId: 263 },
  { id: 8, name: 'Cochin International Airport', cityId: 214 },
];

export const MOCK_AIRPORT_LIST: any[] = [
  {
    "airportId": 1,
    "cityId": "377",
    "cityName": "Bangalore, Karnataka",
    "airportAddress": "Terminal 1, Kempegowda International Airport, Bangalore",
    "airportLatLong": "13.210426,77.70939",
    "searchKeyword": "BLR,Bengaluru,Devanahalli,KIAL,T1"
  },
  {
    "airportId": 2,
    "cityId": "377",
    "cityName": "Bangalore, Karnataka",
    "airportAddress": "Terminal 2, Kempegowda International Airport, Bangalore",
    "airportLatLong": "13.2090896,77.7173378",
    "searchKeyword": "BLR,Bengaluru,Devanahalli,KIAL,T2"
  },
  {
    "airportId": 3,
    "cityId": "145",
    "cityName": "New Delhi, Delhi",
    "airportAddress": "Terminal 1 C - Arrival, Indira Gandhi International Airport, New Delhi",
    "airportLatLong": "28.556191,77.099979",
    "searchKeyword": "DEL,Gurugram,Gurgaon,Noida,Ghaziabad,Faridabad,T1"
  },
  {
    "airportId": 4,
    "cityId": "145",
    "cityName": "New Delhi, Delhi",
    "airportAddress": "Terminal 1 D - Departure, Indira Gandhi International Airport, New Delhi",
    "airportLatLong": "28.556191,77.099979",
    "searchKeyword": "DEL,Gurugram,Gurgaon,Noida,Ghaziabad,Faridabad,T1"
  },
  {
    "airportId": 5,
    "cityId": "145",
    "cityName": "New Delhi, Delhi",
    "airportAddress": "Terminal 2, Indira Gandhi International Airport, New Delhi",
    "airportLatLong": "28.556191,77.099979",
    "searchKeyword": "DEL,Gurugram,Gurgaon,Noida,Ghaziabad,Faridabad,T2"
  }
]
