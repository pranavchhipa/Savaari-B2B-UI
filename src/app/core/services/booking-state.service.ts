import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AvailabilityResponse } from '../models';

export interface ItineraryStop {
    cityId: number;
    cityName: string;         // Full name e.g. "Mysore, Karnataka"
    cityOnly?: string;        // Short name e.g. "Mysore"
}

export interface Itinerary {
    fromCity: string;
    fromCityId?: number;      // Savaari integer city ID for API calls
    toCity: string;
    toCityId?: number;        // Savaari integer city ID for API calls
    toCitySourceId?: number;  // Source city ID for localities API (undefined if destination-only city)
    pickupDate: Date;
    pickupTime: string;
    tripType: string;         // UI label: 'One Way', 'Round Trip', 'Local', 'Airport'
    subTripType?: string;     // API value: 'oneWay', 'roundTrip', '880', etc.
    returnDate?: Date;        // Round Trip only
    duration?: number;        // Calculated number of days for round trip
    extraDestinations?: ItineraryStop[];  // Round Trip multicity intermediate stops
    localPackage?: string;    // Local only: '8hr/80km' | '12hr/120km'
    airportSubType?: string;  // Airport only: 'drop' | 'pickup'
    pickupAddress?: string;   // Airport / booking address
    dropAirport?: string;     // Airport only
    localityId?: number;      // Savaari locality ID for airport transfers
    airportId?: number;       // Airport locality ID (same as localityId, sent as airport_id)
    airportName?: string;     // Full airport/terminal name e.g. "Terminal 1, Kempegowda International Airport, Bangalore"
    airportCityId?: number;   // City ID of the selected airport city
    selectPlaceId?: string;   // Google Place ID for the pickup/drop address
    custShortAddress?: string; // Short address label for the customer location
    customerLatLong?: string;  // "lat,lng" from place_id API (airport)
    terminalId?: string;      // Terminal ID (if applicable)
    airportConvertedToOneWay?: boolean;  // True when airport trip was auto-converted to One Way
    aliasDestCityId?: number;  // Airport city ID (sent as alias_dest_city_id in booking create)
}

export interface SelectedCar {
    id: string;
    carTypeId?: number;       // Savaari car type integer ID for booking-create API
    name: string;
    image: string;
    price: number;
    originalPrice?: number;   // Discounted fare from availability API (without markup)
    regularPrice?: number;    // Regular (non-discounted) fare — used as prePayment basis to satisfy API 25% minimum
    kmsIncluded: string;
    seats: string;
    bags: string;
    ac: string;
    type: string;             // e.g. 'SEDAN', 'SUV'
    extraKmRate?: number;     // Rate per extra km from availability API
    nightAllowance?: number;  // Driver night allowance from availability API
    packageId?: string;       // Package ID from availability (for advance_payment_check)
}

@Injectable({
    providedIn: 'root'
})
export class BookingStateService {
    private readonly STORAGE_KEYS = {
        ITINERARY: 'savaari_itinerary',
        CAR: 'savaari_selected_car',
        AVAILABILITY: 'savaari_availability'
    };

    private readonly DEFAULTS = {
        ITINERARY: {
            fromCity: 'Bangalore',
            fromCityId: 377,
            toCity: 'Mysore',
            toCityId: 237,
            pickupDate: new Date(),
            pickupTime: '09:30 PM',
            tripType: 'One Way',
            subTripType: 'oneWay',
        } as Itinerary,
        CAR: {
            id: 'wagonr',
            name: 'Wagon R or Equivalent',
            image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAKBTFNKprUPtjZWgRrKHWjKoz4HDXQ7PYzX30ay-EkYiGF6juj5nMkg65eKCBkcXeQUzKXd6N3S7d0oJxD1yBOlC5drsBC59oM2qY-GYx9G_qJQx7cdFEIikpe9R-RIw5PGiaSIUT7WfZ-GSBtgSt4D14Xvf65z7ELllXS-PyEnLJQ0EZaHNA-Ky6fcokHpewwFasZ6nbgcPt8r4cYX_0iJ6YV82OAKr0Wu5Imu88_RvHSUjuY2dfNHE2PyjWoQzV4LFjOCAnhboyj',
            price: 2196,
            kmsIncluded: '145 km',
            seats: '4 Seater',
            bags: '1 Bag',
            ac: 'AC',
            type: 'SEDAN'
        } as SelectedCar
    };

    private currentItinerarySubject = new BehaviorSubject<Itinerary | null>(this.loadFromStorage(this.STORAGE_KEYS.ITINERARY, true));
    private selectedCarSubject = new BehaviorSubject<SelectedCar | null>(this.loadFromStorage(this.STORAGE_KEYS.CAR, false));
    private availabilityResponseSubject: BehaviorSubject<AvailabilityResponse | null>;

    public readonly currentItinerary$ = this.currentItinerarySubject.asObservable();
    public readonly selectedCar$ = this.selectedCarSubject.asObservable();
    public readonly availabilityResponse$;

    constructor() {
        // Restore availability response from sessionStorage (survives page refresh within same tab)
        let savedAvailability: AvailabilityResponse | null = null;
        if (typeof window !== 'undefined' && window.sessionStorage) {
            try {
                const data = sessionStorage.getItem(this.STORAGE_KEYS.AVAILABILITY);
                savedAvailability = data ? JSON.parse(data) : null;
            } catch { /* ignore */ }
        }
        this.availabilityResponseSubject = new BehaviorSubject<AvailabilityResponse | null>(savedAvailability);
        this.availabilityResponse$ = this.availabilityResponseSubject.asObservable();
    }

    private loadFromStorage(key: string, isItinerary: boolean): any {
        if (typeof window === 'undefined' || !window.localStorage) return null;

        try {
            const data = localStorage.getItem(key);
            if (!data) return isItinerary ? this.DEFAULTS.ITINERARY : this.DEFAULTS.CAR;

            const parsed = JSON.parse(data);
            if (isItinerary && parsed?.pickupDate) {
                const date = new Date(parsed.pickupDate);
                if (isNaN(date.getTime())) {
                    if (typeof parsed.pickupDate === 'string' && parsed.pickupDate.includes('-')) {
                        const parts = parsed.pickupDate.split('-');
                        if (parts.length === 3) {
                            parsed.pickupDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
                        }
                    } else {
                        parsed.pickupDate = this.DEFAULTS.ITINERARY.pickupDate;
                    }
                } else {
                    parsed.pickupDate = date;
                }
            }
            if (isItinerary && parsed?.returnDate) {
                const rDate = new Date(parsed.returnDate);
                parsed.returnDate = isNaN(rDate.getTime()) ? undefined : rDate;
            }
            return parsed;
        } catch (e) {
            console.warn(`[BookingState] Failed to load ${key} from storage, using defaults.`, e);
            return isItinerary ? this.DEFAULTS.ITINERARY : this.DEFAULTS.CAR;
        }
    }

    private saveToSession(key: string, value: any): void {
        if (typeof window !== 'undefined' && window.sessionStorage) {
            try {
                sessionStorage.setItem(key, JSON.stringify(value));
            } catch (e) {
                console.error(`[BookingState] Failed to save ${key} to session.`, e);
            }
        }
    }

    private saveToStorage(key: string, value: any): void {
        if (typeof window !== 'undefined' && window.localStorage) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (e) {
                console.error(`[BookingState] Failed to save ${key} to storage.`, e);
            }
        }
    }

    setItinerary(itinerary: Itinerary) {
        if (!itinerary) return;
        this.saveToStorage(this.STORAGE_KEYS.ITINERARY, itinerary);
        this.currentItinerarySubject.next({ ...itinerary });
    }

    getItinerary(): Itinerary | null {
        return this.currentItinerarySubject.value;
    }

    setSelectedCar(car: SelectedCar) {
        if (!car) return;
        this.saveToStorage(this.STORAGE_KEYS.CAR, car);
        this.selectedCarSubject.next({ ...car });
    }

    getSelectedCar(): SelectedCar | null {
        return this.selectedCarSubject.value;
    }

    setAvailabilityResponse(response: AvailabilityResponse) {
        this.saveToSession(this.STORAGE_KEYS.AVAILABILITY, response);
        this.availabilityResponseSubject.next(response);
    }

    getAvailabilityResponse(): AvailabilityResponse | null {
        return this.availabilityResponseSubject.value;
    }

    /**
     * Resets the booking state to defaults (useful for new search flows)
     */
    resetState(): void {
        this.setItinerary(this.DEFAULTS.ITINERARY);
        this.setSelectedCar(this.DEFAULTS.CAR);
        this.availabilityResponseSubject.next(null);
        if (typeof window !== 'undefined' && window.sessionStorage) {
            sessionStorage.removeItem(this.STORAGE_KEYS.AVAILABILITY);
        }
    }
}
