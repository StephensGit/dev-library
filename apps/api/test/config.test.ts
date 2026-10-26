import { describe, expect, it } from 'vitest';
import { loadConfig, parseTrustProxy } from '../src/config.js';

const valid = {
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:5173',
};

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
  ])('refuses %s', (_label, overrides, error) => {
    expect(() => loadConfig({ ...valid, ...overrides })).toThrow(error);
  });

  it('accepts https in production', () => {
    const config = loadConfig({ ...valid, NODE_ENV: 'production', BETTER_AUTH_URL: 'https://devlibrary.example.com/' });

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
