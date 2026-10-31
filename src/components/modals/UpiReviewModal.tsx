import React, { useState, useEffect } from 'react';
import { X, Check, Edit2, AlertCircle, ShieldCheck, Trash2 } from 'lucide-react';
import { formatUpiId, isValidUpiId } from '../../utils/upiUtils';

interface UpiReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingUpi: string;
  groupName: string;
  addedByName?: string;
  onConfirm: (confirmedUpi: string) => Promise<void>;
  onRemove: () => Promise<void>;
}

export function UpiReviewModal({
  isOpen,
  onClose,
  pendingUpi,
  groupName,
  addedByName,
  onConfirm,
  onRemove
}: UpiReviewModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedUpi, setEditedUpi] = useState(pendingUpi);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEditedUpi(pendingUpi);
      setIsEditing(false);
      setErrorNotice(null);
    }
  }, [isOpen, pendingUpi]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !pendingUpi) return null;

  const cleanFormatted = formatUpiId(isEditing ? editedUpi : pendingUpi);
  const isEditedValid = isValidUpiId(editedUpi);

  const handleConfirmKeep = async () => {
    setIsSubmitting(true);
    setErrorNotice(null);
    try {
      await onConfirm(formatUpiId(pendingUpi));
      onClose();
    } catch (err: any) {
      setErrorNotice(err?.message || 'Could not save UPI ID. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdited = async () => {
    if (!isEditedValid) {
      setErrorNotice('Please enter a valid UPI ID (e.g. name@oksbi, mobile@paytm).');
      return;
    }
    setIsSubmitting(true);
    setErrorNotice(null);
    try {
      await onConfirm(cleanFormatted);
      onClose();
    } catch (err: any) {
      setErrorNotice(err?.message || 'Could not save updated UPI ID.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async () => {
    setIsSubmitting(true);
    setErrorNotice(null);
    try {
      await onRemove();
      onClose();
    } catch (err: any) {
      setErrorNotice(err?.message || 'Could not remove UPI ID.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overscroll-contain animate-in fade-in duration-200 font-sans"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface text-text-primary w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] animate-in slide-in-from-bottom duration-250"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Grab Handle */}
        <div className="pt-2.5 pb-1 sm:hidden flex justify-center shrink-0">
          <div className="w-10 h-1 rounded-full bg-surface-active" />
        </div>

        {/* Header */}
        <div className="px-5 pt-3 sm:pt-5 pb-3 flex items-center justify-between border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-google-blue/10 text-google-blue flex items-center justify-center shrink-0">
              <ShieldCheck size={19} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                Review Your UPI ID
              </h3>
              <p className="text-xs text-text-secondary truncate max-w-[220px] sm:max-w-xs">
                Added for settlements in {groupName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-surface-hover flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {errorNotice && (
            <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-google-red flex items-start gap-2">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{errorNotice}</span>
            </div>
          )}

          <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
            <strong className="text-text-primary font-semibold">
              {addedByName || 'A group member'}
            </strong>{' '}
            added the following UPI ID to your profile so friends can easily settle debts with you via Google Pay, PhonePe, or Paytm:
          </p>

          {/* UPI ID Display or Edit Box */}
          {!isEditing ? (
            <div className="p-4 rounded-2xl bg-surface-hover/70 border border-border space-y-2">
              <div className="flex items-center justify-between text-xs text-text-secondary">
                <span className="font-semibold uppercase tracking-wider text-[10px]">
                  Assigned UPI ID
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  Needs your confirmation
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="font-mono text-sm sm:text-base font-bold text-text-primary tracking-tight truncate">
                  {pendingUpi}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(true);
                    setEditedUpi(pendingUpi);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-surface border border-border text-xs font-semibold text-google-blue hover:bg-google-blue/10 flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                >
                  <Edit2 size={12} />
                  <span>Edit</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-surface-hover/70 border border-border space-y-3">
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Enter Your Correct UPI ID / VPA
              </label>
              <input
                type="text"
                autoFocus
                value={editedUpi}
                onChange={(e) => setEditedUpi(e.target.value)}
                placeholder="e.g. name@oksbi, mobile@paytm"
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border text-sm text-text-primary font-mono outline-none focus:border-google-blue"
              />
              {editedUpi.trim() && (
                <div className="text-xs flex items-center gap-1.5 font-medium">
                  {isEditedValid ? (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <Check size={13} strokeWidth={2.5} />
                      Valid: <strong className="font-mono">{cleanFormatted}</strong>
                    </span>
                  ) : (
                    <span className="text-google-red">
                      Format must be: username@bank
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="text-xs text-text-secondary leading-relaxed bg-surface-hover/40 p-3 rounded-2xl border border-border/50">
            Confirming this will save it as your verified receiving account for all group settlements and QR codes. You can always change it anytime in <strong>Settings</strong>.
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-border/60 space-y-2 shrink-0">
          {!isEditing ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={handleConfirmKeep}
                disabled={isSubmitting}
                className="flex-1 h-11 bg-google-blue hover:bg-blue-700 disabled:opacity-50 text-white rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs active:scale-[0.98]"
              >
                <Check size={16} />
                <span>Confirm & Keep This UPI</span>
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                disabled={isSubmitting}
                className="h-11 px-4 border border-border hover:bg-surface-hover text-text-primary rounded-full text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                Change / Edit
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={isSubmitting}
                className="flex-1 h-11 border border-border hover:bg-surface-hover text-text-primary rounded-full text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdited}
                disabled={isSubmitting || !isEditedValid}
                className="flex-1 h-11 bg-google-blue hover:bg-blue-700 disabled:opacity-50 text-white rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs active:scale-[0.98]"
              >
                <Check size={16} />
                <span>Save Correct UPI</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleRemove}
            disabled={isSubmitting}
            className="w-full text-center py-1 text-xs text-text-secondary hover:text-google-red transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Trash2 size={12} />
            <span>Remove UPI (I prefer settling via cash)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
