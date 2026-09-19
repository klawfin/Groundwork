'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { createClientAction } from '../actions';

/**
 * Create a client (P1-02).
 *
 * Duplicate names WARN and require confirmation; they never block. Two
 * portfolio companies can legitimately share a name, and a hard block would
 * make the tool wrong rather than careful.
 */
export function NewClientForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(form: FormData, confirmDuplicate: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await createClientAction({
        legalName: form.get('legalName'),
        primaryContactName: form.get('primaryContactName'),
        primaryContactEmail: form.get('primaryContactEmail'),
        sector: form.get('sector') || null,
        stage: form.get('stage') || null,
        confirmDuplicate,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data.duplicateWarning) {
        setDuplicate(result.data.duplicateWarning);
        return;
      }
      setDuplicate(null);
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-control bg-inverse px-3 py-2 text-sm font-medium text-on-inverse hover:bg-inverse"
      >
        New client
      </button>
    );
  }

  return (
    <form
      className="space-y-3 rounded-card border border-line bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(new FormData(e.currentTarget), false);
      }}
    >
      <Field name="legalName" label="Legal or trading name" required />
      <div className="grid grid-cols-2 gap-3">
        <Field name="primaryContactName" label="Primary contact" required />
        <Field name="primaryContactEmail" label="Contact email" type="email" required />
        <Field name="sector" label="Sector" />
        <Field name="stage" label="Stage" />
      </div>

      {error && <p className="rounded bg-critical p-2 text-sm text-on-inverse">{error}</p>}

      {duplicate && (
        <div className="rounded bg-warning p-2 text-sm text-ink">
          <p>{duplicate}</p>
          <button
            type="button"
            className="mt-2 rounded-control bg-warning px-2.5 py-1 text-xs font-medium text-ink"
            onClick={(e) => {
              const form = e.currentTarget.closest('form');
              if (form) submit(new FormData(form), true);
            }}
          >
            Create anyway
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-inverse px-3 py-2 text-sm font-medium text-on-inverse disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create client'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-control border border-line-strong px-3 py-2 text-sm"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-ink/55">
        No client data may be entered before the engagement letter is signed.
      </p>
    </form>
  );
}

function Field({
  name,
  label,
  type = 'text',
  required = false,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        className="mt-1 w-full rounded border border-line-strong px-2 py-1.5 text-sm"
      />
    </label>
  );
}
