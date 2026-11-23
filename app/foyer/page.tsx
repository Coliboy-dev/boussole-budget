'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useHouseholdWorkspace } from '@/components/household/HouseholdWorkspace';
import { HouseholdContributionEditor } from '@/components/household/HouseholdContributions';
import HouseholdSharing from '@/components/household/HouseholdSharing';
import { useHouseholdMovements } from '@/components/household/HouseholdMovementsContext';
import Card from '@/components/ui/Card';
import { useApp } from '@/lib/context/AppContext';
import { formatShortDate } from '@/lib/budget-calculations';
import { isNonNegativeBudgetAmount } from '@/lib/budget-schema';
import { householdCopy, householdMessages } from '@/lib/household-copy';
import { householdEnabled } from '@/lib/household-feature';

const primary = 'inline-flex min-h-11 items-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-teal-700 disabled:opacity-50';

export default function HouseholdPage() {
  const { userId, directory, active, loading, error, create, select } = useHouseholdWorkspace();
  const [busy, setBusy] = useState(false);
  if (!householdEnabled) return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="text-xl font-bold text-slate-900">{householdCopy.household}</h1>
      <p>{householdCopy.comingSoon}</p>
    </div>
  );
  return (
    <div className="space-y-4 px-4 py-4">
      <h1 className="text-xl font-bold text-slate-900">{householdCopy.household}</h1>
      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
      {userId && <FormerHouseholds former={directory.former ?? []} />}
      {!userId ? (
        <Card className="space-y-3">
          <p>{householdCopy.signIn}</p>
          <Link href="/synchronisation" className={primary}>{householdCopy.openAccount}</Link>
        </Card>
      ) : loading ? (
        <p role="status">{householdCopy.loading}</p>
      ) : directory.households.length === 0 ? (
        <Card className="space-y-3">
          <p>{householdCopy.createHelp}</p>
          <button type="button" disabled={busy} className={primary} onClick={() => {
            setBusy(true);
            void create().finally(() => setBusy(false));
          }}>{householdCopy.create}</button>
        </Card>
      ) : (
        <>
          {(!active || directory.households.length > 1) && <Card className="space-y-2">
            {directory.households.length > 1 && <h2 className="font-semibold">{householdCopy.choose}</h2>}
            <div className="flex flex-wrap gap-2">
              {directory.households.map(household => (
                <button key={household.id} type="button" className={primary} onClick={() => { void select(household.id); }}>
                  {directory.households.length === 1 ? householdCopy.open :
                    `${householdCopy.createdOn} ${formatShortDate(household.createdAt.slice(0, 10))}`}
                </button>
              ))}
            </div>
          </Card>}
          {active && (
            <HouseholdOptions key={directory.selected} />
          )}
        </>
      )}
    </div>
  );
}

function HouseholdOptions() {
  const { hasJointAccount, storageBlocked } = useApp();
  const household = useHouseholdMovements();
  return (
    <>
      <Card>
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-900">
          <input type="checkbox" className="size-5 accent-teal-700" checked={hasJointAccount === false}
            disabled={!household || storageBlocked} onChange={(event) => household?.setHasJointAccount(!event.target.checked)} />
          {householdCopy.jointAccountChoice}
        </label>
      </Card>
      {hasJointAccount !== false && <><HouseholdContributionEditor /><HouseholdReserve /></>}
      <Link href="/foyer/mouvements" className={primary}>{householdCopy.movements}</Link>
      <HouseholdSharing />
    </>
  );
}

function HouseholdReserve() {
  const { userProfile, saveProfileSettings } = useApp();
  const [reserve, setReserve] = useState<string>();
  const [error, setError] = useState('');
  const [expected, setExpected] = useState<number>();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = reserve === undefined ? userProfile.safetyReserve : Number(reserve.replace(',', '.'));
    if (reserve?.trim() === '' || !isNonNegativeBudgetAmount(amount)) {
      setError(householdCopy.reserveInvalid);
      return;
    }
    saveProfileSettings({ firstName: '', safetyReserve: amount });
    setError('');
    setReserve(undefined);
    setExpected(amount);
  }

  return <section id="reserve"><Card className="space-y-2">
    <form onSubmit={submit} noValidate className="space-y-2">
      <label htmlFor="household-reserve" className="block text-sm font-semibold">{householdCopy.reserve}</label>
      <div className="flex flex-wrap gap-2">
        <input id="household-reserve" inputMode="decimal" value={reserve ?? userProfile.safetyReserve}
          aria-invalid={!!error} aria-describedby={error ? 'household-reserve-error' : undefined}
          onChange={event => { setReserve(event.target.value); setExpected(undefined); }}
          className="min-h-11 w-32 rounded-xl border border-slate-300 px-3" />
        <button type="submit" className={primary}>{householdCopy.save}</button>
      </div>
      {error && <p id="household-reserve-error" role="alert" className="text-sm text-rose-800">{error}</p>}
      {expected !== undefined && expected === userProfile.safetyReserve &&
        <p role="status" className="text-sm text-teal-800">{householdCopy.reserveSaved}</p>}
    </form>
  </Card></section>;
}

/** Foyers quittés : la synchronisation est arrêtée et la copie chiffrée reste sur l'appareil (consultation en 5b). */
function FormerHouseholds({ former }: { former: { id: string; leftAt: string }[] }) {
  if (former.length === 0) return null;
  return (
    <section aria-label={householdCopy.sharingDisabled} className="space-y-2">
      {former.map(({ id, leftAt }) => (
        <Card key={id} className="space-y-1 text-sm">
          <p role="status" className="font-semibold text-slate-900">{householdCopy.sharingDisabled}</p>
          <p className="text-slate-700">{householdMessages.formerHouseholdSince(formatShortDate(leftAt.slice(0, 10)))}</p>
          <p className="text-slate-700">{householdCopy.localCopyKept}</p>
        </Card>
      ))}
    </section>
  );
}
