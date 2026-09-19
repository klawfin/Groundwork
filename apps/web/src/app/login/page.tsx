import { ORG_NAME, PRODUCT_NAME, REPORT_TITLE } from '@klawfin/core';

import { buttonClass, fieldClass, labelClass, Notice } from '../ui';

/**
 * Sign-in (P1-01, decision 0001).
 *
 * Magic link only. No password field exists, so there is no password to leak
 * and no reset flow to build. A non-allowlisted address gets the same generic
 * message as a valid one - confirming which addresses exist would be a free
 * gift to anyone probing.
 *
 * SPLIT LAYOUT, and the split is the point: a full-height Deep Navy panel
 * against the Warm Cream form. It is the only screen with room for the brand
 * to be stated rather than implied, and the navy mass is what makes the cream
 * read as chosen rather than beige.
 *
 * The panel collapses away under `lg` - on a phone it would push the form
 * below the fold, and the form is the only thing anyone came here to use.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ---------- Brand panel ---------- */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-inverse px-14 py-12 lg:flex">
        <div className="flex items-baseline gap-2.5">
          <span className="font-serif text-lg font-semibold text-on-inverse">{PRODUCT_NAME}</span>
          <span aria-hidden className="h-px w-6 bg-positive" />
          <span className="text-[11px] uppercase tracking-[0.16em] text-on-inverse-muted">
            {ORG_NAME}
          </span>
        </div>

        <div className="max-w-sm">
          <h2 className="font-serif text-[34px] font-semibold leading-[1.15] tracking-tight text-on-inverse">
            {REPORT_TITLE}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-on-inverse-muted">
            Six weighted dimensions, twenty-nine anchored sub-criteria, scored by deterministic
            code. The same information produces the same score every time.
          </p>

          {/* The three accents used once each, as fills, at the size they are
              legible. This is the only decorative moment in the product. */}
          <dl className="mt-9 grid grid-cols-3 gap-3">
            {[
              { k: 'Dimensions', v: '6', fill: 'bg-positive' },
              { k: 'Sub-criteria', v: '29', fill: 'bg-info' },
              { k: 'Scale', v: '0–4', fill: 'bg-warning' },
            ].map((item) => (
              <div key={item.k}>
                <span aria-hidden className={`block h-1 w-8 rounded-full ${item.fill}`} />
                <dd className="tabular mt-2.5 font-serif text-2xl font-semibold text-on-inverse">
                  {item.v}
                </dd>
                <dt className="text-[11px] uppercase tracking-[0.1em] text-on-inverse-muted">
                  {item.k}
                </dt>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-[11px] leading-relaxed text-on-inverse-muted">
          Business assessment only — not investment advice, not a solicitation.
          <br />
          {ORG_NAME} holds no securities licence.
        </p>
      </aside>

      {/* ---------- Form ---------- */}
      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="lg:hidden">
            <span className="font-serif text-lg font-semibold text-ink-strong">{PRODUCT_NAME}</span>
            <span className="ml-2 text-[11px] uppercase tracking-[0.16em] text-ink/55">
              {ORG_NAME}
            </span>
          </div>

          <h1 className="mt-6 font-serif text-[28px] font-semibold tracking-tight text-ink-strong lg:mt-0">
            Sign in
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/70">
            Use your {ORG_NAME} address. A single-use link arrives by email — there is no password
            to remember or leak.
          </p>

          {params.sent && (
            // Deliberately unconditional: shown whether or not the address is
            // allowlisted, so the form cannot be used to discover which are.
            <Notice tone="positive" className="mt-5">
              If that address is permitted, a sign-in link is on its way. It expires shortly and
              works once.
            </Notice>
          )}
          {params.error && (
            <Notice tone="critical" className="mt-5">
              That sign-in link did not work. Links expire and can only be used once — request a
              new one below.
            </Notice>
          )}

          <form action="/auth/magic-link" method="post" className="mt-7 space-y-2.5">
            <label htmlFor="email" className={labelClass}>
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@klawfin.com"
              className={fieldClass}
            />
            {/* Where the guard wanted to send them. Validated server-side. */}
            {params.next && <input type="hidden" name="next" value={params.next} />}
            <button type="submit" className={buttonClass('primary', 'w-full !py-2.5 !text-sm')}>
              Send sign-in link
            </button>
          </form>

          <p className="mt-7 border-t border-line pt-5 text-xs leading-relaxed text-ink/55">
            Access is limited to allowlisted addresses. This tool holds client financial data.
          </p>
        </div>
      </section>
    </main>
  );
}
