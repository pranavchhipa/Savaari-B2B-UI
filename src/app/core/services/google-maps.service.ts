import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

declare const google: any;

/**
 * Lazily loads the Google Maps JS API (with Places + Geocoding libraries).
 * Subsequent calls resolve immediately once the script is loaded.
 */
@Injectable({ providedIn: 'root' })
export class GoogleMapsService {
    private loadPromise: Promise<void> | null = null;

    load(): Promise<void> {
        if (this.loadPromise) return this.loadPromise;

        this.loadPromise = new Promise<void>((resolve, reject) => {
            if (typeof google !== 'undefined' && google.maps?.places) {
                resolve();
                return;
            }

            const callbackName = '__gmapsLoaded__';
            (window as any)[callbackName] = () => {
                delete (window as any)[callbackName];
                resolve();
            };

            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${environment.googleMapsApiKey}&libraries=places&callback=${callbackName}&loading=async`;
            script.async = true;
            script.defer = true;
            script.onerror = () => {
                this.loadPromise = null;  // allow retry
                reject(new Error('Google Maps script failed to load'));
            };
            document.head.appendChild(script);
        });

        return this.loadPromise;
    }

    /** Reverse geocode lat/lng → formatted address string. */
    async reverseGeocode(lat: number, lng: number): Promise<string> {
        await this.load();
        return new Promise((resolve) => {
            const geocoder = new google.maps.Geocoder();
            geocoder.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
                if (status === 'OK' && results?.[0]) {
                    resolve(results[0].formatted_address);
                } else {
                    resolve(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
                }
            });
        });
    }

    /**
     * Attach a Places Autocomplete to an input element.
     * Returns the Autocomplete instance so the caller can listen to events.
     */
    attachAutocomplete(
        input: HTMLInputElement,
        options?: { types?: string[]; componentRestrictions?: { country: string } }
    ): any {
        if (typeof google === 'undefined' || !google.maps?.places) return null;

        return new google.maps.places.Autocomplete(input, {
            componentRestrictions: { country: 'in' },
            fields: ['formatted_address', 'geometry', 'name'],
            ...options,
        });
    }
}
