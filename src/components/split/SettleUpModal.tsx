import React, { useState, useEffect, useMemo } from 'react';
import { X, Check, ArrowRight, IndianRupee, AlertCircle } from 'lucide-react';
import type { ExpenseGroup, UserRole } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { amountToIndianWords } from '../../utils/indianCurrencyWords';
import { getGroupMembersList, recordSettlementPayment } from '../../services/splitService';

interface SettleUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: ExpenseGroup;
  userRole: UserRole;
  initialDebtorKey?: string;
  initialCreditorKey?: string;
  initialAmount?: number;
  onPaymentRecorded: () => void;
}

export function SettleUpModal({
  isOpen,
  onClose,
  group,
  userRole,
  initialDebtorKey,
  initialCreditorKey,
  initialAmount,
  onPaymentRecorded
}: SettleUpModalProps) {
  const { user } = useAuth();

  const members = useMemo(() => {
    return getGroupMembersList(group, user?.uid, user?.email || undefined);
  }, [group, user]);

  const [fromKey, setFromKey] = useState('');
  const [toKey, setToKey] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('Settled via UPI / Cash');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorNotice(null);
      const defaultPayer = initialDebtorKey || members[0]?.key || '';
      const defaultReceiver = initialCreditorKey || members[1]?.key || members[0]?.key || '';
      setFromKey(defaultPayer);
      setToKey(defaultReceiver);
      setAmount(initialAmount && initialAmount > 0 ? initialAmount.toString() : '');
      setDate(new Date().toISOString().split('T')[0]);
      setNote('Settled via UPI / Cash');
    }
  }, [isOpen, initialDebtorKey, initialCreditorKey, initialAmount, members]);

  const numAmount = parseFloat(amount) || 0;
  const amountInWords = useMemo(() => amountToIndianWords(amount), [amount]);

  const fromMember = members.find(m => m.key === fromKey);
  const toMember = members.find(m => m.key === toKey);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole === 'viewer') return;

    if (!fromKey || !toKey) {
      setErrorNotice('Please select both payer and recipient.');
      return;
    }

    if (fromKey === toKey) {
      setErrorNotice('Payer and recipient cannot be the same person.');
      return;
    }

    if (numAmount <= 0) {
      setErrorNotice('Please enter a valid amount greater than zero.');
      return;
    }

    setIsSubmitting(true);
    setErrorNotice(null);

    try {
      await recordSettlementPayment(
        group.id,
        { key: fromKey, name: fromMember?.name || 'Member' },
        { key: toKey, name: toMember?.name || 'Member' },
        numAmount,
        date,
        note.trim(),
        user
      );
      onPaymentRecorded();
      onClose();
    } catch (err: any) {
      setErrorNotice(err?.message || 'Could not record settlement payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overscroll-contain animate-in fade-in duration-200 font-sans"
      onClick={onClose}
    >
      <div 
        className="bg-surface w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl border border-border overflow-hidden animate-in slide-in-from-bottom duration-200 flex flex-col max-h-[90dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Grab Handle */}
        <div className="pt-2.5 pb-1 sm:hidden flex justify-center shrink-0">
          <div className="w-10 h-1 rounded-full bg-surface-active" />
        </div>

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-text-primary block leading-tight">
              Record Settlement Payment
            </span>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover cursor-pointer transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {errorNotice && (
          <div className="mx-4 mt-3 py-2 px-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-google-red text-xs font-medium flex items-center gap-2 shrink-0 animate-in fade-in duration-150">
            <AlertCircle size={14} className="shrink-0" />
            <span className="leading-snug">{errorNotice}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto no-scrollbar space-y-4 flex-1">
          {/* Big Amount Input */}
          <div className="py-2 text-center bg-surface-hover/30 rounded-2xl border border-border/60 p-3">
            <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">
              Settlement Amount
            </label>
            <div className="inline-flex items-center justify-center">
              <span className="text-2xl font-light text-text-secondary mr-1">₹</span>
              <input
                required
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                autoFocus
                value={amount}
                disabled={userRole === 'viewer'}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-48 text-center text-4xl font-semibold tracking-tight bg-transparent outline-none text-text-primary placeholder:text-text-secondary/40"
              />
            </div>
            {amountInWords ? (
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mt-1 select-none">
                {amountInWords}
              </p>
            ) : null}
          </div>

          {/* Direction Visualization: A paid B */}
          <div className="p-3 rounded-2xl bg-surface border border-border space-y-2">
            <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2">
              <div>
                <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">
                  Payer (Paid)
                </label>
                <select
                  value={fromKey}
                  onChange={(e) => setFromKey(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl bg-surface-hover border border-border text-xs sm:text-sm font-semibold text-text-primary outline-none focus:border-google-blue cursor-pointer truncate"
                >
                  {members.map(m => (
                    <option key={m.key} value={m.key}>
                      {m.isCurrentUser ? 'You' : m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-center pt-4 text-text-secondary">
                <ArrowRight size={16} />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block mb-1">
                  Recipient (Received)
                </label>
                <select
                  value={toKey}
                  onChange={(e) => setToKey(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl bg-surface-hover border border-border text-xs sm:text-sm font-semibold text-text-primary outline-none focus:border-google-blue cursor-pointer truncate"
                >
                  {members.map(m => (
                    <option key={m.key} value={m.key}>
                      {m.isCurrentUser ? 'You' : m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Date & Note */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                Date
              </label>
              <input
                required
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs sm:text-sm text-text-primary outline-none focus:border-google-blue"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
                Payment Mode / Note
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="UPI, Cash, Google Pay..."
                className="w-full px-3 py-2 rounded-xl bg-surface border border-border text-xs sm:text-sm text-text-primary outline-none focus:border-google-blue"
              />
            </div>
          </div>

          {/* CTA */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || numAmount <= 0 || fromKey === toKey}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-full text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
            >
              <Check size={16} />
              <span>{isSubmitting ? 'Recording...' : `Record ₹${numAmount || 0} Payment`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
