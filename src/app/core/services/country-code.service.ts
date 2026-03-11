import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, tap, shareReplay, catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

export interface CountryCodeEntry {
  countryName: string;
  isdCode: string;
  key: string; // e.g. "91|IND"
  iso2: string; // 2-letter ISO code for flag display, e.g. "in"
}

/**
 * Fetches country codes (ISD codes) from the Savaari B2B API.
 *
 * Confirmed from live API (March 2026):
 *   GET /country-code → api23.savaari.com/country-code
 *   Params: userEmail, token (B2B RSA JWT)
 *   Returns: { statusCode: 200, message, countryCode: { "91|IND": { country_name, isd_code }, ... } }
 *   225 countries total.
 */
@Injectable({ providedIn: 'root' })
export class CountryCodeService {
  private cachedCodes: CountryCodeEntry[] | null = null;
  private inFlight$: Observable<CountryCodeEntry[]> | null = null;

  constructor(
    private api: ApiService,
    private auth: AuthService,
  ) {}

  /**
   * Get the list of country codes sorted with India first.
   * Cached after first call.
   */
  getCountryCodes(): Observable<CountryCodeEntry[]> {
    if (environment.useMockData) {
      return of(this.defaultCodes());
    }

    if (this.cachedCodes) {
      return of(this.cachedCodes);
    }

    if (this.inFlight$) {
      return this.inFlight$;
    }

    this.inFlight$ = this.api.b2bGet<any>('country-code', {
      userEmail: this.auth.getUserEmail(),
      token: this.auth.getB2bToken(),
    }).pipe(
      map(response => {
        if (!response?.countryCode) return this.defaultCodes();

        const codeMap = response.countryCode;
        const entries: CountryCodeEntry[] = [];

        for (const [key, value] of Object.entries(codeMap)) {
          const v = value as any;
          const alpha3 = key.split('|')[1] || '';
          entries.push({
            key,
            countryName: v.country_name || '',
            isdCode: v.isd_code || '',
            iso2: alpha3ToAlpha2(alpha3),
          });
        }

        // Sort: India first, then alphabetically by country name
        entries.sort((a, b) => {
          if (a.isdCode === '91') return -1;
          if (b.isdCode === '91') return 1;
          return a.countryName.localeCompare(b.countryName);
        });

        return entries;
      }),
      tap(codes => {
        this.cachedCodes = codes;
        this.inFlight$ = null;
        console.log(`[COUNTRY-CODE] Loaded ${codes.length} countries`);
      }),
      shareReplay(1),
      catchError(err => {
        this.inFlight$ = null;
        console.warn('[COUNTRY-CODE] API error, using defaults:', err);
        return of(this.defaultCodes());
      })
    );

    return this.inFlight$;
  }

  /** Common defaults for fallback */
  private defaultCodes(): CountryCodeEntry[] {
    return [
      { key: '91|IND', countryName: 'India', isdCode: '91', iso2: 'in' },
      { key: '1|USA', countryName: 'United States', isdCode: '1', iso2: 'us' },
      { key: '44|GBR', countryName: 'United Kingdom', isdCode: '44', iso2: 'gb' },
      { key: '971|ARE', countryName: 'United Arab Emirates', isdCode: '971', iso2: 'ae' },
      { key: '65|SGP', countryName: 'Singapore', isdCode: '65', iso2: 'sg' },
      { key: '61|AUS', countryName: 'Australia', isdCode: '61', iso2: 'au' },
    ];
  }
}

/** Convert ISO 3166-1 alpha-3 to alpha-2 (lowercase) for flag-icons CSS */
function alpha3ToAlpha2(alpha3: string): string {
  const map: Record<string, string> = {
    AFG:'af',ALB:'al',DZA:'dz',ASM:'as',AND:'ad',AGO:'ao',AIA:'ai',ATA:'aq',
    ATG:'ag',ARG:'ar',ARM:'am',ABW:'aw',AUS:'au',AUT:'at',AZE:'az',BHS:'bs',
    BHR:'bh',BGD:'bd',BRB:'bb',BLR:'by',BEL:'be',BLZ:'bz',BEN:'bj',BMU:'bm',
    BTN:'bt',BOL:'bo',BIH:'ba',BWA:'bw',BRA:'br',BRN:'bn',BGR:'bg',BFA:'bf',
    BDI:'bi',KHM:'kh',CMR:'cm',CAN:'ca',CPV:'cv',CYM:'ky',CAF:'cf',TCD:'td',
    CHL:'cl',CHN:'cn',COL:'co',COM:'km',COG:'cg',COD:'cd',COK:'ck',CRI:'cr',
    CIV:'ci',HRV:'hr',CUB:'cu',CYP:'cy',CZE:'cz',DNK:'dk',DJI:'dj',DMA:'dm',
    DOM:'do',ECU:'ec',EGY:'eg',SLV:'sv',GNQ:'gq',ERI:'er',EST:'ee',ETH:'et',
    FLK:'fk',FRO:'fo',FJI:'fj',FIN:'fi',FRA:'fr',GUF:'gf',PYF:'pf',GAB:'ga',
    GMB:'gm',GEO:'ge',DEU:'de',GHA:'gh',GIB:'gi',GRC:'gr',GRL:'gl',GRD:'gd',
    GLP:'gp',GUM:'gu',GTM:'gt',GIN:'gn',GNB:'gw',GUY:'gy',HTI:'ht',HND:'hn',
    HKG:'hk',HUN:'hu',ISL:'is',IND:'in',IDN:'id',IRN:'ir',IRQ:'iq',IRL:'ie',
    ISR:'il',ITA:'it',JAM:'jm',JPN:'jp',JOR:'jo',KAZ:'kz',KEN:'ke',KIR:'ki',
    PRK:'kp',KOR:'kr',KWT:'kw',KGZ:'kg',LAO:'la',LVA:'lv',LBN:'lb',LSO:'ls',
    LBR:'lr',LBY:'ly',LIE:'li',LTU:'lt',LUX:'lu',MAC:'mo',MKD:'mk',MDG:'mg',
    MWI:'mw',MYS:'my',MDV:'mv',MLI:'ml',MLT:'mt',MHL:'mh',MTQ:'mq',MRT:'mr',
    MUS:'mu',MYT:'yt',MEX:'mx',FSM:'fm',MDA:'md',MCO:'mc',MNG:'mn',MNE:'me',
    MSR:'ms',MAR:'ma',MOZ:'mz',MMR:'mm',NAM:'na',NRU:'nr',NPL:'np',NLD:'nl',
    NCL:'nc',NZL:'nz',NIC:'ni',NER:'ne',NGA:'ng',NIU:'nu',NFK:'nf',MNP:'mp',
    NOR:'no',OMN:'om',PAK:'pk',PLW:'pw',PSE:'ps',PAN:'pa',PNG:'pg',PRY:'py',
    PER:'pe',PHL:'ph',POL:'pl',PRT:'pt',PRI:'pr',QAT:'qa',REU:'re',ROU:'ro',
    RUS:'ru',RWA:'rw',KNA:'kn',LCA:'lc',VCT:'vc',WSM:'ws',SMR:'sm',STP:'st',
    SAU:'sa',SEN:'sn',SRB:'rs',SYC:'sc',SLE:'sl',SGP:'sg',SVK:'sk',SVN:'si',
    SLB:'sb',SOM:'so',ZAF:'za',ESP:'es',LKA:'lk',SDN:'sd',SUR:'sr',SWZ:'sz',
    SWE:'se',CHE:'ch',SYR:'sy',TWN:'tw',TJK:'tj',TZA:'tz',THA:'th',TLS:'tl',
    TGO:'tg',TKL:'tk',TON:'to',TTO:'tt',TUN:'tn',TUR:'tr',TKM:'tm',TCA:'tc',
    TUV:'tv',UGA:'ug',UKR:'ua',ARE:'ae',GBR:'gb',USA:'us',URY:'uy',UZB:'uz',
    VUT:'vu',VEN:'ve',VNM:'vn',VGB:'vg',VIR:'vi',WLF:'wf',YEM:'ye',ZMB:'zm',
    ZWE:'zw',SSD:'ss',CUW:'cw',SXM:'sx',BES:'bq',XKX:'xk',
  };
  return map[alpha3.toUpperCase()] || alpha3.substring(0, 2).toLowerCase();
}
