// Reads and checks the API's settings once at startup, so a misconfigured server refuses to start
// instead of running insecurely.

const MIN_SECRET_LENGTH = 32;

type Env = Record<string, string | undefined>;

function required(env: Env, name: string) {
  const value = env[name];

  if (!value) {
    throw new Error(`${name} is not set. See .env.example.`);
  }

  return value;
}

// TRUST_PROXY says which proxies in front of the API may report the client's IP (X-Forwarded-For):
//   unset or "false"  none: the client IP is whoever connected (local development, including the Vite proxy)
//   a number, e.g. 1  that many proxy hops directly in front of the API
//   IPs or CIDRs      only proxies at these addresses, e.g. "10.0.0.0/8,127.0.0.1"
// "true" (trust every hop) is refused because any client could then pick its own IP and dodge rate limits.
export function parseTrustProxy(
  value: string | undefined,
): false | string[] | ((address: string, hop: number) => boolean) {
  if (!value || value === 'false') {
    return false;
  }

  if (value === 'true') {
    throw new Error('TRUST_PROXY=true would let clients fake their IP. Use a hop count or proxy addresses instead.');
  }

  if (/^\d+$/.test(value)) {
    // Fastify asks about each hop, starting with the direct connection (hop 0).
    const hops = Number(value);
    return (_address, hop) => hop < hops;
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// Lowercased and trimmed, so allowlist entries and sign-up emails compare the same way.
export function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}

// A deliberately loose shape check: it catches typos like a missing "@" or a stray space,
// not every address RFC 5322 forbids.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailAddress(value: string) {
  return EMAIL_SHAPE.test(value);
}

// SIGNUP_ENABLED: whether the public sign-up route accepts registrations. "true" or "false";
// unset means closed in production (accounts are created with the create-user script) and open elsewhere.
export function parseSignupEnabled(value: string | undefined, isProduction: boolean) {
  if (value === undefined || value === '') {
    return !isProduction;
  }

  if (value !== 'true' && value !== 'false') {
    throw new Error('SIGNUP_ENABLED must be "true" or "false".');
  }

  return value === 'true';
}

// SIGNUP_ALLOWED_EMAILS: comma-separated addresses that may register, e.g. "me@example.com, you@example.com".
// Returns null when unset or empty, meaning no restriction. That's refused when `required`:
// in production with public sign-up open. Blank entries from stray commas are skipped;
// anything else that isn't an email address is refused.
export function parseSignupAllowlist(value: string | undefined, required: boolean): ReadonlySet<string> | null {
  const emails = (value ?? '').split(',').map(normaliseEmail).filter(Boolean);

  const invalid = emails.filter((email) => !isEmailAddress(email));
  if (invalid.length > 0) {
    throw new Error(`SIGNUP_ALLOWED_EMAILS has ${invalid.length} invalid address(es). Use comma-separated emails.`);
  }

  if (emails.length === 0) {
    if (required) {
      throw new Error(
        'SIGNUP_ALLOWED_EMAILS must list at least one email when SIGNUP_ENABLED=true in production. See .env.example.',
      );
    }

    return null;
  }

  return new Set(emails);
}

// null means no allowlist: anyone may register.
export function isSignupAllowed(allowlist: ReadonlySet<string> | null, email: string) {
  return allowlist === null || allowlist.has(normaliseEmail(email));
}

export function loadConfig(env: Env = process.env) {
  const isProduction = env.NODE_ENV === 'production';

  const secret = required(env, 'BETTER_AUTH_SECRET');

  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `BETTER_AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters. Generate one with: openssl rand -base64 32`,
    );
  }

  const baseURL = required(env, 'BETTER_AUTH_URL');
  // URL.canParse alone isn't enough: "localhost:5173" parses, with "localhost:" as the scheme.
  const url = URL.canParse(baseURL) ? new URL(baseURL) : null;

  if (url?.protocol !== 'http:' && url?.protocol !== 'https:') {
    throw new Error('BETTER_AUTH_URL must be a full URL, such as https://devlibrary.example.com');
  }

  // Session cookies are only marked Secure (HTTPS-only) when the app's URL is HTTPS.
  if (isProduction && url.protocol !== 'https:') {
    throw new Error('BETTER_AUTH_URL must use https:// in production.');
  }

  const signupEnabled = parseSignupEnabled(env.SIGNUP_ENABLED, isProduction);

  return {
    isProduction,
    secret,
    baseURL,
    // The only origin allowed to make state-changing requests: where the browser loads the app.
    trustedOrigin: url.origin,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    signupEnabled,
    signupAllowlist: parseSignupAllowlist(env.SIGNUP_ALLOWED_EMAILS, isProduction && signupEnabled),
  };
}

export const config = loadConfig();
