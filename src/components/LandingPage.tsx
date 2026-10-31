import React, { useState } from 'react';
import { 
  Wallet, 
  Users, 
  Sun,
  Moon,
  Laptop
} from 'lucide-react';
import { GoogleIcon } from './GoogleIcon';
import type { ThemeMode } from '../types';

interface LandingPageProps {
  onSignIn: () => Promise<void>;
  onExploreGuest: () => void;
  onOpenJoin: () => void;
  themeMode?: ThemeMode;
  darkMode?: boolean;
  onCycleThemeMode?: () => void;
  onToggleDarkMode?: () => void;
}

export function LandingPage({
  onSignIn,
  onExploreGuest,
  onOpenJoin,
  themeMode,
  darkMode,
  onCycleThemeMode,
  onToggleDarkMode
}: LandingPageProps) {
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await onSignIn();
    } catch (err) {
      console.warn('Sign in note:', err);
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-bg-main text-text-primary flex flex-col justify-between font-sans selection:bg-google-blue/20 selection:text-google-blue overflow-y-auto">
      {/* Top Bar: Clean & Minimal */}
      <header className="shrink-0 pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-md mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5 select-none">
            <div className="w-8 h-8 rounded-xl bg-google-blue text-white flex items-center justify-center shadow-xs shrink-0">
              <Wallet size={16} strokeWidth={2.2} />
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-text-primary">
              Hisaab Barabar
            </span>
          </div>

          <div className="flex items-center gap-2">
            {(onCycleThemeMode || onToggleDarkMode) && (
              <button
                type="button"
                onClick={onCycleThemeMode || onToggleDarkMode}
                className="w-8 h-8 rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover active:scale-95 transition-all cursor-pointer"
                title="Toggle appearance"
                aria-label="Toggle theme appearance"
              >
                {themeMode === 'system' ? (
                  <Laptop size={15} />
                ) : themeMode === 'dark' || (darkMode && !themeMode) ? (
                  <Moon size={15} />
                ) : (
                  <Sun size={15} />
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content: Focused, Balanced & Apple/Google Restraint */}
      <main className="flex-1 flex flex-col justify-center px-5 sm:px-6 py-4">
        <div className="max-w-sm w-full mx-auto space-y-6">
          
          {/* Editorial Headline */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary leading-tight">
              Track spends.<br />Split bills.
            </h1>
            <p className="text-sm sm:text-base text-text-secondary max-w-xs mx-auto leading-normal">
              Daily expenses, group splits & shopping lists, kept barabar.
            </p>
          </div>

          {/* The 2 Ledger Cards (Tactile, Clean Surfaces) */}
          <div className="space-y-2.5">
            {/* Expense Tracker */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-border shadow-2xs flex items-center gap-3.5 transition-colors">
              <div className="w-11 h-11 rounded-xl bg-google-blue/10 text-google-blue flex items-center justify-center shrink-0">
                <Wallet size={20} strokeWidth={2.2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-text-primary">
                  Expense Tracker
                </div>
                <p className="text-xs sm:text-[13px] text-text-secondary mt-0.5 leading-snug">
                  Daily spends, budgets & shopping lists
                </p>
              </div>
            </div>

            {/* Split Ledger */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-border shadow-2xs flex items-center gap-3.5 transition-colors">
              <div className="w-11 h-11 rounded-xl bg-google-blue/10 text-google-blue flex items-center justify-center shrink-0">
                <Users size={20} strokeWidth={2.2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-text-primary">
                  Split Ledger
                </div>
                <p className="text-xs sm:text-[13px] text-text-secondary mt-0.5 leading-snug">
                  Group costs, balances & 1-tap UPI
                </p>
              </div>
            </div>
          </div>

          {/* Primary Action Area */}
          <div className="space-y-3 pt-1">
            <button
              type="button"
              onClick={handleSignIn}
              disabled={isSigningIn}
              className="w-full h-12 sm:h-13 bg-google-blue hover:bg-google-blue-hover active:scale-[0.98] text-white rounded-full text-[15px] sm:text-base font-semibold tracking-normal transition-all cursor-pointer flex items-center justify-center gap-3 shadow-sm shadow-google-blue/25 select-none"
            >
              <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shrink-0 shadow-2xs">
                <GoogleIcon className="w-3.5 h-3.5 shrink-0" />
              </div>
              <span>{isSigningIn ? 'Signing in...' : 'Sign in with Google'}</span>
            </button>

            <div className="flex items-center justify-between px-2 text-[13px] sm:text-sm">
              <button
                type="button"
                onClick={onOpenJoin}
                className="font-medium text-google-blue hover:underline py-1 cursor-pointer"
              >
                Have an invite code?
              </button>

              <button
                type="button"
                onClick={onExploreGuest}
                className="font-medium text-text-secondary hover:text-text-primary transition-colors py-1 cursor-pointer"
              >
                Explore as guest
              </button>
            </div>
          </div>

        </div>
      </main>

      {/* Quiet Footer Guarantee with safe area inset */}
      <footer className="shrink-0 pb-[max(1.25rem,env(safe-area-inset-bottom,16px))] pt-2 text-center text-xs text-text-secondary/70 select-none">
        Free forever · Instant UPI · Cloud synced
      </footer>
    </div>
  );
}
