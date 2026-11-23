'use client';

import { useState } from 'react';
import { useHouseholdWorkspace } from '@/components/household/HouseholdWorkspace';
import { useHouseholdMovements } from '@/components/household/HouseholdMovementsContext';
import Card from '@/components/ui/Card';
import { householdCopy, householdMessages } from '@/lib/household-copy';
import { createInvitation, revokeInvitation } from '@/lib/household-remote';

const primary = 'inline-flex min-h-11 items-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-teal-700 disabled:opacity-50';
const secondary = 'inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 disabled:opacity-50';
const danger = 'inline-flex min-h-11 items-center rounded-xl border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-800 disabled:opacity-50';

/** Textes exacts de la charte (§2.3) : ils décrivent l'effet sur les accès, rien de plus. */
function AccessEffects({ leaving }: { leaving: boolean }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
      <li>{householdCopy.noLongerShared}</li>
      <li>{householdCopy.personalStaysPrivate}</li>
      <li>{householdCopy.formerMemberMayKeep}</li>
      {leaving && <li>{householdCopy.localCopyKept}</li>}
    </ul>
  );
}

export default function HouseholdSharing() {
  const { userId, directory, memberId, leave, stopSharing } = useHouseholdWorkspace();
  const movements = useHouseholdMovements();
  const householdId = directory.selected;
  const membership = directory.households.find(({ id }) => id === householdId);
  const partnerId = membership?.activeMemberIds?.find((id) => id !== memberId);
  const partnerName = partnerId ? movements?.memberName(partnerId) ?? householdCopy.otherMember : '';
  const [invitation, setInvitation] = useState<{ id: string; link: string }>();
  const [confirm, setConfirm] = useState<'leave' | 'stop'>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  if (!userId || !householdId) return null;

  async function run(action: () => Promise<void>, done = '') {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await action();
      setStatus(done);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : householdCopy.unavailable);
    } finally {
      setBusy(false);
    }
  }

  async function share(link: string) {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: householdCopy.invite, url: link });
        return;
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
      }
    }
    await navigator.clipboard.writeText(link);
    setStatus(householdCopy.inviteCopied);
  }

  return (
    <section aria-labelledby="household-members" className="space-y-3">
      <h2 id="household-members" className="text-base font-semibold text-slate-900">{householdCopy.members}</h2>
      <Card className="space-y-3">
        {partnerId ? (
          <p className="text-sm text-slate-900">{householdMessages.sharedWith(partnerName)}</p>
        ) : (
          <>
            <p className="text-sm text-slate-900">{householdCopy.aloneMember}</p>
            <p className="text-sm text-slate-700">{householdCopy.inviteHelp}</p>
            {invitation ? (
              <div className="space-y-2">
                <label htmlFor="household-invitation-link" className="block text-sm font-semibold">{householdCopy.inviteLink}</label>
                <input id="household-invitation-link" readOnly value={invitation.link} onFocus={(event) => event.target.select()}
                  className="min-h-11 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm" />
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={primary} disabled={busy}
                    onClick={() => { void run(() => share(invitation.link)); }}>{householdCopy.inviteShare}</button>
                  <button type="button" className={secondary} disabled={busy}
                    onClick={() => { void run(async () => { await navigator.clipboard.writeText(invitation.link); }, householdCopy.inviteCopied); }}>
                    {householdCopy.inviteCopy}
                  </button>
                  <button type="button" className={danger} disabled={busy}
                    onClick={() => { void run(async () => {
                      await revokeInvitation(userId, householdId, invitation.id);
                      setInvitation(undefined);
                    }, householdCopy.inviteRevoked); }}>
                    {householdCopy.inviteRevoke}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className={primary} disabled={busy}
                onClick={() => { void run(async () => setInvitation(await createInvitation(userId, householdId, window.location.origin))); }}>
                {householdCopy.inviteCreate}
              </button>
            )}
          </>
        )}
      </Card>

      <Card className="space-y-3">
        {confirm ? (
          <div className="space-y-3" role="group" aria-labelledby="household-access-question">
            <p id="household-access-question" className="text-sm font-semibold text-slate-900">
              {confirm === 'leave' ? householdCopy.leave : householdMessages.stopSharingWith(partnerName)}
            </p>
            <AccessEffects leaving={confirm === 'leave'} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={danger} disabled={busy} onClick={() => {
                void run(async () => {
                  if (confirm === 'leave') await leave();
                  else if (partnerId) await stopSharing(partnerId);
                  setConfirm(undefined);
                }, householdCopy.sharingDisabled);
              }}>
                {confirm === 'leave' ? householdCopy.leaveConfirm : householdCopy.stopSharingConfirm}
              </button>
              <button type="button" className={secondary} disabled={busy} onClick={() => setConfirm(undefined)}>{householdCopy.cancel}</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {partnerId && (
              <button type="button" className={danger} onClick={() => { setStatus(''); setConfirm('stop'); }}>
                {householdMessages.stopSharingWith(partnerName)}
              </button>
            )}
            <button type="button" className={danger} onClick={() => { setStatus(''); setConfirm('leave'); }}>{householdCopy.leave}</button>
          </div>
        )}
      </Card>
      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
      {status && <p role="status" className="text-sm text-teal-800">{status}</p>}
    </section>
  );
}
