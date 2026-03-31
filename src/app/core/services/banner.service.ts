import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

export interface BannerImage {
  imageUrl: string;
  linkUrl?: string;
  altText?: string;
  title?: string;
}

/**
 * Fetches promotional banner images from the B2B API.
 *
 * Per workflow documentation:
 *   GET /banner-images-list?sourceCity=&seoType=500
 *   → api23.savaari.com (B2B API)
 *
 * Banners are cached after first load and refreshed per session.
 */
@Injectable({ providedIn: 'root' })
export class BannerService {

  private cache$: Observable<BannerImage[]> | null = null;

  constructor(
    private api: ApiService,
    private auth: AuthService,
  ) {}

  /**
   * Get banner images. Cached after first call.
   * sourceCity is optional — empty string returns global banners.
   */
  getBanners(sourceCity?: string | number): Observable<BannerImage[]> {
    if (environment.useMockData) {
      return of([]);
    }

    if (this.cache$) return this.cache$;

    this.cache$ = this.api.b2bGet<any>('banner-images-list', {
      sourceCity: sourceCity ?? '',
      seoType: 500,
    }).pipe(
      map(response => {
        // API may return array directly or wrapped in data/bannerImages
        const banners = response?.data || response?.bannerImages || response || [];

        if (!Array.isArray(banners)) return [];

        return banners.map((b: any) => ({
          imageUrl: b.image_url || b.imageUrl || b.banner_image || b.url || '',
          linkUrl: b.link_url || b.linkUrl || b.redirect_url || '',
          altText: b.alt_text || b.altText || b.title || 'B2B CAB Offer',
          title: b.title || b.banner_title || '',
        })).filter((b: BannerImage) => !!b.imageUrl);
      }),
      catchError(err => {
        console.warn('[BANNER] Failed to fetch banners:', err?.status || err?.message);
        return of([]);
      }),
      shareReplay(1)
    );

    return this.cache$;
  }

  /** Clear cache (e.g., when source city changes) */
  clearCache() {
    this.cache$ = null;
  }
}
