import React, { useEffect } from 'react';
import { 
  X, 
  ArrowRight, 
  ShoppingBag, 
  Users, 
  KeyRound,
  Check,
  Wallet,
  IndianRupee,
  Video,
  Briefcase
} from 'lucide-react';

export type AppTab = 'Overview' | 'Transactions' | 'Lists' | 'Fixed' | 'Settings';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab?: AppTab;
  onGetStarted: () => void;
  onOpenJoinModal?: () => void;
  onOpenVideoTour?: () => void;
  onOpenPortfolio?: () => void;
}

export function OnboardingModal({ 
  isOpen, 
  onClose, 
  activeTab,
  onGetStarted,
  onOpenJoinModal,
  onOpenVideoTour,
  onOpenPortfolio
}: OnboardingModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDismiss();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(16); } catch {}
    }
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem('hisaab_barabar_onboarding_viewed', 'true');
    } catch {}
    triggerHaptic();
    onClose();
  };

  const handleStart = () => {
    try {
      localStorage.setItem('hisaab_barabar_onboarding_viewed', 'true');
    } catch {}
    triggerHaptic();
    onGetStarted();
  };

  const handleJoin = () => {
    try {
      localStorage.setItem('hisaab_barabar_onboarding_viewed', 'true');
    } catch {}
    triggerHaptic();
    onClose();
    if (onOpenJoinModal) {
      onOpenJoinModal();
    }
  };

  const isFromSettings = activeTab === 'Settings';

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overscroll-contain animate-in fade-in duration-200"
      onClick={handleDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-sheet-title"
    >
      <div 
        className="bg-surface text-text-primary w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] border border-border shadow-2xl overflow-hidden flex flex-col max-h-[88dvh] sm:max-h-[86vh] animate-in slide-in-from-bottom duration-250 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* iOS Mobile Grab Handle */}
        <div className="pt-2.5 pb-1 sm:hidden flex justify-center shrink-0">
          <div className="w-10 h-1 rounded-full bg-surface-active" />
        </div>

        {/* Top Header Bar: Always pinned and visible (Never cropped) */}
        <div className="px-5 pt-3 sm:pt-4 pb-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 select-none">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-google-blue text-white flex items-center justify-center shadow-xs shrink-0">
              <Wallet size={16} strokeWidth={2.2} />
            </div>
            <span className="text-[14px] sm:text-base font-semibold tracking-tight text-text-primary">
              Hisaab Barabar
            </span>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover active:bg-surface-active cursor-pointer transition-colors -mr-1"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content Body: Zero clipping on any device, clear typography */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-2 no-scrollbar space-y-4">
          {/* Header Typography */}
          <div className="space-y-1">
            <h2 
              id="onboarding-sheet-title"
              className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary leading-tight"
            >
              Spend together. Stay square.
            </h2>
            <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
              Effortless expense splitting and shared kirana for flatmates & friends.
            </p>
          </div>

          {/* 3 Core Highlights (Apple HIG & Google M3: 1-line value statements, zero cognitive burden) */}
          <div className="space-y-3.5 pt-1">
            {/* Split */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 dark:bg-amber-500/25 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                <IndianRupee size={20} strokeWidth={2.2} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-text-primary leading-snug">
                  Split expenses in ₹
                </h3>
                <p className="text-xs text-text-secondary leading-normal mt-0.5">
                  Log chai, Swiggy, or rent in seconds. Net balances settle automatically.
                </p>
              </div>
            </div>

            {/* Kirana */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 dark:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                <ShoppingBag size={20} strokeWidth={2.2} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-text-primary leading-snug">
                  Shared Kirana checklist
                </h3>
                <p className="text-xs text-text-secondary leading-normal mt-0.5">
                  Groceries sync live. Check off items at the shop to auto-split costs.
                </p>
              </div>
            </div>

            {/* Ledgers */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-google-blue/15 dark:bg-google-blue/25 text-google-blue flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                <Users size={20} strokeWidth={2.2} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-text-primary leading-snug">
                  Multiple groups & ledgers
                </h3>
                <p className="text-xs text-text-secondary leading-normal mt-0.5">
                  Keep flat bills, Goa trips, and personal spends neatly separated.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Pinned Bottom Actions: Always visible on screen */}
        <div className="px-5 sm:px-6 pt-3 pb-5 sm:pb-6 border-t border-border/80 bg-surface shrink-0 space-y-2.5">
          <button
            type="button"
            onClick={handleStart}
            className="w-full h-11 sm:h-12 bg-google-blue hover:bg-google-blue-hover active:scale-[0.98] text-white rounded-full text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
          >
            <span>{isFromSettings ? 'Back to Overview Dashboard' : 'Get Started'}</span>
            <ArrowRight size={16} strokeWidth={2.4} />
          </button>

          {(onOpenVideoTour || onOpenPortfolio) && (
            <div className="flex gap-2">
              {onOpenVideoTour && (
                <button
                  type="button"
                  onClick={() => {
                    handleDismiss();
                    onOpenVideoTour();
                  }}
                  className="flex-1 py-2 px-3 rounded-full border border-border hover:bg-surface-hover text-xs font-semibold text-text-primary flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Video size={13} className="text-google-blue" />
                  <span>Watch Video Tour</span>
                </button>
              )}

              {onOpenPortfolio && (
                <button
                  type="button"
                  onClick={() => {
                    handleDismiss();
                    onOpenPortfolio();
                  }}
                  className="flex-1 py-2 px-3 rounded-full border border-border hover:bg-surface-hover text-xs font-semibold text-text-primary flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Briefcase size={13} className="text-emerald-500" />
                  <span>HR Portfolio</span>
                </button>
              )}
            </div>
          )}

          {onOpenJoinModal && (
            <button
              type="button"
              onClick={handleJoin}
              className="w-full py-1 text-center text-xs font-semibold text-google-blue hover:underline flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <KeyRound size={14} />
              <span>Have a group code? Join flat</span>
            </button>
          )}

          {/* Micro-guarantee tokens */}
          <div className="flex items-center justify-center gap-2 pt-0.5 text-[11px] text-text-secondary">
            <span className="flex items-center gap-1">
              <Check size={12} className="text-emerald-500" strokeWidth={3} />
              <span>100% Free</span>
            </span>
            <span>·</span>
            <span>Works Offline</span>
            <span>·</span>
            <span>No Account Needed</span>
          </div>
        </div>
      </div>
    </div>
  );
}
