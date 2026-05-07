export type BmpTripType = 'OW' | 'RT';
export type BmpStatus   = 'pending' | 'accepted' | 'rejected' | 'expired';

export interface BmpRoute {
    from:    string;
    fromLat: number | null;
    fromLng: number | null;
    to:      string;
    toLat:   number | null;
    toLng:   number | null;
}

export interface BookMyPriceRequest {
    id:          string;
    status:      BmpStatus;
    submittedAt: string;          // ISO timestamp

    route:       BmpRoute;
    tripType:    BmpTripType;

    pickupDate: string;           // YYYY-MM-DD
    pickupTime: string;           // HH:MM
    returnDate?: string;          // YYYY-MM-DD (RT only)
    returnTime?: string;          // HH:MM      (RT only)

    carType:     string;
    distanceKm:  number | null;

    originalFare: number;         // computed max fare (100%)
    proposedFare: number;         // 80–100% of originalFare

    vasServices: string[];
    autoConfirm: boolean;

    /** Set when status transitions to 'accepted' — the fare the matched driver agreed to. */
    vendorResponseFare?: number;
}
