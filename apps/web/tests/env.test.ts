/**
 * Environment validation tests.
 *
 * A missing key should fail the deploy, not the client meeting. These tests
 * pin the failure modes that matter, especially the ones that would be a
 * security incident rather than an outage.
 */

import { describe, expect, it } from 'vitest';

import { isAllowedEmail, parseServerEnv } from '../src/lib/config/env.js';

const base = {
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-placeholder',
  ANTHROPIC_API_KEY: 'anthropic-key-placeholder',
  AUTH_ALLOWED_EMAILS: 'dhruv@example.invalid, nikhil@example.invalid',
  APP_URL: 'https://app.example.invalid',
} satisfies NodeJS.ProcessEnv;

describe('parseServerEnv', () => {
  it('parses a valid environment', () => {
    const env = parseServerEnv(base);
    expect(env.APP_URL).toBe('https://app.example.invalid');
    expect(env.ANTHROPIC_MODEL_ID).toBe('claude-opus-5');
    expect(env.REPORT_COST_CAP_INR).toBe(40);
  });

  it('converts the cost cap to paise, the unit the ledger uses', () => {
    expect(parseServerEnv(base).reportCostCapPaise).toBe(4000);
    expect(parseServerEnv({ ...base, REPORT_COST_CAP_INR: '25' }).reportCostCapPaise).toBe(2500);
  });

  it('splits, trims and lowercases the allowlist', () => {
    const env = parseServerEnv({ ...base, AUTH_ALLOWED_EMAILS: ' A@x.invalid ,B@Y.invalid ' });
    expect(env.allowedEmails).toEqual(['a@x.invalid', 'b@y.invalid']);
  });

  it('refuses to start without a service-role key', () => {
    const { SUPABASE_SERVICE_ROLE_KEY: _omitted, ...without } = base;
    expect(() => parseServerEnv(without)).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('refuses an allowlist that parses to nothing', () => {
    // A permissive fallback here would mean anyone can sign in. Failing to
    // start is the correct behaviour.
    expect(() => parseServerEnv({ ...base, AUTH_ALLOWED_EMAILS: ' , , ' })).toThrow(
      /empty list/i,
    );
  });

  it('never echoes values in an error message', () => {
    // An error that prints the offending variable is how a service-role key
    // ends up in a build log.
    try {
      parseServerEnv({ ...base, SUPABASE_SERVICE_ROLE_KEY: '' });
      expect.unreachable('should have thrown');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
      expect(message).toContain('deliberately not printed');
      expect(message).not.toContain(base.ANTHROPIC_API_KEY);
    }
  });

  it('refuses to start if a secret leaked into a NEXT_PUBLIC_ variable', () => {
    // Anything prefixed NEXT_PUBLIC_ is in the browser bundle. Catching this
    // at startup is far cheaper than finding it in a deployed bundle.
    expect(() =>
      parseServerEnv({ ...base, NEXT_PUBLIC_OOPS: base.SUPABASE_SERVICE_ROLE_KEY }),
    ).toThrow(/browser bundle/i);

    expect(() =>
      parseServerEnv({ ...base, NEXT_PUBLIC_ALSO_OOPS: base.ANTHROPIC_API_KEY }),
    ).toThrow(/browser bundle/i);
  });

  it('allows an unrelated NEXT_PUBLIC_ variable', () => {
    expect(() => parseServerEnv({ ...base, NEXT_PUBLIC_FINE: 'a-public-value' })).not.toThrow();
  });

  it('refuses debug logging in production', () => {
    // Debug logs client financials.
    expect(() => parseServerEnv({ ...base, NODE_ENV: 'production', LOG_LEVEL: 'debug' })).toThrow(
      /never be debug in production/i,
    );
    expect(() =>
      parseServerEnv({ ...base, NODE_ENV: 'production', LOG_LEVEL: 'info' }),
    ).not.toThrow();
  });

  it('parses the LLM kill switch in every truthy spelling', () => {
    expect(parseServerEnv({ ...base, DISABLE_LLM_GENERATION: 'true' }).DISABLE_LLM_GENERATION).toBe(true);
    expect(parseServerEnv({ ...base, DISABLE_LLM_GENERATION: '1' }).DISABLE_LLM_GENERATION).toBe(true);
    expect(parseServerEnv({ ...base, DISABLE_LLM_GENERATION: 'false' }).DISABLE_LLM_GENERATION).toBe(false);
    expect(parseServerEnv(base).DISABLE_LLM_GENERATION).toBe(false);
  });

  it('rejects a malformed APP_URL rather than building broken auth redirects', () => {
    expect(() => parseServerEnv({ ...base, APP_URL: 'not-a-url' })).toThrow(/APP_URL/);
  });
});

describe('isAllowedEmail', () => {
  const env = parseServerEnv(base);

  it('accepts an allowlisted address regardless of case or whitespace', () => {
    expect(isAllowedEmail('dhruv@example.invalid', env)).toBe(true);
    expect(isAllowedEmail('  DHRUV@Example.Invalid  ', env)).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isAllowedEmail('someone@example.invalid', env)).toBe(false);
    expect(isAllowedEmail('', env)).toBe(false);
    // No subdomain or suffix trickery.
    expect(isAllowedEmail('dhruv@example.invalid.attacker.test', env)).toBe(false);
    expect(isAllowedEmail('dhruv@example.invalidx', env)).toBe(false);
  });
});
