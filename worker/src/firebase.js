// DavAI Worker — Firebase ID token verification.
// Uses Google's public JWKS + Web Crypto. No Admin SDK, no service account.

const GOOGLE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const KEYS_CACHE_TTL_MS = 3600_000; // 1 hour

let keysCache = { at: 0, keys: null };

async function getJwks() {
  const now = Date.now();
  if (keysCache.keys && (now - keysCache.at) < KEYS_CACHE_TTL_MS) {
    return keysCache.keys;
  }
  const res = await fetch(GOOGLE_JWKS_URL, { cf: { cacheTtl: 3600 } });
  if (!res.ok) throw new Error("jwks_fetch_failed");
  const data = await res.json();
  keysCache = { at: now, keys: data.keys || [] };
  return keysCache.keys;
}

function b64urlToBytes(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = (str + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToJson(str) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(str)));
}

async function findKey(kid) {
  const keys = await getJwks();
  const jwk = keys.find((k) => k.kid === kid);
  if (!jwk) return null;
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

/**
 * Verify a Firebase ID token (JWT) against Google's public keys.
 * @param {string} token — Firebase ID token from client
 * @param {string} projectId — Firebase project ID
 * @returns {{ uid: string, claims: object }}
 * @throws on any verification failure
 */
export async function verifyIdToken(token, projectId) {
  if (!token || typeof token !== "string") throw new Error("missing_token");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed_token");

  const [headerB64, payloadB64, sigB64] = parts;
  const header = b64urlToJson(headerB64);
  const claims = b64urlToJson(payloadB64);

  if (header.alg !== "RS256") throw new Error("bad_alg");
  if (!header.kid) throw new Error("missing_kid");

  const key = await findKey(header.kid);
  if (!key) throw new Error("key_not_found");

  const data = new TextEncoder().encode(headerB64 + "." + payloadB64);
  const sig = b64urlToBytes(sigB64);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, data);
  if (!ok) throw new Error("bad_signature");

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp < now) throw new Error("token_expired");
  if (typeof claims.iat !== "number" || claims.iat > now + 60) throw new Error("bad_iat");
  if (claims.aud !== projectId) throw new Error("bad_aud");
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) throw new Error("bad_iss");
  if (!claims.sub || typeof claims.sub !== "string") throw new Error("missing_sub");

  return { uid: claims.sub, claims };
}

/**
 * Extract Bearer token from an incoming request.
 */
export function getBearerToken(request) {
  const h = request.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}
