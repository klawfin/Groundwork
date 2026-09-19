/**
 * Environment validation.
 *
 * "Validate at boundaries. Zod on everything crossing a boundary: form input,
 * API responses, LLM output, ENVIRONMENT VARIABLES AT STARTUP." - readme.md
 *
 * The point of validating at startup rather than at first use is that a
 * missing key fails the deploy, not the client meeting.
 *
 * SPLIT DELIBERATELY IN TWO. `serverEnv` holds secrets and is guarded by
 * `server-only`; `getPublicEnv()` returns what is already in the browser bundle.
 * Importing the server half from a Client Component is a build-time failure
 * rather than a key leak (architecture 5.4, threat 1).
 */

import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* Public - already in the browser bundle, by design                          */
/* -------------------------------------------------------------------------- */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let cachedPublicEnv: PublicEnv | null = null;

/**
 * Public environment, validated on first use and then memoised.
 *
 * LAZY, not module-level. Next.js inlines `process.env.NEXT_PUBLIC_*` at build
 * time wherever it is referenced statically — which it is, below — so laziness
 * costs nothing in the bundle. What it buys is that importing this module does
 * not throw, which matters because `parseServerEnv` lives here too and must be
 * unit-testable without a full browser-facing configuration present.
 *
 * Production behaviour is unchanged: the first actual use still throws.
 */
export function getPublicEnv(): PublicEnv {
  if (cachedPublicEnv) return cachedPublicEnv;

  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new Error(formatEnvError('public', parsed.error));
  }
  cachedPublicEnv = parsed.data;
  return cachedPublicEnv;
}


/* -------------------------------------------------------------------------- */
/* Server - secrets                                                           */
/* -------------------------------------------------------------------------- */

const booleanish = z
  .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0'), z.literal('')])
  .optional()
  .transform((v) => v === 'true' || v === '1');

export const serverSchema = z.object({
  /** Bypasses RLS entirely. The single highest-value secret in the system. */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL_ID: z.string().min(1).default('claude-opus-5'),

  /**
   * The authorisation boundary for the whole application in Phase 1,
   * alongside the database trigger. Comma-separated.
   */
  AUTH_ALLOWED_EMAILS: z.string().min(1),

  APP_URL: z.string().url().default('http://localhost:3000'),

  REPORT_COST_CAP_INR: z.coerce.number().positive().default(40),
  USD_INR_RATE: z.coerce.number().positive().default(88),

  /**
   * Run without calling the API. Use for ALL UI work: it costs nothing and it
   * exercises the fallback report path, which is otherwise hard to reach and
   * is exactly what is needed on the morning something breaks.
   */
  DISABLE_LLM_GENERATION: booleanish,

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  SENTRY_DSN: z.string().url().optional().or(z.literal('')),
});

export type ServerEnv = z.infer<typeof serverSchema> & {
  /** Parsed from AUTH_ALLOWED_EMAILS, lowercased and trimmed. */
  allowedEmails: readonly string[];
  /** Cost cap in paise - the unit the ledger actually uses. */
  reportCostCapPaise: number;
};

/**
 * Parse server environment.
 *
 * Exported as a function rather than a module-level constant so it is unit
 * testable without mutating the real process environment.
 */
export function parseServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const parsed = serverSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(formatEnvError('server', parsed.error));
  }

  const allowedEmails = parsed.data.AUTH_ALLOWED_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);

  if (allowedEmails.length === 0) {
    throw new Error(
      'AUTH_ALLOWED_EMAILS parsed to an empty list. With no allowlist nobody can sign in, and a permissive fallback would be worse.',
    );
  }

  // A secret that leaked into a NEXT_PUBLIC_ variable is published. Catching it
  // at startup is far cheaper than discovering it in a deployed bundle.
  for (const [key, value] of Object.entries(source)) {
    if (!key.startsWith('NEXT_PUBLIC_')) continue;
    if (typeof value !== 'string' || value.length === 0) continue;
    if (
      value === parsed.data.SUPABASE_SERVICE_ROLE_KEY ||
      (parsed.data.ANTHROPIC_API_KEY && value === parsed.data.ANTHROPIC_API_KEY)
    ) {
      throw new Error(
        `${key} contains a value identical to a server secret. Anything prefixed NEXT_PUBLIC_ is in the browser bundle. Rotate that credential - it is compromised.`,
      );
    }
  }

  if (parsed.data.NODE_ENV === 'production' && parsed.data.LOG_LEVEL === 'debug') {
    throw new Error('LOG_LEVEL must never be debug in production - debug logs client financials.');
  }

  return {
    ...parsed.data,
    allowedEmails,
    reportCostCapPaise: Math.round(parsed.data.REPORT_COST_CAP_INR * 100),
  };
}

/** Is this address permitted to sign in? Case-insensitive. */
export function isAllowedEmail(email: string, env: Pick<ServerEnv, 'allowedEmails'>): boolean {
  return env.allowedEmails.includes(email.trim().toLowerCase());
}

/**
 * Format a validation failure WITHOUT echoing values.
 *
 * An error message that prints the offending environment variable is how a
 * service-role key ends up in a build log.
 */
function formatEnvError(scope: string, error: z.ZodError): string {
  const missing = error.issues.map((i) => i.path.join('.')).join(', ');
  return `Invalid ${scope} environment configuration. Problem with: ${missing}. See .env.example. (Values are deliberately not printed.)`;
}
