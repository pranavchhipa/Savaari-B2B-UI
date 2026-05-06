/**
 * Auth models — matches real Savaari B2B API (captured March 2026).
 *
 * Login flow:
 *  1. POST /user/login → B2B RSA token + user profile
 *  2. GET  /auth/webtoken → Partner HMAC token (no auth required)
 */

/** POST /user/login request body (JSON) */
export interface LoginRequest {
  userEmail: string;
  password: string;
  isAgent: boolean;
}

/** POST /user/login response */
export interface LoginResponse {
  statusCode: number;
  message: string;
  token: string;           // RSA RS256 JWT → stored as loginUserToken
  user: UserProfile;
  userGst: UserGst;
}

/** User profile from login response (stored as loggedUserDetail) */
export interface UserProfile {
  user_id: number;
  email: string;
  firstname: string;
  lastname: string;
  phone: string;
  mobileno: string;
  companyname: string;
  is_agent: number;
  user_type: number;
  user_subtype: number;
  travel_partner_type: number;
  user_active: number;
  billingaddress: string;
  city: string;
  title: string;
  [key: string]: unknown;
}

/** GST details from login response */
export interface UserGst {
  user_id: string;
  gst_number: string;
  pan_number: string;
  company_logo: string;
  is_agent: string;
}

/** GET /auth/webtoken response (Partner API, no auth required) */
export interface WebTokenResponse {
  status: string;
  data: {
    token: string;          // HMAC HS512 JWT → stored as SavaariToken
    date: string;
    time_zone: string;
  };
}

/**
 * Commission API wrapper response from GET /user/get-commission.
 * Real API returns: { statusCode, message, commission: { ...fields } }
 */
export interface CommissionApiResponse {
  statusCode: number;
  message: string;
  commission: CommissionData;
}

/**
 * Commission data — real API field names (snake_case, all values are strings).
 *
 * Key fields:
 *  - *_commision (sic): percentage commission Savaari pays the agent
 *  - *_commission_amount: fixed commission amount
 *  - *_rate_bump_up: percentage adjustment on fares for this agent (negative = discount)
 *  - *_rate_bump_up_amt: fixed fare adjustment
 *  - display_commission_flag: "0"/"1" — whether to show commission to agent
 *  - disable_commission_update: "0"/"1" — whether agent can change commission
 *  - invoice_payer: "pay_by_agent" | "pay_by_customer"
 *  - wallet_user: "0"/"1"
 *  - enable_*: "0"/"1" feature flags for trip types
 */
export interface CommissionData {
  id: string;
  user_id: string;
  state_id: string;
  city_id: string;
  agent_gst: string;
  // Commission percentages (note: API typo "commision")
  airport_commision: string;
  local_commision: string;
  outstation_commision: string;
  // Fixed commission amounts
  airport_commission_amount: string;
  local_commission_amount: string;
  outstation_commission_amount: string;
  // Rate bump-up (fare adjustment)
  airport_rate_bump_up: string;
  local_rate_bump_up: string;
  outstation_rate_bump_up: string;
  airport_rate_bump_up_amt: string;
  local_rate_bump_up_amt: string;
  outstation_rate_bump_up_amt: string;
  // Display & control flags
  display_commission_flag: string;
  disable_commission_update: string;
  savaari_commission: string;
  // Feature flags
  enable_oneway: string;
  enable_roundtrip: string;
  enable_local: string;
  enable_transfer: string;
  // Agent settings
  invoice_payer: string;
  wallet_user: string;
  enable_no_payment: string;
  block_agent: string;
  block_agent_invoice: string;
  block_customer_invoice: string;
  block_customer_communication: string;
  display_only_premium: string;
  unrealized_full_paid_bookings: string;
  remark: string;
  [key: string]: string;
}

/** Legacy alias — kept for backward compat */
export interface CommissionResponse {
  commission?: number;
  commissionType?: string;
  [key: string]: unknown;
}
