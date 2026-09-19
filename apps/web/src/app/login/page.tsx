import { ORG_NAME, PRODUCT_NAME } from '@klawfin/core';

/**
 * Sign-in (P1-01, decision 0001).
 *
 * Magic link only. No password field exists, so there is no password to leak
 * and no reset flow to build. A non-allowlisted address gets the same generic
 * message as a valid one - confirming which addresses exist would be a free
 * gift to anyone probing.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className="text-sm font-semibold text-slate-700">{ORG_NAME}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{PRODUCT_NAME}</h1>
      <p className="mt-4 text-sm text-stone-600">
        Sign in with your Klawfin address. You will receive a link by email.
      </p>

      {params.sent && (
        // Deliberately unconditional: this is shown whether or not the address
        // is allowlisted, so the form cannot be used to discover which are.
        <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
          If that address is permitted, a sign-in link is on its way. It expires shortly and works
          once.
        </p>
      )}
      {params.error && (
        <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-900">
          That sign-in link did not work. Links expire and can only be used once - request a new
          one below.
        </p>
      )}

      <form action="/auth/magic-link" method="post" className="mt-6 space-y-3">
        <label htmlFor="email" className="block text-sm font-medium">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
        />
        {/* Where the guard wanted to send them. Validated server-side. */}
        {params.next && <input type="hidden" name="next" value={params.next} />}
        <button
          type="submit"
          className="w-full rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Send sign-in link
        </button>
      </form>

      <p className="mt-6 text-xs text-stone-500">
        Access is limited to allowlisted addresses. This tool holds client financial data.
      </p>
    </main>
  );
}
