'use client';

/**
 * Archive, deletion request, and execution (P1-11, PRD 10.6).
 *
 * The three actions are deliberately not equal in weight on screen:
 *
 *   Archive           one click. Reversible. The ordinary end of an engagement.
 *   Request deletion  behind a disclosure, needs a written reason.
 *   Execute deletion  owner only, needs the client's name typed back.
 *
 * Typing the name is not security - the server checks the role and the request
 * row. It is friction placed exactly where an irreversible act happens, so
 * that destroying a paying client's file cannot be something someone did while
 * meaning to click Archive.
 */

import { useState } from 'react';

import {
  archiveClientAction,
  executeDeletionAction,
  requestClientDeletionAction,
} from '../../actions';

export interface DeletionRequestSummary {
  id: string;
  status: string;
  requestedBy: string;
  createdAt: string;
  executedAt: string | null;
}

interface Props {
  clientId: string;
  clientName: string;
  archivedAt: string | null;
  isOwner: boolean;
  requests: DeletionRequestSummary[];
}

export function ClientLifecycle({
  clientId,
  clientName,
  archivedAt,
  isOwner,
  requests,
}: Props) {
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const open = requests.find((r) => r.status === 'requested' || r.status === 'approved');
  const executed = requests.find((r) => r.status === 'executed');

  if (executed) {
    return (
      <section className="rounded-lg border border-stone-300 bg-stone-50 p-4 text-sm">
        <h2 className="font-medium">Deleted</h2>
        <p className="mt-2 text-stone-600">
          This client&apos;s data was deleted on {executed.executedAt?.slice(0, 10)}. The request
          record remains as evidence that it was actioned.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
      <h2 className="font-medium">Record</h2>

      {message && (
        <p
          className={`mt-3 rounded p-2 text-xs ${
            message.tone === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {archivedAt ? (
          <span className="text-xs text-stone-500">Archived {archivedAt.slice(0, 10)}</span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const result = await archiveClientAction(clientId);
              setMessage(
                result.ok
                  ? { tone: 'ok', text: 'Archived. Nothing was deleted.' }
                  : { tone: 'error', text: result.error },
              );
              setBusy(false);
            }}
            className="rounded border border-stone-300 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            Archive
          </button>
        )}
      </div>

      {!open && (
        <DeletionRequest
          clientId={clientId}
          onDone={(text, tone) => setMessage({ tone, text })}
        />
      )}

      {open && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 p-3">
          <p className="text-xs font-medium text-red-900">
            Deletion requested {open.createdAt.slice(0, 10)} ({open.requestedBy.replace('_', ' ')})
          </p>
          {isOwner ? (
            <ExecuteDeletion
              requestId={open.id}
              clientName={clientName}
              onDone={(text, tone) => setMessage({ tone, text })}
            />
          ) : (
            <p className="mt-2 text-xs text-red-900">
              Only the account owner can execute this.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function DeletionRequest({
  clientId,
  onDone,
}: {
  clientId: string;
  onDone: (text: string, tone: 'ok' | 'error') => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [requestedBy, setRequestedBy] = useState<'data_principal' | 'klawfin_internal'>(
    'data_principal',
  );
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 text-xs text-stone-500 underline underline-offset-2"
      >
        Record a deletion request
      </button>
    );
  }

  return (
    <div className="mt-4 space-y-2 rounded border border-stone-200 p-3">
      <p className="text-xs text-stone-600">
        Recording a request does not delete anything. It is the record that one was made, which is
        what the statutory clock runs on.
      </p>
      <select
        value={requestedBy}
        onChange={(e) => setRequestedBy(e.target.value as typeof requestedBy)}
        className="w-full rounded border border-stone-300 p-1.5 text-xs"
      >
        <option value="data_principal">Requested by the client</option>
        <option value="klawfin_internal">Internal decision</option>
      </select>
      <textarea
        rows={2}
        value={reason}
        placeholder="What was asked for, and by whom?"
        onChange={(e) => setReason(e.target.value)}
        className="w-full rounded border border-stone-300 p-1.5 text-xs"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || reason.trim().length < 10}
          onClick={async () => {
            setBusy(true);
            const result = await requestClientDeletionAction(clientId, {
              requestedBy,
              reason,
            });
            if (result.ok) {
              setOpen(false);
              onDone('Deletion request recorded. Nothing has been deleted yet.', 'ok');
            } else {
              onDone(result.error, 'error');
            }
            setBusy(false);
          }}
          className="rounded bg-stone-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          {busy ? 'Recording...' : 'Record request'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-stone-300 px-2 py-1 text-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ExecuteDeletion({
  requestId,
  clientName,
  onDone,
}: {
  requestId: string;
  clientName: string;
  onDone: (text: string, tone: 'ok' | 'error') => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-red-900">
        This permanently deletes the client record, every assessment, every narrative and every
        stored report PDF. It cannot be undone. Type the client&apos;s name to confirm.
      </p>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={clientName}
        className="w-full rounded border border-red-300 p-1.5 text-xs"
      />
      <button
        type="button"
        disabled={busy || typed.trim() !== clientName}
        onClick={async () => {
          setBusy(true);
          const result = await executeDeletionAction(requestId);
          if (result.ok) {
            // Orphaned files mean the deletion is INCOMPLETE. Say so loudly
            // rather than reporting success - somebody has to go and finish it.
            onDone(
              result.data.orphanedPaths.length > 0
                ? `${result.data.message} Paths: ${result.data.orphanedPaths.join(', ')}`
                : result.data.message,
              result.data.orphanedPaths.length > 0 ? 'error' : 'ok',
            );
          } else {
            onDone(result.error, 'error');
          }
          setBusy(false);
        }}
        className="rounded bg-red-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
      >
        {busy ? 'Deleting...' : 'Delete permanently'}
      </button>
    </div>
  );
}
