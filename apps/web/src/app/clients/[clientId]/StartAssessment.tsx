'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { createAssessmentAction } from '../../actions';

export function StartAssessment({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await createAssessmentAction(clientId);
          if (result.ok) router.push(`/assessments/${result.data.assessmentId}`);
        })
      }
      className="rounded-control bg-inverse px-3 py-2 text-sm font-medium text-on-inverse disabled:opacity-50"
    >
      {pending ? 'Starting…' : 'Start assessment'}
    </button>
  );
}
