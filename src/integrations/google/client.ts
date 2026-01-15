/**
 * Lightweight Google integration client.
 *
 * Notes:
 * - Requires VITE_GOOGLE_CLIENT_ID to be set in your environment.
 * - Uses Google Identity Services token client to obtain access tokens for Drive/Sheets scopes.
 * - Persists access token + expiry in localStorage so the app can restore connection across page reloads.
 *
 * Usage:
 *  await init();
 *  await requestAccessToken(); // prompts consent if needed (and persists token)
 *  const files = await listDriveSpreadsheets(token);
 *  const values = await getSpreadsheetValues(token, spreadsheetId, range);
 *  const sheets = await getSpreadsheetSheets(token, spreadsheetId);
 */

declare global {
  interface Window {
    google?: any;
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
].join(" ");

let _scriptLoaded = false;
let _tokenClient: any = null;

const STORAGE_KEY = "gis_access_token";
const STORAGE_EXPIRES_KEY = "gis_access_token_expires_at";

/**
 * Return stored access token if present and not expired.
 * Returns { access_token, expires_at } or null.
 */
export function getStoredAccessToken(): { access_token: string; expires_at?: number } | null {
  try {
    const token = localStorage.getItem(STORAGE_KEY);
    if (!token) return null;
    const expiresRaw = localStorage.getItem(STORAGE_EXPIRES_KEY);
    const expiresAt = expiresRaw ? Number(expiresRaw) : undefined;
    if (expiresAt && Date.now() > expiresAt) {
      // expired -> clear it
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_EXPIRES_KEY);
      return null;
    }
    return { access_token: token, expires_at: expiresAt };
  } catch (err) {
    console.warn("getStoredAccessToken failed", err);
    return null;
  }
}

async function persistAccessToken(tokenResp: any) {
  try {
    if (!tokenResp?.access_token) return;
    localStorage.setItem(STORAGE_KEY, tokenResp.access_token);
    if (tokenResp.expires_in) {
      // subtract a small slack so we treat near-expiry as expired
      const expiresAt = Date.now() + Number(tokenResp.expires_in) * 1000 - 10_000;
      localStorage.setItem(STORAGE_EXPIRES_KEY, String(expiresAt));
    } else {
      localStorage.removeItem(STORAGE_EXPIRES_KEY);
    }
  } catch (err) {
    console.warn("persistAccessToken failed", err);
  }
}

export async function init() {
  if (!CLIENT_ID) {
    throw new Error("VITE_GOOGLE_CLIENT_ID is not set");
  }

  if (_scriptLoaded) return;

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-gis]');
    if (existing) {
      _scriptLoaded = true;
      resolve();
      return;
    }

    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.setAttribute("data-gis", "1");
    s.onload = () => {
      _scriptLoaded = true;
      resolve();
    };
    s.onerror = (err) => reject(err);
    document.head.appendChild(s);
  });
}

export function initTokenClient(onTokenResponse?: (resp: any) => void, prompt = "") {
  if (!_scriptLoaded) {
    throw new Error("Google Identity Services script not loaded. Call init() first.");
  }
  if (!CLIENT_ID) {
    throw new Error("VITE_GOOGLE_CLIENT_ID is not set");
  }

  // Create a token client that will request an access token for the requested scopes.
  _tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    prompt, // use default prompt behavior unless overridden
    callback: (resp: any) => {
      // resp: { access_token, expires_in, scope, token_type }
      // persist token for reloads
      persistAccessToken(resp);
      if (onTokenResponse) onTokenResponse(resp);
    },
  });

  return _tokenClient;
}

/**
 * Requests an access token. Returns { access_token, expires_in, scope, token_type }.
 * The token client will prompt the user if consent is needed.
 */
export function requestAccessToken(): Promise<any> {
  return new Promise(async (resolve, reject) => {
    try {
      await init();
      if (!_tokenClient) {
        initTokenClient((resp: any) => {
          if (resp && resp.access_token) {
            // persist done in initTokenClient callback
            resolve(resp);
          } else {
            reject(new Error("No token received"));
          }
        });
      } else {
        // ensure callback resolves
        _tokenClient.callback = (resp: any) => {
          if (resp && resp.access_token) {
            // persist done in callback
            persistAccessToken(resp);
            resolve(resp);
          } else {
            reject(new Error("No token received"));
          }
        };
      }

      // Request the token (this will trigger the consent popup if needed)
      _tokenClient.requestAccessToken();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Revokes an access token and clears persisted storage
 */
export async function revokeToken(accessToken: string) {
  try {
    if (!accessToken) return;
    await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
      method: "POST",
      headers: {
        "Content-type": "application/x-www-form-urlencoded",
      },
    });
  } finally {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_EXPIRES_KEY);
    } catch {}
  }
}

/**
 * List spreadsheets in the user's Drive (first 200). Returns array of { id, name, mimeType, createdTime }.
 */
export async function listDriveSpreadsheets(accessToken: string) {
  if (!accessToken) throw new Error("accessToken required");
  const q = encodeURIComponent('mimeType = "application/vnd.google-apps.spreadsheet" and trashed = false');
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,createdTime)&pageSize=200`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive API error: ${res.status} ${text}`);
  }
  const json = await res.json();
  return json.files || [];
}

/**
 * Get spreadsheet values (Sheets API).
 * Example range: 'Sheet1!A1:Z1000'
 */
export async function getSpreadsheetValues(accessToken: string, spreadsheetId: string, range = "Sheet1!A1:1000") {
  if (!accessToken) throw new Error("accessToken required");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API error: ${res.status} ${text}`);
  }
  const json = await res.json();
  return json; // contains range, majorDimension, values
}

/**
 * Get sheet (tab) titles for a spreadsheet.
 * Returns an array of strings (sheet titles).
 */
export async function getSpreadsheetSheets(accessToken: string, spreadsheetId: string) {
  if (!accessToken) throw new Error("accessToken required");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets metadata API error: ${res.status} ${text}`);
  }
  const json = await res.json();
  const sheets = (json.sheets || []).map((s: any) => s.properties?.title).filter(Boolean);
  return sheets;
}