/** POST /authenticate.php request */
export interface AuthRequest {
  apiKey: string;
  appId: string;
}

/** POST /authenticate.php response */
export interface AuthResponse {
  token: string;
  status: string;
  expiresIn?: number; // seconds -- TBD if Savaari returns this
}
