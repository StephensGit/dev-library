import { describe, expect, it } from 'vitest';
import { parseCreateUserArgs } from '../src/create-user.js';
import {
  isSignupAllowed,
  loadConfig,
  parseSignupAllowlist,
  parseSignupEnabled,
  parseTrustProxy,
} from '../src/config.js';

const valid = {
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:5173',
};

const PRODUCTION = { NODE_ENV: 'production', BETTER_AUTH_URL: 'https://devlibrary.example.com' };
const OPEN_PRODUCTION = { ...PRODUCTION, SIGNUP_ENABLED: 'true' };

describe('startup configuration', () => {
  it('accepts a valid development setup', () => {
    expect(loadConfig(valid)).toMatchObject({ isProduction: false, trustedOrigin: 'http://localhost:5173' });
  });

  it.each([
    ['a missing secret', { BETTER_AUTH_SECRET: undefined }, /BETTER_AUTH_SECRET is not set/],
    ['a short secret', { BETTER_AUTH_SECRET: 'short' }, /at least 32 characters/],
    ['a missing URL', { BETTER_AUTH_URL: undefined }, /BETTER_AUTH_URL is not set/],
    ['an invalid URL', { BETTER_AUTH_URL: 'localhost:5173' }, /must be a full URL/],
    ['http in production', { NODE_ENV: 'production', BETTER_AUTH_URL: 'http://devlibrary.example.com' }, /https/],
    ['TRUST_PROXY=true', { TRUST_PROXY: 'true' }, /would let clients fake their IP/],
    ['an invalid allowlist entry', { SIGNUP_ALLOWED_EMAILS: 'me@example.com, not-an-email' }, /1 invalid address/],
    ['an unknown SIGNUP_ENABLED', { SIGNUP_ENABLED: 'yes' }, /SIGNUP_ENABLED must be "true" or "false"/],
    ['open production sign-up without an allowlist', OPEN_PRODUCTION, /must list at least one email/],
    ['open production sign-up, empty allowlist', { ...OPEN_PRODUCTION, SIGNUP_ALLOWED_EMAILS: '' }, /at least one/],
    ['open production sign-up, only commas', { ...OPEN_PRODUCTION, SIGNUP_ALLOWED_EMAILS: ' , ' }, /at least one/],
    ['production with an invalid allowlist', { ...PRODUCTION, SIGNUP_ALLOWED_EMAILS: 'me@example' }, /invalid/],
  ])('refuses %s', (_label, overrides, error) => {
    expect(() => loadConfig({ ...valid, ...overrides })).toThrow(error);
  });

  it('accepts https in production', () => {
    const config = loadConfig({
      ...valid,
      NODE_ENV: 'production',
      BETTER_AUTH_URL: 'https://devlibrary.example.com/',
    });

    expect(config).toMatchObject({ isProduction: true, trustedOrigin: 'https://devlibrary.example.com' });
  });
});

describe('TRUST_PROXY', () => {
  it('trusts no proxy by default', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
  });

  it('trusts the given number of hops', () => {
    const trust = parseTrustProxy('1') as (address: string, hop: number) => boolean;

    expect(trust('10.0.0.1', 0)).toBe(true);
    expect(trust('203.0.113.1', 1)).toBe(false);
  });

  it('trusts a list of proxy addresses', () => {
    expect(parseTrustProxy('10.0.0.0/8, 127.0.0.1')).toEqual(['10.0.0.0/8', '127.0.0.1']);
  });
});

describe('SIGNUP_ALLOWED_EMAILS', () => {
  it('allows anyone to register outside production when unset or empty', () => {
    expect(parseSignupAllowlist(undefined, false)).toBeNull();
    expect(parseSignupAllowlist('', false)).toBeNull();
    expect(isSignupAllowed(null, 'anyone@example.com')).toBe(true);
  });

  it('trims, lowercases and skips blank entries', () => {
    expect(parseSignupAllowlist(' Me@Example.com ,, YOU@example.com,', true)).toEqual(
      new Set(['me@example.com', 'you@example.com']),
    );
  });

  it('matches emails case-insensitively and exactly', () => {
    const allowlist = parseSignupAllowlist('me@example.com', false);

    expect(isSignupAllowed(allowlist, ' ME@example.COM ')).toBe(true);
    expect(isSignupAllowed(allowlist, 'me@example.co')).toBe(false);
    expect(isSignupAllowed(allowlist, 'someone@example.com')).toBe(false);
  });
});

describe('SIGNUP_ENABLED', () => {
  it('is closed in production and open elsewhere by default', () => {
    expect(parseSignupEnabled(undefined, true)).toBe(false);
    expect(parseSignupEnabled('', true)).toBe(false);
    expect(parseSignupEnabled(undefined, false)).toBe(true);
  });

  it('can be set either way', () => {
    expect(parseSignupEnabled('true', true)).toBe(true);
    expect(parseSignupEnabled('false', false)).toBe(false);
  });

  it('starts production with sign-up closed and no allowlist', () => {
    expect(loadConfig({ ...valid, ...PRODUCTION })).toMatchObject({ signupEnabled: false, signupAllowlist: null });
  });

  it('starts production with sign-up open when an allowlist is set', () => {
    const config = loadConfig({ ...valid, ...OPEN_PRODUCTION, SIGNUP_ALLOWED_EMAILS: 'me@example.com' });

    expect(config).toMatchObject({ signupEnabled: true, signupAllowlist: new Set(['me@example.com']) });
  });
});

describe('create-user arguments', () => {
  it('takes an email and an optional name', () => {
    expect(parseCreateUserArgs(['--email', 'me@example.com'])).toEqual({ email: 'me@example.com', name: 'me' });
    expect(parseCreateUserArgs(['--email', 'me@example.com', '--name', 'Me'])).toEqual({
      email: 'me@example.com',
      name: 'Me',
    });
  });

  it.each([['--password', 'hunter2'], ['--password=hunter2'], ['-p', 'hunter2'], ['--PASSWORD=hunter2']])(
    'refuses a password argument (%s)',
    (...args) => {
      expect(() => parseCreateUserArgs(['--email', 'me@example.com', ...args])).toThrow(/never accepted/);
    },
  );

  it.each([['--pass=hunter2'], ['hunter2'], ['--name']])('refuses %s without echoing it', (arg) => {
    expect(() => parseCreateUserArgs(['--email', 'me@example.com', arg])).toThrow(/^Usage: create-user/);
  });

  it('requires an email', () => {
    expect(() => parseCreateUserArgs([])).toThrow(/Usage/);
  });
});
