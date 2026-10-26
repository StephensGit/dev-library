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

  return {
    isProduction,
    secret,
    baseURL,
    // The only origin allowed to make state-changing requests: where the browser loads the app.
    trustedOrigin: url.origin,
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
  };
}

export const config = loadConfig();
