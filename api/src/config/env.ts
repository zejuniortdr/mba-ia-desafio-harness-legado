import { z } from 'zod'

// Variável vazia no .env vale como ausente, como nos `process.env.X || padrão` de antes.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema)

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  NODE_ENV: optional(z.enum(['development', 'test', 'production']).default('development')),
  PORT: optional(z.coerce.number().int().positive().default(4000)),
  JWT_SECRET: optional(z.string().default('dev-secret')),
  // Como antes: só 'openai' liga a IA real; qualquer outro valor é fake.
  AI_MODE: z.preprocess((value) => (value === 'openai' ? 'openai' : 'fake'), z.enum(['fake', 'openai'])),
  OPENAI_API_KEY: optional(z.string().optional()),
  UPLOAD_DIR: optional(z.string().default('/tmp/balcao/uploads')),
  WEB_ORIGIN: optional(z.string().default('http://localhost:5173')),
  TRIAGE_INTERVAL_MS: optional(z.coerce.number().int().positive().default(2000)),
})

export type Env = z.infer<typeof schema>

export function parseEnv(source: Record<string, string | undefined>): Env {
  return schema.parse(source)
}

export const env = parseEnv(process.env)
