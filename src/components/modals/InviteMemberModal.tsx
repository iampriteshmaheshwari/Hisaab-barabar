import React, { useState } from 'react';
import { 
  X, 
  Share2, 
  Copy, 
  Check, 
  UserPlus, 
  Users, 
  MessageCircle, 
  Sparkles, 
  ShieldCheck,
  Send,
  Loader2
} from 'lucide-react';
import type { ExpenseGroup, UserRole } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { getGroupMembersList } from '../../services/splitService';
import { 
  getGroupInviteUrl, 
  getGroupInviteShareData, 
  shareGroupInviteLink, 
  copyGroupInviteCode 
} from '../../utils/shareUtils';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: ExpenseGroup;
  userRole: UserRole;
  onAddDirectMember?: (nameOrEmail: string) => Promise<boolean | void>;
}

export function InviteMemberModal({
  isOpen,
  onClose,
  group,
  userRole,
  onAddDirectMember
}: InviteMemberModalProps) {
  const { user } = useAuth();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [memberAddedNotice, setMemberAddedNotice] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const whatsappUrl = React.useMemo(() => {
    if (!group) return '';
    const shareData = getGroupInviteShareData(group);
    const message = `${shareData.text}\n${shareData.url}`;
    return `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
  }, [group]);

  if (!isOpen) return null;

  const inviteCode = group.inviteCode || 'N/A';
  const inviteLink = getGroupInviteUrl(group);

  const members = getGroupMembersList(group, user?.uid, user?.email || undefined);

  const handleCopyCode = async () => {
    const ok = await copyGroupInviteCode(group);
    if (ok) {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2200);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    } catch {}
  };

  const handleNativeShare = async () => {
    const res = await shareGroupInviteLink(group);
    if (res.copied) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    }
  };

  const handleAddMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newMemberName.trim();
    if (!clean || !onAddDirectMember) return;

    setIsAddingMember(true);
    setAddError(null);
    try {
      await onAddDirectMember(clean);
      setMemberAddedNotice(`${clean} added to this split!`);
      setNewMemberName('');
      setTimeout(() => setMemberAddedNotice(null), 3000);
    } catch (err: any) {
      setAddError(err?.message || 'Could not add member. Please try again.');
    } finally {
      setIsAddingMember(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-surface rounded-t-3xl sm:rounded-3xl border border-border shadow-2xl overflow-hidden max-h-[92vh] flex flex-col font-sans animate-in slide-in-from-bottom-6 sm:slide-in-from-bottom-2 duration-250"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Grab Handle */}
        <div className="w-12 h-1.5 bg-border rounded-full mx-auto mt-3 sm:hidden" />

        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-border/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-google-blue/10 text-google-blue flex items-center justify-center shrink-0">
              <UserPlus size={20} strokeWidth={2.2} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-text-primary leading-tight">
                Invite to {group.name}
              </h2>
              <p className="text-xs text-text-secondary mt-0.5">
                Share invite code or add members directly to split group bills
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
            aria-label="Close invite modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* Hero Invite Code Card */}
          <div className="bg-surface-hover/60 border border-border rounded-3xl p-4 sm:p-5 text-center space-y-3 relative overflow-hidden">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-google-blue/10 text-google-blue text-xs font-semibold">
              <Sparkles size={13} />
              <span>Invite Code</span>
            </div>

            <div className="font-mono text-2xl sm:text-3xl font-extrabold tracking-widest text-text-primary select-all">
              {inviteCode}
            </div>

            <p className="text-xs text-text-secondary max-w-xs mx-auto leading-relaxed">
              Friends can enter this code in the app to join instantly with full real-time access.
            </p>

            <div className="pt-1 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleCopyCode}
                className="h-10 px-5 rounded-full bg-surface border border-border hover:border-google-blue/40 text-xs sm:text-sm font-semibold text-text-primary flex items-center gap-2 transition-all cursor-pointer shadow-xs active:scale-95"
              >
                {copiedCode ? (
                  <>
                    <Check size={15} className="text-google-green" strokeWidth={2.5} />
                    <span className="text-google-green">Code Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={15} />
                    <span>Copy Code</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick Sharing Channels */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-text-secondary block px-1">
              Share Invite Link
            </label>

            {/* Link input with copy button */}
            <div className="flex items-center gap-2 p-1.5 pl-3.5 rounded-2xl bg-surface border border-border shadow-xs">
              <input
                type="text"
                readOnly
                value={inviteLink}
                className="w-full bg-transparent text-xs text-text-secondary outline-none font-mono select-all truncate"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-3.5 py-1.5 rounded-xl bg-surface-hover hover:bg-surface-active text-xs font-semibold text-text-primary flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
              >
                {copiedLink ? (
                  <>
                    <Check size={13} className="text-google-green" strokeWidth={2.5} />
                    <span className="text-google-green">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>

            {/* WhatsApp & Native Share Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-11 px-4 rounded-2xl bg-[#25D366] hover:bg-[#20ba59] text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-95 no-underline"
              >
                <MessageCircle size={16} fill="white" />
                <span>Share via WhatsApp</span>
              </a>

              <button
                type="button"
                onClick={handleNativeShare}
                className="h-11 px-4 rounded-2xl bg-google-blue hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-95"
              >
                <Share2 size={16} />
                <span>{copiedLink ? 'Link Copied!' : 'Share Invite Link'}</span>
              </button>
            </div>
          </div>

          {/* Direct Add Member by Name or Email */}
          {onAddDirectMember && (
            <div className="space-y-2.5 pt-2 border-t border-border">
              <div className="px-1 flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-text-secondary block">
                  Add Member Directly
                </label>
                <span className="text-[11px] text-text-secondary">
                  Ready to split immediately
                </span>
              </div>

              <form onSubmit={handleAddMemberSubmit} className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    placeholder="Friend's Name or Email (e.g. Rahul Sharma)"
                    className="flex-1 px-3.5 py-2.5 rounded-2xl bg-surface border border-border text-xs sm:text-sm text-text-primary placeholder:text-text-secondary/60 outline-none focus:border-google-blue transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={isAddingMember || !newMemberName.trim()}
                    className="px-4 py-2.5 rounded-2xl bg-surface-hover hover:bg-surface-active border border-border text-xs sm:text-sm font-semibold text-text-primary hover:text-google-blue transition-colors cursor-pointer disabled:opacity-40 flex items-center gap-1.5 shrink-0"
                  >
                    {isAddingMember ? (
                      <Loader2 size={15} className="animate-spin text-google-blue" />
                    ) : (
                      <UserPlus size={15} />
                    )}
                    <span>Add</span>
                  </button>
                </div>

                {memberAddedNotice && (
                  <div className="p-2.5 rounded-xl bg-google-green/10 border border-google-green/20 text-xs font-semibold text-google-green flex items-center gap-2 animate-in fade-in duration-200">
                    <Check size={14} strokeWidth={2.5} />
                    <span>{memberAddedNotice}</span>
                  </div>
                )}

                {addError && (
                  <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-medium text-google-red">
                    {addError}
                  </div>
                )}
              </form>
            </div>
          )}

          {/* Current Ledger Members */}
          <div className="space-y-2.5 pt-2 border-t border-border">
            <div className="px-1 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Current Members ({members.length})
              </span>
              <span className="text-xs text-text-secondary">
                {members.length >= 2 ? 'Ready to split' : 'Need at least 2 members'}
              </span>
            </div>

            <div className="bg-surface rounded-2xl border border-border divide-y divide-border/60 max-h-44 overflow-y-auto">
              {members.map((m) => (
                <div key={m.key} className="p-3 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-google-blue/10 text-google-blue flex items-center justify-center font-bold text-xs shrink-0">
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-text-primary truncate flex items-center gap-1.5">
                        <span>{m.isCurrentUser ? 'You' : m.name}</span>
                        {m.isCurrentUser && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-google-blue/10 text-google-blue">
                            You
                          </span>
                        )}
                      </div>
                      {m.email && !m.isCurrentUser && (
                        <div className="text-[11px] text-text-secondary truncate">
                          {m.email}
                        </div>
                      )}
                    </div>
                  </div>

                  <span className="text-[11px] font-medium text-text-secondary shrink-0">
                    Active
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-border/80 bg-surface/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-6 rounded-full bg-surface-hover hover:bg-surface-active text-xs sm:text-sm font-semibold text-text-primary transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
