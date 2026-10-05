import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import type { Transaction, ExpenseGroup } from '../../types';

interface SettleModalProps {
  isOpen?: boolean;
  tx: Transaction | null;
  activeGroup?: ExpenseGroup | null;
  onClose: () => void;
  onSave: (refundAmount: number, note: string) => Promise<void>;
}

export function SettleModal({
  isOpen = true,
  tx,
  onClose,
  onSave
}: SettleModalProps) {
  const [refundAmount, setRefundAmount] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (tx && isOpen) {
      setRefundAmount(tx.amount.toString());
      setNote('Settled');
    }
  }, [tx, isOpen]);

  if (!tx || !isOpen) return null;

  const currentRefund = parseFloat(refundAmount) || 0;
  const remaining = Math.max(0, tx.amount - currentRefund);
  const isFull = currentRefund >= tx.amount;
  const halfAmount = Math.round((tx.amount / 2) * 100) / 100;

  const handleSetFull = () => {
    setRefundAmount(tx.amount.toString());
    setNote('Full settlement');
  };

  const handleSetHalf = () => {
    setRefundAmount(halfAmount.toString());
    setNote('50% split settlement');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(refundAmount);
    if (isNaN(num) || num <= 0) return;

    setIsSubmitting(true);
    try {
      const finalNote = note.trim() || 'Settled';
      await onSave(num, finalNote);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overscroll-contain"
      onClick={onClose}
    >
      <div 
        className="bg-surface w-full sm:max-w-md md:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-border overflow-hidden animate-in slide-in-from-bottom duration-200 font-sans flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="pt-2.5 pb-1 sm:hidden flex justify-center shrink-0">
          <div className="w-10 h-1 rounded-full bg-surface-active" />
        </div>

        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              Settle Expense
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              {tx.name} · Original: <span className="font-semibold text-text-primary">₹{tx.amount.toLocaleString('en-IN')}</span>
            </p>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover cursor-pointer transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] space-y-4">
          {/* Amount Box */}
          <div className="p-4 rounded-2xl bg-surface-hover/60 border border-border text-center space-y-2">
            <label className="text-xs font-medium text-text-secondary uppercase tracking-wider block">
              Settlement Amount
            </label>
            
            <div className="inline-flex items-center justify-center">
              <span className="text-2xl font-light text-text-secondary mr-1">₹</span>
              <input
                required
                type="number"
                step="0.01"
                min="0.01"
                max={tx.amount}
                autoFocus
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="w-36 text-center text-3xl font-bold tracking-tight bg-transparent outline-none text-text-primary"
              />
            </div>

            {/* Quick 1-Tap Presets */}
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSetFull}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer select-none ${
                  isFull
                    ? 'bg-google-blue text-white shadow-xs'
                    : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                Full: ₹{tx.amount.toLocaleString('en-IN')}
              </button>

              <button
                type="button"
                onClick={handleSetHalf}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer select-none ${
                  currentRefund === halfAmount
                    ? 'bg-google-blue text-white shadow-xs'
                    : 'bg-surface border border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                Half (50%): ₹{halfAmount.toLocaleString('en-IN')}
              </button>
            </div>
          </div>

          {/* Note Input */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">
              Note / Reference (Optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Paid via UPI, Cash, or Rohit paid half"
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-hover/50 border border-border text-xs sm:text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-google-blue transition-all"
            />
          </div>

          {/* Live Outcome Summary */}
          <div className="px-3.5 py-2.5 rounded-xl bg-surface border border-border flex items-center justify-between text-xs">
            <span className="text-text-secondary">Ledger Balance After:</span>
            {isFull ? (
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <Check size={14} />
                <span>Fully Settled (₹0)</span>
              </span>
            ) : (
              <span className="font-semibold text-text-primary">
                ₹{remaining.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} remaining
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors cursor-pointer text-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || currentRefund <= 0}
              className="flex-1 py-2.5 rounded-xl bg-google-blue hover:bg-google-blue-hover text-white text-xs font-medium transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Check size={14} />
              <span>{isSubmitting ? 'Saving...' : 'Confirm Settle'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
