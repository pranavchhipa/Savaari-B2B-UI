/**
 * GSTIN Decoder — extracts state, PAN, entity type from a 15-char GST number.
 *
 * Format: SSPPPPPPPPPPXZX
 *   SS        = State code (01–38)
 *   PPPPPPPPPP = PAN (10 chars)
 *   X          = Registration number under same PAN
 *   Z          = Always 'Z'
 *   X          = Checksum
 *
 * Reference: Transform Savaari B2B Cab Platform.pdf (March 2026)
 */

export interface GSTINDecodeResult {
  gstin: string;
  stateCode: string;
  stateName: string;
  pan: string;
  entityType: string;
  entityCode: string;
  nameInitial: string;
  registrationNumber: string;
  isValidFormat: boolean;
}

/** All Indian state/UT codes as per GST council */
const STATE_MAP: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh (Old)',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};

/** PAN 4th-character → entity type */
const ENTITY_MAP: Record<string, string> = {
  P: 'Individual',
  C: 'Company',
  H: 'HUF',
  F: 'Firm',
  A: 'AOP',
  T: 'Trust',
  B: 'BOI',
  L: 'Local Authority',
  J: 'Artificial Juridical Person',
  G: 'Government',
};

const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/**
 * Decode a GSTIN string into its components.
 * Returns isValidFormat: false if the input doesn't match the GST pattern.
 */
export function decodeGSTIN(gstin: string): GSTINDecodeResult {
  const clean = (gstin || '').toUpperCase().trim();

  if (!GST_REGEX.test(clean)) {
    return {
      gstin: clean,
      stateCode: '',
      stateName: '',
      pan: '',
      entityType: '',
      entityCode: '',
      nameInitial: '',
      registrationNumber: '',
      isValidFormat: false,
    };
  }

  const stateCode = clean.slice(0, 2);
  const pan = clean.slice(2, 12);
  const entityCode = pan[3];

  return {
    gstin: clean,
    stateCode,
    stateName: STATE_MAP[stateCode] || 'Unknown',
    pan,
    entityType: ENTITY_MAP[entityCode] || 'Unknown',
    entityCode,
    nameInitial: pan[4],
    registrationNumber: clean[12],
    isValidFormat: true,
  };
}

/** Quick check if a string looks like a valid GSTIN */
export function isValidGSTIN(gstin: string): boolean {
  return GST_REGEX.test((gstin || '').toUpperCase().trim());
}

/** Quick check if a string looks like a valid PAN */
export function isValidPAN(pan: string): boolean {
  return PAN_REGEX.test((pan || '').toUpperCase().trim());
}

/** Get state name from a 2-digit state code */
export function getStateName(code: string): string {
  return STATE_MAP[code] || '';
}
