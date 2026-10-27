import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

export type RecordedRequest = { method: string; path: string; headers: IncomingHttpHeaders; body: unknown };

type Reply = { status?: number; headers?: Record<string, string>; json?: unknown };

// A throwaway HTTP server on a random local port that records every request, standing in for the API.
export async function startServer(handler: (request: RecordedRequest) => Reply | Promise<Reply>) {
  const requests: RecordedRequest[] = [];

  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
    }

    const request = {
      method: req.method ?? 'GET',
      path: req.url ?? '/',
      headers: req.headers,
      body: raw ? JSON.parse(raw) : undefined,
    };
    requests.push(request);

    const reply = await handler(request);
    res.writeHead(reply.status ?? 200, { 'content-type': 'application/json', ...reply.headers });
    res.end(reply.json === undefined ? '' : JSON.stringify(reply.json));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
