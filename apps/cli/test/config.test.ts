import { describe, expect, it } from 'vitest';
import { DEFAULT_API_URL, apiUrlFromEnv, parseApiUrl } from '../src/config.js';

describe('DEVLIB_API_URL', () => {
  it('defaults to the hosted API', () => {
    expect(DEFAULT_API_URL).toBe('https://dev-library-gjfn.onrender.com');
    expect(apiUrlFromEnv({})).toBe(DEFAULT_API_URL);
    expect(apiUrlFromEnv({ DEVLIB_API_URL: '  ' })).toBe(DEFAULT_API_URL);
  });

  it('uses DEVLIB_API_URL instead of the default when set', () => {
    expect(apiUrlFromEnv({ DEVLIB_API_URL: 'http://localhost:3000' })).toBe('http://localhost:3000');
    expect(apiUrlFromEnv({ DEVLIB_API_URL: ' https://devlib.example.com/ ' })).toBe('https://devlib.example.com');
  });

  it.each([
    ['https://devlib.example.com', 'https://devlib.example.com'],
    ['https://devlib.example.com/', 'https://devlib.example.com'],
    ['https://example.com/devlib/', 'https://example.com/devlib'],
    ['http://localhost:3000', 'http://localhost:3000'],
    ['http://api.localhost:3000', 'http://api.localhost:3000'],
    ['http://127.0.0.1:3000', 'http://127.0.0.1:3000'],
    ['http://127.1.2.3', 'http://127.1.2.3'],
    ['http://[::1]:3000', 'http://[::1]:3000'],
  ])('accepts %s', (value, expected) => {
    expect(parseApiUrl(value)).toBe(expected);
  });

  it.each([
    ['http://devlib.example.com', /must use https/],
    ['http://192.168.1.10:3000', /must use https/],
    ['http://localhost.example.com', /must use https/],
    ['http://128.0.0.1', /must use https/],
    ['ftp://devlib.example.com', /full http\(s\) URL/],
    ['localhost:3000', /full http\(s\) URL/],
    ['not a url', /full http\(s\) URL/],
    ['https://user:pass@devlib.example.com', /must not contain/],
    ['https://devlib.example.com/?x=1', /must not contain/],
    ['https://devlib.example.com/#x', /must not contain/],
  ])('rejects %s', (value, message) => {
    expect(() => parseApiUrl(value)).toThrow(message);
  });
});
