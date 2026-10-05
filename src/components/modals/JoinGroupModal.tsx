import React, { useState } from 'react';
import { 
  X, 
  Users, 
  Check, 
  AlertCircle, 
  AlertTriangle,
  ArrowRight, 
  ShieldCheck, 
  ShoppingBag, 
  BookOpen, 
  ClipboardPaste,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { joinGroupByCode } from '../../services/expenseService';
import { GoogleIcon } from '../GoogleIcon';
import type { ExpenseGroup } from '../../types';

interface JoinGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoined: (groupId: string, groupName?: string) => void;
  initialCode?: string;
  groups?: ExpenseGroup[];
}

// Automatically extract clean code if user pasted a full URL or text with code
export function parseCodeInput(raw: string): string {
  let val = raw.trim();
  if (!val) return '';

  // 1. If someone pasted a full URL (e.g., https://.../?joinCode=377QSK43 or ?code=377QSK43)
  try {
    if (val.includes('joinCode=') || val.includes('code=')) {
      const url = new URL(val.startsWith('http') ? val : `https://${val}`);
      const paramCode = url.searchParams.get('joinCode') || url.searchParams.get('code');
      if (paramCode) return paramCode.trim().toUpperCase();
    }
  } catch {
    // Fallback if URL parsing fails
  }

  // 2. Query param regex match
  const queryMatch = val.match(/(?:joinCode|code)=([A-Za-z0-9_-]+)/i);
  if (queryMatch && queryMatch[1]) {
    return queryMatch[1].toUpperCase();
  }

  // 3. If someone pasted text containing an alphanumeric code
  const codeMatch = val.match(/\b([A-Za-z0-9]{6,12})\b/);
  if (val.length > 12 && codeMatch && codeMatch[1]) {
    return codeMatch[1].toUpperCase();
  }

  return val.toUpperCase();
}

export function JoinGroupModal({
  isOpen,
  onClose,
  onJoined,
  initialCode = '',
  groups = []
}: JoinGroupModalProps) {
  const { user, signInWithGoogle } = useAuth();
  const [code, setCode] = useState(parseCodeInput(initialCode));
  const [isJoining, setIsJoining] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [forceManualInput, setForceManualInput] = useState(false);

  // Reset manual override and errors on code change or modal re-open
  React.useEffect(() => {
    setForceManualInput(false);
    setErrorMsg('');
  }, [isOpen, initialCode]);

  // Countdown timer for lockout
  React.useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockoutSeconds(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds]);

  // Update local code state if initialCode changes
  React.useEffect(() => {
    if (initialCode) {
      setCode(parseCodeInput(initialCode));
    }
  }, [initialCode]);

  const hasInviteLinkCode = Boolean(initialCode && initialCode.trim().length > 0 && !forceManualInput);

  // Check if current user is already an owner or member of this group
  const alreadyInGroup = React.useMemo(() => {
    const codeToCheck = (code || initialCode || '').trim().toUpperCase();
    if (!codeToCheck || !groups || groups.length === 0) return null;
    return groups.find(g => 
      g.inviteCode?.toUpperCase() === codeToCheck || 
      g.previousInviteCodes?.some(c => c.toUpperCase() === codeToCheck) ||
      g.id === codeToCheck
    ) || null;
  }, [groups, code, initialCode]);

  const isOwnerOfGroup = React.useMemo(() => {
    if (!alreadyInGroup || !user) return false;
    const userEmail = (user.email || '').toLowerCase().trim();
    return alreadyInGroup.createdBy === user.uid || (alreadyInGroup.ownerEmail && alreadyInGroup.ownerEmail.toLowerCase() === userEmail);
  }, [alreadyInGroup, user]);

  const executeJoin = async (codeToJoin: string, activeUser = user) => {
    if (lockoutSeconds > 0) {
      setErrorMsg(`Too many invalid attempts. Please wait ${lockoutSeconds}s before trying again.`);
      return;
    }

    if (!activeUser) {
      setErrorMsg('Please sign in with your Google account first.');
      return;
    }

    const cleanCode = parseCodeInput(codeToJoin);
    if (!cleanCode) {
      setErrorMsg('Please enter a valid invite code.');
      return;
    }

    // If user is already in this group, simply switch to it and close
    if (alreadyInGroup) {
      onJoined(alreadyInGroup.id, alreadyInGroup.name);
      onClose();
      return;
    }

    setIsJoining(true);
    setErrorMsg('');

    try {
      const group = await joinGroupByCode(cleanCode, activeUser);
      if (!group) {
        throw new Error('Ledger not found or inactive. The ledger may have been deleted, or this invite code was reset by the admin.');
      }
      try {
        sessionStorage.removeItem('hisaab_pending_invite_code');
        sessionStorage.removeItem('hisaab_auto_join');
      } catch {}
      setFailedAttempts(0);
      setLockoutSeconds(0);
      onJoined(group.id, group.name);
      onClose();
    } catch (err: any) {
      console.error('Error joining group:', err);
      let message = 'Unable to join group. Please check the code.';
      if (err?.message) {
        if (err.message.includes('expired') || err.message.includes('regenerated')) {
          message = 'This invite code has expired or was regenerated by the ledger admin. Please ask an admin for the updated invite link.';
        } else if (err.message.includes('not found') || err.message.includes('inactive')) {
          message = 'Ledger not found or inactive. The ledger may have been deleted, or this invite code was reset by the admin.';
        } else if (!activeUser && (err.message.includes('permission-denied') || err.message.includes('Missing or insufficient permissions'))) {
          message = 'Access denied. You must be signed in with Google to join this shared ledger.';
        } else if (err.message.includes('permission-denied') || err.message.includes('Missing or insufficient permissions')) {
          message = 'Ledger not found or inactive. The ledger may have been deleted, or this invite code is no longer valid.';
        } else {
          message = err.message;
        }
      }
      setErrorMsg(message);

      // Security: Rate limit consecutive failed code attempts
      setFailedAttempts(prev => {
        const next = prev + 1;
        if (next >= 5) {
          setLockoutSeconds(30);
          setErrorMsg('Too many invalid attempts. For security, please wait 30 seconds before trying again.');
          return 0;
        }
        return next;
      });
    } finally {
      setIsJoining(false);
    }
  };

  // Auto-complete join if auth state finishes or redirect returns
  React.useEffect(() => {
    if (user && hasInviteLinkCode && sessionStorage.getItem('hisaab_auto_join') === 'true') {
      sessionStorage.removeItem('hisaab_auto_join');
      executeJoin(code || initialCode, user);
    }
  }, [user, hasInviteLinkCode]);

  if (!isOpen) return null;

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      try {
        const loggedUser = await signInWithGoogle();
        if (loggedUser) {
          await executeJoin(code, loggedUser);
        }
      } catch (err: any) {
        setErrorMsg(err?.message || 'Sign in was cancelled or failed.');
      }
      return;
    }

    await executeJoin(code, user);
  };

  const handleSignInAndAcceptInvite = async () => {
    setErrorMsg('');
    setIsJoining(true);
    try {
      sessionStorage.setItem('hisaab_auto_join', 'true');
      const loggedUser = await signInWithGoogle();
      if (loggedUser) {
        await executeJoin(code || initialCode, loggedUser);
      } else {
        setIsJoining(false);
      }
    } catch (err: any) {
      sessionStorage.removeItem('hisaab_auto_join');
      console.warn('Sign-in status in JoinGroupModal:', err?.message || err);
      setErrorMsg(err?.message || 'Google sign in was not completed.');
      setIsJoining(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overscroll-contain font-sans"
      onClick={onClose}
    >
      <div 
        className="bg-surface w-full sm:max-w-md md:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-border overflow-hidden animate-in slide-in-from-bottom duration-200 flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Grab Handle */}
        <div className="pt-2.5 pb-1 sm:hidden flex justify-center shrink-0">
          <div className="w-10 h-1 rounded-full bg-surface-active" />
        </div>

        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-google-blue/10 text-google-blue flex items-center justify-center shrink-0">
              <Users size={16} strokeWidth={2.2} />
            </div>
            <span className="text-base font-semibold text-text-primary">
              {hasInviteLinkCode ? 'Ledger Invitation' : 'Join Ledger'}
            </span>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover cursor-pointer transition-colors shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto no-scrollbar space-y-4">
          {/* SCENARIO 1: ARRIVED VIA INVITE LINK */}
          {hasInviteLinkCode ? (
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-google-blue/10 border border-google-blue/20 text-google-blue text-xs font-semibold">
                  <span>Invite Code</span>
                  <span className="font-mono tracking-wider">{initialCode}</span>
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-text-primary">
                  You've Been Invited to Join
                </h3>
                <p className="text-xs sm:text-sm text-text-secondary leading-relaxed max-w-sm mx-auto">
                  Collaborate in real time on shared expenses, balances, and the group buying list.
                </p>
              </div>

              {/* Shared Features summary */}
              <div className="bg-surface-hover/60 border border-border rounded-2xl p-3.5 space-y-2.5 text-xs sm:text-sm text-text-secondary">
                <div className="flex items-center gap-2 text-text-primary font-medium">
                  <BookOpen size={14} className="text-google-blue shrink-0" />
                  <span>Shared Ledger & Balances</span>
                </div>
                <div className="flex items-center gap-2 text-text-primary font-medium">
                  <ShoppingBag size={14} className="text-emerald-600 shrink-0" />
                  <span>Shared Real-Time Shopping List</span>
                </div>
                <div className="flex items-center gap-2 text-text-primary font-medium">
                  <ShieldCheck size={14} className="text-amber-500 shrink-0" />
                  <span>Verified Google Account Permissions</span>
                </div>
              </div>

              {/* Error Recovery State: Code is expired, regenerated, or ledger was deleted */}
              {errorMsg ? (
                <div className="space-y-4 pt-1 animate-in fade-in duration-200">
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-text-primary space-y-2.5 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-xs">
                      <AlertTriangle size={24} strokeWidth={2.2} />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-text-primary">
                        {errorMsg.includes('expired') || errorMsg.includes('regenerated')
                          ? 'Invite Link Inactive'
                          : 'Ledger Not Available'}
                      </h4>
                      <p className="text-xs text-text-secondary leading-relaxed max-w-xs mx-auto">
                        {errorMsg}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg('');
                        setForceManualInput(true);
                        setCode('');
                      }}
                      className="w-full h-11 bg-google-blue hover:bg-google-blue-hover text-white rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs active:scale-95"
                    >
                      <span>Enter a Different Code</span>
                    </button>

                    <button
                      type="button"
                      onClick={onClose}
                      className="w-full h-10 rounded-full border border-border hover:bg-surface-hover text-text-secondary hover:text-text-primary text-xs font-medium transition-colors cursor-pointer"
                    >
                      Back to My Ledgers
                    </button>
                  </div>
                </div>
              ) : isJoining ? (
                <div className="p-6 rounded-2xl bg-surface border border-border flex flex-col items-center justify-center text-center space-y-3 animate-in fade-in duration-200">
                  <div className="w-8 h-8 rounded-full border-2 border-google-blue border-t-transparent animate-spin" />
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-text-primary">
                      Joining Shared Ledger...
                    </div>
                    <div className="text-xs text-text-secondary">
                      Connecting your Google account and syncing balances
                    </div>
                  </div>
                </div>
              ) : !user ? (
                <div className="space-y-2 pt-1">
                  <div className="p-3 rounded-2xl bg-google-blue/5 border border-google-blue/15 text-google-blue text-xs font-medium">
                    No extra setup required. You'll be directly added to this shared ledger.
                  </div>

                  <button
                    type="button"
                    onClick={handleSignInAndAcceptInvite}
                    className="w-full h-11 bg-surface hover:bg-surface-hover border border-border shadow-xs hover:border-text-secondary/40 text-text-primary rounded-full text-xs sm:text-sm font-medium transition-all cursor-pointer flex items-center justify-center gap-2.5 active:scale-95"
                  >
                    <GoogleIcon className="w-4 h-4 shrink-0" />
                    <span>Join Ledger with Google</span>
                  </button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={onClose}
                      className="text-xs text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                    >
                      Decline & continue as guest
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  <div className="p-3 rounded-2xl bg-surface border border-border flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-google-blue/10 text-google-blue font-bold flex items-center justify-center text-xs shrink-0">
                        {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-text-primary truncate">
                          {user.displayName || 'Google User'}
                        </div>
                        <div className="text-xs text-text-secondary truncate">
                          {user.email}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">
                      Signed In
                    </span>
                  </div>

                  {alreadyInGroup ? (
                    <div className="space-y-2 pt-1">
                      <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs sm:text-sm font-medium flex items-center gap-2.5">
                        <Check size={16} className="text-emerald-600 shrink-0" />
                        <div>
                          <span>You are already {isOwnerOfGroup ? 'an admin' : 'a member'} of <strong>"{alreadyInGroup.name}"</strong>.</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          onJoined(alreadyInGroup.id, alreadyInGroup.name);
                          onClose();
                        }}
                        className="w-full h-11 bg-google-blue hover:bg-google-blue-hover text-white rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs active:scale-95"
                      >
                        <span>Open "{alreadyInGroup.name}" Ledger</span>
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => executeJoin(initialCode, user)}
                      className="w-full h-11 bg-google-blue hover:bg-google-blue-hover text-white rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs active:scale-95"
                    >
                      <Check size={16} strokeWidth={2.5} />
                      <span>Accept & Join Ledger</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* SCENARIO 2: MANUAL JOIN VIA INVITE CODE */
            <div className="space-y-4">
              {!user ? (
                <div className="text-center space-y-4 py-2">
                  <div className="space-y-1.5">
                    <h3 className="text-base font-semibold text-text-primary">
                      Sign in with Google to Join
                    </h3>
                    <p className="text-xs text-text-secondary leading-relaxed max-w-sm mx-auto">
                      To view or edit a shared ledger and its shopping list, sign in with your Google account.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await signInWithGoogle();
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                    className="w-full h-11 bg-surface hover:bg-surface-hover border border-border shadow-xs text-text-primary rounded-full text-xs sm:text-sm font-medium transition-all cursor-pointer flex items-center justify-center gap-2.5 active:scale-95"
                  >
                    <GoogleIcon className="w-4 h-4 shrink-0" />
                    <span>Continue with Google</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleManualSubmit} className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-text-secondary">
                        Invite Code
                      </label>
                      {typeof navigator !== 'undefined' && navigator.clipboard && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const clipText = await navigator.clipboard.readText();
                              if (clipText) {
                                const cleaned = parseCodeInput(clipText);
                                setCode(cleaned);
                                setErrorMsg('');
                              }
                            } catch {
                              // Clipboard read blocked
                            }
                          }}
                          className="text-xs text-google-blue hover:text-blue-700 font-medium flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <ClipboardPaste size={12} />
                          <span>Paste from Clipboard</span>
                        </button>
                      )}
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        required
                        maxLength={32}
                        value={code}
                        onChange={(e) => setCode(parseCodeInput(e.target.value))}
                        placeholder="e.g. 377QSK43"
                        className="w-full px-4 py-3 rounded-2xl bg-surface-hover/70 border border-border text-center font-mono text-lg tracking-widest text-text-primary outline-none focus:border-google-blue uppercase font-bold transition-all"
                      />
                      {code && (
                        <button
                          type="button"
                          onClick={() => setCode('')}
                          className="absolute right-3 top-3 text-text-secondary hover:text-text-primary p-1 rounded-full cursor-pointer"
                          title="Clear code"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-text-secondary mt-1.5 text-center">
                      Paste the 8-character invite code or shared link from your ledger admin.
                    </p>
                  </div>

                  {errorMsg && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-xs text-google-red flex items-start gap-2">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  {alreadyInGroup ? (
                    <div className="space-y-2 pt-1">
                      <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs sm:text-sm font-medium flex items-center gap-2.5">
                        <Check size={16} className="text-emerald-600 shrink-0" />
                        <div>
                          <span>You are already {isOwnerOfGroup ? 'an admin' : 'a member'} of <strong>"{alreadyInGroup.name}"</strong>.</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          onJoined(alreadyInGroup.id, alreadyInGroup.name);
                          onClose();
                        }}
                        className="w-full h-11 bg-google-blue hover:bg-google-blue-hover text-white rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs active:scale-95"
                      >
                        <span>Open "{alreadyInGroup.name}" Ledger</span>
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="submit"
                      disabled={isJoining || !code.trim() || lockoutSeconds > 0}
                      className="w-full h-11 bg-google-blue hover:bg-google-blue-hover disabled:opacity-40 text-white rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs active:scale-95"
                    >
                      <Check size={16} strokeWidth={2.5} />
                      <span>{lockoutSeconds > 0 ? `Please wait ${lockoutSeconds}s` : isJoining ? 'Joining Ledger...' : 'Join Ledger'}</span>
                    </button>
                  )}
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
