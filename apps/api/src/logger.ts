// Request logs only include the method, URL and client address, never headers or bodies.
// The redaction is a safety net in case cookies, passwords or tokens are ever logged by mistake.
export const loggerOptions = {
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
      'res.headers["set-auth-token"]',
      '*.password',
      '*.token',
      '*.access_token',
      '*.device_code',
    ],
    censor: '[redacted]',
  },
};
