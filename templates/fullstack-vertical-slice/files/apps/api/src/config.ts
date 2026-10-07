import { z } from 'zod';

const ApiConfigSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535),
    DATABASE_URL: z
      .url()
      .refine(
        (value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
        'DATABASE_URL must use the postgres or postgresql protocol',
      ),
    WEB_ORIGIN: z
      .url()
      .refine(
        (value) => ['http:', 'https:'].includes(new URL(value).protocol),
        'WEB_ORIGIN must use the http or https protocol',
      ),
    SESSION_COOKIE_SECURE: z.enum(['true', 'false']).transform((value) => value === 'true'),
    SESSION_TTL_MINUTES: z.coerce.number().int().positive(),
  })
  .strict();

export type ApiConfig = z.infer<typeof ApiConfigSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  return ApiConfigSchema.parse({
    PORT: environment.PORT,
    DATABASE_URL: environment.DATABASE_URL,
    WEB_ORIGIN: environment.WEB_ORIGIN,
    SESSION_COOKIE_SECURE: environment.SESSION_COOKIE_SECURE,
    SESSION_TTL_MINUTES: environment.SESSION_TTL_MINUTES,
  });
}
