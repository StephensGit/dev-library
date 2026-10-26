import { buildApp } from './app.js';

const fastify = buildApp({
  logger: true,
});

const start = async () => {
  try {
    await fastify.listen({
      port: Number(process.env.PORT ?? 3000),
    });
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
};

start();
