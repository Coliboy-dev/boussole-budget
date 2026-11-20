'use client';

import { useState, type ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { Icon } from '@/components/ui/icons';

export interface CompactRow {
  id: string;
  title: string;
  icon: LucideIcon;
  /** Couleur de la pastille d’icône. */
  tone?: 'teal' | 'green' | 'amber' | 'neutral';
  badges?: ReactNode;
  meta?: ReactNode;
  amount: ReactNode;
  amountNote?: ReactNode;
  /** Élément affiché sous la ligne, par exemple une barre de progression. */
  footer?: ReactNode;
}

const tones = {
  teal: 'bg-teal-50 text-teal-800',
  green: 'bg-green-50 text-green-800',
  amber: 'bg-amber-50 text-amber-800',
  neutral: 'bg-slate-100 text-slate-700',
};

/** Liste compacte : une ligne par élément, un appui ouvre le détail. */
export function CompactRows({ rows, onOpen }: { rows: CompactRow[]; onOpen: (id: string) => void }) {
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-line bg-white">
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            onClick={() => onOpen(row.id)}
            className={`flex w-full items-start gap-3 px-4 py-3 text-left focus-visible:-outline-offset-2
              ${row.tone === 'neutral' ? 'bg-slate-50 hover:bg-slate-100' : 'hover:bg-slate-50'}`}
          >
            <span className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${tones[row.tone ?? 'teal']}`}>
              <Icon icon={row.icon} className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="wrap-break-word text-sm font-semibold text-slate-900">{row.title}</span>
                {row.badges}
              </span>
              {row.meta && <span className="mt-0.5 block text-xs text-slate-600">{row.meta}</span>}
              {row.footer && <span className="mt-2 block">{row.footer}</span>}
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-sm font-bold tabular-nums text-slate-900">{row.amount}</span>
              {row.amountNote && <span className="block text-xs text-slate-600">{row.amountNote}</span>}
            </span>
            <Icon icon={ChevronRight} className="mt-2 size-4 shrink-0 text-slate-400" />
          </button>
        </li>
      ))}
    </ul>
  );
}

interface DetailSheetProps {
  title: string;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
  children: ReactNode;
}

/** Détail d’un élément : informations, paiement, modification et suppression confirmée. */
export function DetailSheet({ title, onClose, onEdit, onDelete, deleteLabel = 'Supprimer cet élément ?', children }: DetailSheetProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        {children}
        {(onEdit || onDelete) && (
          <div className="space-y-2 border-t border-slate-100 pt-4">
            {!confirmDelete ? (
              <div className="flex flex-wrap gap-2">
                {onEdit && (
                  <button type="button" onClick={onEdit}
                    className="rounded-xl border border-teal-700 px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50">
                    Modifier
                  </button>
                )}
                {onDelete && (
                  <button type="button" onClick={() => setConfirmDelete(true)}
                    className="rounded-xl px-4 text-sm font-semibold text-red-800 underline hover:bg-red-50">
                    Supprimer
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-900">{deleteLabel}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={onDelete}
                    className="rounded-xl bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800">
                    Supprimer
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)}
                    className="rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800">
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Ligne « libellé : valeur » du détail. */
export function DetailFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-slate-600">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{children}</dd>
    </div>
  );
}
