import React, { useState, useMemo } from 'react';
import { 
  Receipt, 
  Search, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  Plus, 
  Users, 
  ArrowRight,
  Filter,
  IndianRupee,
  RotateCcw,
  AlertTriangle,
  Pencil,
  Clock,
  Archive,
  Info
} from 'lucide-react';
import type { ExpenseGroup, Transaction, UserRole } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { 
  getMemberDisplayName, 
  formatSettlementDisplayTitle,
  formatTimeAgo,
  getDaysRemainingInTrash,
  evaluateTransactionDeleteRule
} from '../../services/splitService';
import { isWithinPast30Days } from '../../services/expenseService';

interface SplitTransactionsTabProps {
  group: ExpenseGroup;
  transactions: Transaction[];
  userRole: UserRole;
  onOpenAddExpense: () => void;
  onEditExpense: (tx: Transaction) => void;
  onDeleteExpense: (txId: string) => void;
  onRestoreExpense?: (txId: string) => void;
  onPermanentDeleteExpense?: (txId: string) => void;
}

export function SplitTransactionsTab({
  group,
  transactions,
  userRole,
  onOpenAddExpense,
  onEditExpense,
  onDeleteExpense,
  onRestoreExpense,
  onPermanentDeleteExpense
}: SplitTransactionsTabProps) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'expenses' | 'settlements' | 'trash'>('all');
  
  // State for transaction targeted for delete/undo
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null);
  const [permissionDeniedMsg, setPermissionDeniedMsg] = useState<string | null>(null);

  // State for hard purge confirmation from trash
  const [txToPurgeForever, setTxToPurgeForever] = useState<Transaction | null>(null);

  const isViewer = userRole === 'viewer';
  const myNormKey = (user?.uid || '').toLowerCase();
  const myNormEmail = (user?.email || '').toLowerCase().trim();

  const isMe = (keyOrEmail?: string) => {
    if (!keyOrEmail) return false;
    const norm = keyOrEmail.toLowerCase().trim();
    return (myNormKey && norm === myNormKey) || (myNormEmail && norm === myNormEmail);
  };

  // Separate active transactions vs recently deleted (past 30 days)
  const activeTransactions = useMemo(() => {
    return transactions.filter(t => !t.isDeleted);
  }, [transactions]);

  const deletedTransactions = useMemo(() => {
    return transactions.filter(t => Boolean(t.isDeleted) && isWithinPast30Days(t.deletedAt));
  }, [transactions]);

  // Filter and search logic
  const filteredTransactions = useMemo(() => {
    if (filterType === 'trash') {
      let list = [...deletedTransactions];
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        list = list.filter(t => 
          t.name.toLowerCase().includes(q) ||
          (t.paidByName && t.paidByName.toLowerCase().includes(q)) ||
          (t.deletedByName && t.deletedByName.toLowerCase().includes(q)) ||
          (t.note && t.note.toLowerCase().includes(q))
        );
      }
      return list;
    }

    let list = [...activeTransactions];
    if (filterType === 'expenses') {
      list = list.filter(t => !t.isSettlement);
    } else if (filterType === 'settlements') {
      list = list.filter(t => Boolean(t.isSettlement));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(t => 
        t.name.toLowerCase().includes(q) ||
        (t.paidByName && t.paidByName.toLowerCase().includes(q)) ||
        (t.lastEditedByName && t.lastEditedByName.toLowerCase().includes(q)) ||
        (t.note && t.note.toLowerCase().includes(q))
      );
    }

    return list;
  }, [activeTransactions, deletedTransactions, filterType, searchQuery]);

  // Handler for delete click with rule evaluation
  const handleInitiateDelete = (tx: Transaction) => {
    const evalRule = evaluateTransactionDeleteRule(tx, user, userRole, group);
    if (!evalRule.canDelete) {
      setPermissionDeniedMsg(evalRule.rejectionReason || 'You do not have permission to delete this transaction.');
      return;
    }
    setTxToDelete(tx);
  };

  const deleteRuleForTarget = txToDelete 
    ? evaluateTransactionDeleteRule(txToDelete, user, userRole, group)
    : null;

  return (
    <div className="space-y-4 pb-20 font-sans">
      {/* Search and Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={filterType === 'trash' ? "Search deleted bills or who deleted them..." : "Search bills, payers, notes, or editors..."}
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-surface border border-border text-sm text-text-primary outline-none focus:border-google-blue transition-all"
          />
        </div>

        {/* Filter Tabs with Apple/Google segmented control styling */}
        <div className="grid grid-cols-4 p-1 rounded-2xl bg-surface border border-border text-xs gap-1">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`py-1.5 rounded-xl font-medium transition-all cursor-pointer text-center truncate px-1 ${
              filterType === 'all'
                ? 'bg-google-blue text-white shadow-xs font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            All ({activeTransactions.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('expenses')}
            className={`py-1.5 rounded-xl font-medium transition-all cursor-pointer text-center truncate px-1 ${
              filterType === 'expenses'
                ? 'bg-google-blue text-white shadow-xs font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Bills ({activeTransactions.filter(t => !t.isSettlement).length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('settlements')}
            className={`py-1.5 rounded-xl font-medium transition-all cursor-pointer text-center truncate px-1 ${
              filterType === 'settlements'
                ? 'bg-google-blue text-white shadow-xs font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Settled ({activeTransactions.filter(t => t.isSettlement).length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('trash')}
            className={`py-1.5 rounded-xl font-medium transition-all cursor-pointer text-center truncate px-1 flex items-center justify-center gap-1 ${
              filterType === 'trash'
                ? 'bg-amber-600 text-white shadow-xs font-semibold'
                : deletedTransactions.length > 0 
                  ? 'text-amber-600 dark:text-amber-400 hover:text-amber-700 font-medium'
                  : 'text-text-secondary hover:text-text-primary'
            }`}
            title="Recently Deleted entries (past 30 days)"
          >
            <Trash2 size={12} className="shrink-0" />
            <span>Trash ({deletedTransactions.length})</span>
          </button>
        </div>
      </div>

      {/* Trash 30-Day Info Banner */}
      {filterType === 'trash' && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-text-primary flex items-start gap-2.5">
          <Info size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5 leading-relaxed">
            <span className="font-semibold text-text-primary">30-Day Retention Guarantee:</span>
            <span className="text-text-secondary ml-1">
              Transactions deleted by members are preserved here for 30 days. Restoring any transaction will automatically bring back all member shares and update the group balances.
            </span>
          </div>
        </div>
      )}

      {/* Empty State */}
      {filteredTransactions.length === 0 ? (
        <div className="p-8 rounded-3xl bg-surface border border-border text-center space-y-3">
          {filterType === 'trash' ? (
            <>
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                <Trash2 size={24} strokeWidth={2} />
              </div>
              <div className="text-sm font-semibold text-text-primary">
                No Deleted Transactions
              </div>
              <div className="text-xs text-text-secondary max-w-xs mx-auto">
                {searchQuery 
                  ? 'No deleted entries match your search query.'
                  : 'Items deleted from this split ledger in the past 30 days will appear here for audit and one-tap restore.'}
              </div>
            </>
          ) : (
            <>
              <Receipt size={28} className="text-text-secondary/50 mx-auto" />
              <div className="text-sm font-semibold text-text-primary">
                No transactions found
              </div>
              <div className="text-xs text-text-secondary max-w-xs mx-auto">
                {searchQuery 
                  ? 'Try adjusting your search query or filters.' 
                  : 'Add split expenses with friends or record debt settlements.'}
              </div>
              {!isViewer && !searchQuery && (
                <button
                  type="button"
                  onClick={onOpenAddExpense}
                  className="px-4 py-2 rounded-full bg-google-blue text-white text-xs font-semibold hover:bg-blue-700 transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
                >
                  <Plus size={14} />
                  <span>Add Expense</span>
                </button>
              )}
            </>
          )}
        </div>
      ) : filterType === 'trash' ? (
        /* ========================================================================= */
        /* TRASH / RECENTLY DELETED VIEW (PAST 30 DAYS) */
        /* ========================================================================= */
        <div className="bg-surface rounded-3xl border border-border divide-y divide-border overflow-hidden">
          {filteredTransactions.map((tx) => {
            const isSettlement = Boolean(tx.isSettlement);
            const daysLeft = getDaysRemainingInTrash(tx.deletedAt);

            return (
              <div 
                key={tx.id} 
                className="p-3.5 sm:p-4 hover:bg-surface-hover/40 transition-colors flex items-start justify-between gap-3 text-xs sm:text-sm bg-amber-500/[0.02]"
              >
                <div className="min-w-0 flex-1">
                  {/* Title and tags */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-text-primary line-through opacity-70 truncate">
                      {isSettlement 
                        ? formatSettlementDisplayTitle(tx, group, user?.uid, user?.email || undefined)
                        : tx.name}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25 shrink-0 flex items-center gap-1">
                      <Clock size={10} />
                      <span>{daysLeft}d left</span>
                    </span>
                    {isSettlement && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                        Settlement
                      </span>
                    )}
                  </div>

                  {/* Deletion audit trail */}
                  <div className="text-xs text-text-secondary mt-1 flex items-center gap-1.5 flex-wrap">
                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                      Deleted by {tx.deletedByName || 'Member'}
                    </span>
                    <span>·</span>
                    <span>{formatTimeAgo(tx.deletedAt)}</span>
                    <span>·</span>
                    <span>Originally on {tx.date}</span>
                  </div>

                  {/* Payer & Participants info */}
                  <div className="text-[11px] text-text-secondary/80 mt-1">
                    Paid by <strong className="font-semibold text-text-primary">{tx.paidByName || 'Member'}</strong>
                    {!isSettlement && tx.splitMembers && tx.splitMembers.length > 0 && (
                      <span> · Split among {tx.splitMembers.length} members</span>
                    )}
                  </div>
                </div>

                {/* Amount and Restore actions */}
                <div className="text-right shrink-0 flex flex-col items-end justify-between self-stretch gap-2">
                  <div className="font-bold text-base sm:text-lg text-text-primary/70 line-through">
                    ₹{tx.amount.toLocaleString('en-IN')}
                  </div>
                  
                  {!isViewer && (
                    <div className="flex items-center gap-1.5">
                      {/* One-tap Restore Button */}
                      {onRestoreExpense && (
                        <button
                          type="button"
                          onClick={() => onRestoreExpense(tx.id)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1 shadow-xs border border-emerald-500/20"
                          title="Restore to active ledger"
                        >
                          <RotateCcw size={12} strokeWidth={2.5} />
                          <span>Restore</span>
                        </button>
                      )}

                      {/* Owner permanent purge button */}
                      {userRole === 'owner' && onPermanentDeleteExpense && (
                        <button
                          type="button"
                          onClick={() => setTxToPurgeForever(tx)}
                          className="p-1.5 text-text-secondary hover:text-google-red hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
                          title="Delete permanently"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ========================================================================= */
        /* ACTIVE TRANSACTIONS VIEW */
        /* ========================================================================= */
        <div className="bg-surface rounded-3xl border border-border divide-y divide-border overflow-hidden">
          {filteredTransactions.map((tx) => {
            const isSettlement = Boolean(tx.isSettlement);
            const payerKey = tx.paidBy || tx.createdBy || '';
            const payerIsMe = isMe(payerKey);
            const payerName = payerIsMe ? 'You' : (tx.paidByName || 'Member');

            // Calculate your own share
            let yourShare = 0;
            const participants = tx.splitMembers || [];
            const count = participants.length > 0 ? participants.length : 1;
            if (tx.splitMode === 'exact' && tx.splits) {
              const myKey = user?.uid || user?.email || '';
              yourShare = tx.splits[myKey] || tx.splits[myNormEmail] || 0;
            } else if (participants.some(p => isMe(p))) {
              yourShare = Math.round((tx.amount / count) * 100) / 100;
            }

            return (
              <div 
                key={tx.id} 
                className="p-3.5 sm:p-4 hover:bg-surface-hover/40 transition-colors flex items-start justify-between gap-3 text-xs sm:text-sm"
              >
                <div className="min-w-0 flex-1">
                  {/* Top title and settlement badge */}
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-text-primary truncate">
                      {isSettlement 
                        ? formatSettlementDisplayTitle(tx, group, user?.uid, user?.email || undefined)
                        : tx.name}
                    </span>
                    {isSettlement && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0 flex items-center gap-1">
                        <CheckCircle2 size={11} />
                        <span>Settlement</span>
                      </span>
                    )}
                  </div>

                  {/* Metadata line */}
                  <div className="text-xs text-text-secondary mt-1 flex items-center gap-1.5 flex-wrap">
                    <span>{tx.date}</span>
                    <span>·</span>
                    <span className={payerIsMe ? 'font-medium text-google-blue' : ''}>
                      Paid by {payerName}
                    </span>
                    {!isSettlement && participants.length > 0 && (
                      <>
                        <span>·</span>
                        <span>Split among {participants.length} {participants.length === 1 ? 'member' : 'members'}</span>
                      </>
                    )}
                  </div>

                  {/* Last Edited by info badge */}
                  {tx.lastEditedByName && (
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-text-secondary">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-surface-hover/80 text-text-secondary/90 border border-border/40 font-medium">
                        <Pencil size={10} className="text-text-secondary/60 shrink-0" />
                        <span>Edited by {tx.lastEditedByName} {tx.lastEditedAt ? `· ${formatTimeAgo(tx.lastEditedAt)}` : ''}</span>
                      </span>
                    </div>
                  )}

                  {/* Subtext info on your position */}
                  {!isSettlement && (
                    <div className="mt-1 text-[11px]">
                      {payerIsMe ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                          You lent ₹{(tx.amount - yourShare).toLocaleString('en-IN')} (your cut: ₹{yourShare})
                        </span>
                      ) : yourShare > 0 ? (
                        <span className="text-google-red font-medium">
                          Your share to pay: ₹{yourShare.toLocaleString('en-IN')}
                        </span>
                      ) : (
                        <span className="text-text-secondary">
                          Not involved in this bill
                        </span>
                      )}
                    </div>
                  )}

                  {tx.note && (
                    <div className="text-[11px] text-text-secondary/80 mt-1 italic truncate">
                      Note: {tx.note}
                    </div>
                  )}
                </div>

                {/* Amount and Action buttons */}
                <div className="text-right shrink-0 flex flex-col items-end justify-between self-stretch">
                  <div className="font-bold text-base sm:text-lg text-text-primary">
                    ₹{tx.amount.toLocaleString('en-IN')}
                  </div>

                  {!isViewer && (
                    <div className="flex items-center gap-1 mt-2">
                      {!isSettlement && (
                        <button
                          type="button"
                          onClick={() => onEditExpense(tx)}
                          className="p-1.5 text-text-secondary hover:text-google-blue hover:bg-surface-hover rounded-lg transition-colors cursor-pointer"
                          title="Edit expense"
                        >
                          <Edit3 size={13} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleInitiateDelete(tx)}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          isSettlement 
                            ? 'text-text-secondary hover:text-amber-600 hover:bg-amber-500/10'
                            : 'text-text-secondary hover:text-google-red hover:bg-red-500/10'
                        }`}
                        title={isSettlement ? "Undo settlement" : "Delete transaction"}
                      >
                        {isSettlement ? <RotateCcw size={13} /> : <Trash2 size={13} />}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Permission Denied Alert Modal */}
      {permissionDeniedMsg && (
        <div className="fixed inset-0 z-70 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-sm rounded-3xl p-5 border border-border shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 font-sans">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <AlertTriangle size={22} strokeWidth={2.2} />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-base font-semibold text-text-primary">
                Permission Restricted
              </h4>
              <p className="text-xs text-text-secondary leading-relaxed">
                {permissionDeniedMsg}
              </p>
            </div>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setPermissionDeniedMsg(null)}
                className="w-full h-10 bg-surface-hover hover:bg-surface-active text-text-primary rounded-full text-xs font-semibold transition-colors cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete / Undo Settlement Confirmation Alert with Context-Aware Rules */}
      {txToDelete && deleteRuleForTarget && (
        <div className="fixed inset-0 z-70 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-sm rounded-3xl p-5 border border-border shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 font-sans">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
              deleteRuleForTarget.isSettlement 
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' 
                : 'bg-red-500/10 text-google-red'
            }`}>
              {deleteRuleForTarget.isSettlement ? (
                <RotateCcw size={22} strokeWidth={2.2} />
              ) : (
                <Trash2 size={22} strokeWidth={2.2} />
              )}
            </div>

            <div className="space-y-1.5">
              <h4 className="text-base font-semibold text-text-primary">
                {deleteRuleForTarget.isSettlement 
                  ? 'Undo Settlement Payment?' 
                  : deleteRuleForTarget.isSettledExpense 
                    ? `Delete Settled Bill "${txToDelete.name}"?` 
                    : `Delete "${txToDelete.name}"?`}
              </h4>
              <p className="text-xs text-text-secondary leading-relaxed">
                {deleteRuleForTarget.isSettlement ? (
                  <>
                    Cancelling this ₹{txToDelete.amount.toLocaleString('en-IN')} payment will re-open the debt between <span className="font-semibold text-text-primary">{txToDelete.paidByName || 'Payer'}</span> and <span className="font-semibold text-text-primary">{txToDelete.settledToName || 'Receiver'}</span>. All bills covered by this payment will return to Open status.
                  </>
                ) : deleteRuleForTarget.isSettledExpense ? (
                  <>
                    This bill of ₹{txToDelete.amount.toLocaleString('en-IN')} was already settled by group members. Deleting it will recalculate all member shares and reopen member balances. It will be moved to Recently Deleted and kept for 30 days.
                  </>
                ) : (
                  <>
                    This bill will be removed and member balances will recalculate automatically. It will be safely kept in <span className="font-medium text-text-primary">Recently Deleted for 30 days</span>.
                  </>
                )}
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setTxToDelete(null)}
                className="flex-1 h-10 border border-border hover:bg-surface-hover text-text-secondary hover:text-text-primary rounded-full text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteExpense(txToDelete.id);
                  setTxToDelete(null);
                }}
                className={`flex-1 h-10 text-white rounded-full text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs ${
                  deleteRuleForTarget.isSettlement 
                    ? 'bg-amber-600 hover:bg-amber-700' 
                    : 'bg-google-red hover:bg-red-700'
                }`}
              >
                {deleteRuleForTarget.isSettlement ? (
                  <>
                    <RotateCcw size={14} strokeWidth={2.2} />
                    <span>Undo Settlement</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} strokeWidth={2} />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Purge Confirmation Modal (For Group Owner only in Trash) */}
      {txToPurgeForever && (
        <div className="fixed inset-0 z-70 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-sm rounded-3xl p-5 border border-border shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 font-sans">
            <div className="w-11 h-11 rounded-2xl bg-red-500/10 text-google-red flex items-center justify-center">
              <Trash2 size={22} strokeWidth={2.2} />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-base font-semibold text-text-primary">
                Delete Permanently?
              </h4>
              <p className="text-xs text-text-secondary leading-relaxed">
                Are you sure you want to permanently erase <span className="font-semibold text-text-primary">"{txToPurgeForever.name}"</span> (₹{txToPurgeForever.amount.toLocaleString('en-IN')})? This entry cannot be restored from trash.
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setTxToPurgeForever(null)}
                className="flex-1 h-10 border border-border hover:bg-surface-hover text-text-secondary hover:text-text-primary rounded-full text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onPermanentDeleteExpense) {
                    onPermanentDeleteExpense(txToPurgeForever.id);
                  }
                  setTxToPurgeForever(null);
                }}
                className="flex-1 h-10 bg-google-red hover:bg-red-700 text-white rounded-full text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
              >
                <Trash2 size={14} strokeWidth={2} />
                <span>Delete Forever</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
