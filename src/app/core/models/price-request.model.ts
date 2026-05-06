export type PriceRequestStatus = 'pending' | 'accepted' | 'expired';

export interface PriceRequestRoute {
    from: string;
    to: string;
}

export interface PriceRequest {
    id: string;                    // PR-2026-XXXX
    route: PriceRequestRoute;
    pickupDateTime: string;        // ISO
    tripType: string;              // 'One Way' | 'Round Trip' | 'Local' | 'Airport'
    carType: string;               // 'Sedan' | 'SUV' | 'Hatchback' | 'Innova' | 'Crysta'
    originalFare: number;
    proposedFare: number;
    vasServices: string[];          // e.g. ['new_car', 'luggage']
    autoConfirm: boolean;
    status: PriceRequestStatus;
    submittedAt: string;           // ISO
    vendorResponseFare?: number;   // Set when status === 'accepted'
}
