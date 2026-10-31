import React, { useState, useEffect } from 'react';
import { 
  User as UserIcon, 
  Smartphone, 
  Check, 
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { formatUpiId, isValidUpiId, getSavedPersonalUpi } from '../../utils/upiUtils';

interface ProfileSetupModalProps {
  isOpen: boolean;
  user: User | null;
  onComplete: (displayName: string, upiId: string) => Promise<void> | void;
}

const COMMON_HANDLES = ['@oksbi', '@okhdfcbank', '@okicici', '@paytm', '@ybl', '@okaxis'];

export function ProfileSetupModal({
  isOpen,
  user,
  onComplete
}: ProfileSetupModalProps) {
  const [fullName, setFullName] = useState('');
  const [upiId, setUpiId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen && user) {
      const initialName = user.displayName || (user.email ? user.email.split('@')[0] : '');
      setFullName(initialName);
      setUpiId(getSavedPersonalUpi() || '');
      setErrorMsg('');
    }
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const handleApplyHandle = (handle: string) => {
    const cleanHandle = handle.startsWith('@') ? handle : `@${handle}`;
    const trimmed = upiId.trim();
    if (!trimmed) {
      const username = (fullName || user.email?.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9]/g, '');
      setUpiId(`${username}${cleanHandle}`);
      return;
    }

    if (trimmed.includes('@')) {
      const prefix = trimmed.split('@')[0];
      setUpiId(`${prefix}${cleanHandle}`);
    } else {
      setUpiId(`${trimmed}${cleanHandle}`);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    const trimmedName = fullName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setErrorMsg('Please enter your full name (at least 2 characters).');
      return;
    }

    const trimmedUpi = upiId.trim();
    let formattedUpi = '';
    if (trimmedUpi) {
      formattedUpi = formatUpiId(trimmedUpi);
      if (!isValidUpiId(formattedUpi)) {
        setErrorMsg('Please enter a valid UPI ID (e.g. yourname@oksbi).');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await onComplete(trimmedName, formattedUpi);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not save profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipUpi = async () => {
    setErrorMsg('');
    const trimmedName = fullName.trim() || user.displayName || user.email?.split('@')[0] || 'User';
    setIsSubmitting(true);
    try {
      await onComplete(trimmedName, '');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not complete profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overscroll-contain font-sans animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-setup-title"
    >
      <div 
        className="bg-surface text-text-primary w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] border border-border shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-250"
        onClick={(e) => e.stopPropagation()}
      >
        {/* iOS Mobile Grab Handle */}
        <div className="pt-2.5 pb-0.5 sm:hidden flex justify-center shrink-0">
          <div className="w-10 h-1 rounded-full bg-surface-active" />
        </div>

        {/* Modal Header: Concise & Subtle */}
        <div className="px-6 pt-3.5 pb-1.5 text-center space-y-1.5 shrink-0">
          <div className="relative mx-auto w-12 h-12 rounded-full bg-google-blue/10 border-2 border-surface shadow-xs flex items-center justify-center overflow-hidden">
            {user.photoURL ? (
              <img 
                src={user.photoURL} 
                alt={fullName || 'User'} 
                className="w-full h-full object-cover" 
                referrerPolicy="no-referrer"
              />
            ) : (
              <UserIcon size={22} className="text-google-blue" />
            )}
            <div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-surface flex items-center justify-center text-white">
              <Check size={8} strokeWidth={3} />
            </div>
          </div>

          <div className="space-y-0.5">
            <h2 
              id="profile-setup-title"
              className="text-lg font-bold tracking-tight text-text-primary"
            >
              Complete your profile
            </h2>
            <p className="text-xs text-text-secondary">
              Set your name and UPI for group settlements.
            </p>
          </div>
        </div>

        {/* Form Body: Compact & Zero-Scroll */}
        <form onSubmit={handleSubmit} className="px-6 py-2 space-y-3">
          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Full Name Field */}
          <div className="space-y-1">
            <label 
              htmlFor="profile-fullname"
              className="block text-[11px] font-semibold uppercase tracking-wider text-text-secondary"
            >
              Full Name
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-secondary/70">
                <UserIcon size={16} />
              </div>
              <input
                id="profile-fullname"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                required
                autoFocus
                className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-surface-hover/70 border border-border text-sm text-text-primary outline-none focus:border-google-blue focus:ring-1 focus:ring-google-blue/30 transition-all font-medium placeholder:text-text-secondary/50"
              />
            </div>
          </div>

          {/* UPI ID Field (No optional keyword) */}
          <div className="space-y-1">
            <label 
              htmlFor="profile-upi"
              className="block text-[11px] font-semibold uppercase tracking-wider text-text-secondary"
            >
              UPI ID
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-secondary/70">
                <Smartphone size={16} />
              </div>
              <input
                id="profile-upi"
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="username@upi"
                className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-surface-hover/70 border border-border text-sm font-mono text-text-primary outline-none focus:border-google-blue focus:ring-1 focus:ring-google-blue/30 transition-all placeholder:text-text-secondary/50 placeholder:font-sans"
              />
            </div>

            {/* Quick Handle Chips */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {COMMON_HANDLES.map((handle) => (
                <button
                  key={handle}
                  type="button"
                  onClick={() => handleApplyHandle(handle)}
                  className="px-2 py-0.5 rounded-lg bg-surface border border-border hover:border-google-blue/40 text-[11px] font-mono text-text-secondary hover:text-google-blue transition-colors cursor-pointer select-none active:scale-95"
                >
                  {handle}
                </button>
              ))}
            </div>
          </div>

          {/* Primary & Secondary Actions */}
          <div className="pt-2 pb-2 space-y-2">
            <button
              type="submit"
              disabled={isSubmitting || !fullName.trim()}
              className="w-full h-11 sm:h-12 bg-google-blue hover:bg-google-blue-hover active:scale-[0.98] disabled:opacity-50 text-white rounded-full text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm shadow-google-blue/25 select-none"
            >
              <span>{isSubmitting ? 'Saving...' : 'Continue'}</span>
              {!isSubmitting && <ArrowRight size={15} strokeWidth={2.4} />}
            </button>

            <div className="text-center">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSkipUpi}
                className="text-xs text-text-secondary hover:text-text-primary transition-colors py-1 cursor-pointer"
              >
                Set up UPI later
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
