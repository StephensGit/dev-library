// Fastify turns errors with a statusCode into a matching JSON response.
export function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}
