import type { Params } from 'nestjs-pino';

export function createLoggerConfig() {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    pinoHttp: {
      level: isProduction ? 'info' : 'debug',
      transport: isProduction ? undefined : { target: 'pino-pretty' },
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          'res.headers["set-cookie"]',
        ],
        remove: true,
      },
    },
  } satisfies Params;
}
