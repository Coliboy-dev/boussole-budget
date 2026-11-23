'use client';

import Modal from '@/components/ui/Modal';
import { formatCurrency, formatShortDate } from '@/lib/budget-calculations';

/**
 * « Payé » sur une échéance due au plus tard le jour du solde recopié : le débit y figure peut-être déjà.
 * On le demande plutôt que de le déduire une deuxième fois (audit B01). Même question pour un virement d'épargne (C01).
 */
export default function PaymentBalanceQuestion({ label, amount, balanceDate, onAnswer, onClose, subject = 'ce paiement' }: {
  label: string;
  /** « ce paiement » (charge, mensualité) ou « ce virement » (mise de côté vers un compte à part). */
  subject?: string;
  amount?: number;
  balanceDate: string;
  onAnswer: (balanceIncludesPayment: boolean) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Déjà passé sur ton compte ?" onClose={onClose}>
      <p className="text-sm text-gray-800">
        Ton solde du <time dateTime={balanceDate}>{formatShortDate(balanceDate)}</time> comprend-il déjà {subject} :{' '}
        <strong>{label}</strong>{amount !== undefined && <>, <span className="tabular-nums">{formatCurrency(Math.abs(amount))}</span></>} ?
      </p>
      <div className="mt-4 grid gap-2">
        <button type="button" onClick={() => onAnswer(true)}
          className="min-h-11 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800">
          Oui, déjà débité
        </button>
        <p className="-mt-1 text-xs text-gray-600">Marqué payé, ton solde ne change pas.</p>
        <button type="button" onClick={() => onAnswer(false)}
          className="min-h-11 rounded-xl border border-teal-200 bg-white px-4 text-sm font-semibold text-teal-800 hover:bg-teal-50">
          Non, déduis-le
        </button>
        <p className="-mt-1 text-xs text-gray-600">Le montant est retiré de ton solde.</p>
      </div>
    </Modal>
  );
}
