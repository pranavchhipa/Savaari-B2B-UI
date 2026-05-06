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
    note: string;
    autoConfirm: boolean;
    status: PriceRequestStatus;
    submittedAt: string;           // ISO
    vendorResponseFare?: number;   // Set when status === 'accepted'
}
