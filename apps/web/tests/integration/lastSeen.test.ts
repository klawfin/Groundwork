/**
 * Recording your own sign-in must work for every role, and must not do more.
 *
 * THE DEFECT THIS PINS, found by signing in as all three roles side by side:
 *
 * `app_users` has one write policy, `app_users_owner_write`, and it is FOR ALL
 * requiring `owner`. The auth callback stamped `last_seen_at` with a direct
 * update, so it worked for the owner and did nothing for anyone else -
 * `last_seen_at` was frozen at first login for every analyst and viewer, since
 * only the SECURITY DEFINER signup trigger had ever been able to set it.
 *
 * WHAT MADE IT INVISIBLE, and the reason this test is here rather than a unit
 * test: on UPDATE an RLS `USING` clause FILTERS ROWS, it does not raise. The
 * database reports `UPDATE 0`, PostgREST returns success, and `writeGuard.ts`
 * - written specifically to catch discarded write failures - inspects `error`
 * and finds none. A guard against silent writes could not see this silent
 * write. Only a real database can tell you that.
 *
 * It matters because docs/PRODUCTION.md schedules a monthly access review
 * against `last_seen_at`, and the column would have been stale for exactly the
 * accounts most likely to be revoked.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createUser, deleteUser, serviceClient, stackIsUp, type TestUser } from './harness';

const up = await stackIsUp();
const describeIf = up ? describe : describe.skip;

describeIf('last_seen_at', () => {
  let viewer: TestUser;
  let analyst: TestUser;

  beforeAll(async () => {
    viewer = await createUser('viewer');
    analyst = await createUser('analyst');
  });

  afterAll(async () => {
    await deleteUser(viewer).catch(() => undefined);
    await deleteUser(analyst).catch(() => undefined);
  });

  async function storedLastSeen(id: string): Promise<string | null> {
    const { data } = await serviceClient()
      .from('app_users')
      .select('last_seen_at')
      .eq('id', id)
      .single();
    return data?.last_seen_at ?? null;
  }

  it('a direct update by a non-owner changes nothing AND reports no error', async () => {
    // The exact shape of the original bug. If this ever starts returning an
    // error, the guard in writeGuard.ts would have caught it and the RPC could
    // be reconsidered - but today it does not, and that is the whole point.
    const before = await storedLastSeen(viewer.id);

    const { error } = await viewer.db
      .from('app_users')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', viewer.id);

    expect(error).toBeNull();
    expect(await storedLastSeen(viewer.id)).toBe(before);
  });

  it('lets a viewer stamp their own sign-in through the function', async () => {
    const before = await storedLastSeen(viewer.id);
    await serviceClient()
      .from('app_users')
      .update({ last_seen_at: '2020-01-01T00:00:00Z' })
      .eq('id', viewer.id);

    const { error } = await viewer.db.rpc('touch_last_seen');
    expect(error).toBeNull();

    const after = await storedLastSeen(viewer.id);
    expect(after).not.toBe('2020-01-01T00:00:00+00:00');
    expect(new Date(after!).getTime()).toBeGreaterThan(new Date('2020-01-02').getTime());
    expect(before).not.toBeNull();
  });

  it('works for an analyst too', async () => {
    await serviceClient()
      .from('app_users')
      .update({ last_seen_at: '2020-01-01T00:00:00Z' })
      .eq('id', analyst.id);

    const { error } = await analyst.db.rpc('touch_last_seen');
    expect(error).toBeNull();
    expect(new Date((await storedLastSeen(analyst.id))!).getTime()).toBeGreaterThan(
      new Date('2020-01-02').getTime(),
    );
  });

  it('cannot be used to touch somebody else', async () => {
    // The function takes no arguments, deliberately. An id parameter would
    // turn "record my sign-in" into "write to any row in app_users".
    await serviceClient()
      .from('app_users')
      .update({ last_seen_at: '2020-01-01T00:00:00Z' })
      .eq('id', analyst.id);

    await viewer.db.rpc('touch_last_seen');

    expect(await storedLastSeen(analyst.id)).toBe('2020-01-01T00:00:00+00:00');
  });

  it('still refuses to let a viewer promote themselves', async () => {
    // Why this is a function and not a self-update policy: RLS grants a ROW,
    // not a COLUMN, so `using (id = auth.uid())` would have handed every
    // viewer the ability to set their own role to owner.
    await viewer.db.from('app_users').update({ role: 'owner' }).eq('id', viewer.id);

    const { data } = await serviceClient()
      .from('app_users')
      .select('role')
      .eq('id', viewer.id)
      .single();
    expect(data?.role).toBe('viewer');
  });
});
