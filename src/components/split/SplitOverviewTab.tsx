import React, { useMemo } from 'react';
import { 
  Users, 
  ArrowUpRight, 
  ArrowDownLeft, 
  CheckCircle2, 
  Plus, 
  ArrowRight, 
  Wallet, 
  TrendingUp,
  Receipt,
  RotateCw,
  Sparkles
} from 'lucide-react';
import type { ExpenseGroup, Transaction, UserRole } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { calculateSplitGroupSummary, type IndividualBalance, type SimplifiedDebt, formatSettlementDisplayTitle } from '../../services/splitService';

interface SplitOverviewTabProps {
  group: ExpenseGroup;
  transactions: Transaction[];
  userRole: UserRole;
  onOpenAddExpense: () => void;
  onOpenSettleModal: (debtorKey?: string, creditorKey?: string, amount?: number) => void;
  onNavigateToTransactions: () => void;
}

export function SplitOverviewTab({
  group,
  transactions,
  userRole,
  onOpenAddExpense,
  onOpenSettleModal,
  onNavigateToTransactions
}: SplitOverviewTabProps) {
  const { user } = useAuth();

  const summary = useMemo(() => {
    return calculateSplitGroupSummary(transactions, group, user?.uid, user?.email || undefined);
  }, [transactions, group, user]);

  const {
    totalGroupSpend,
    yourTotalPaid,
    yourTotalShare,
    yourNetBalance,
    individualBalances,
    simplifiedDebts
  } = summary;

  const isViewer = userRole === 'viewer';
  const recentTransactions = useMemo(() => {
    return transactions.slice(0, 5);
  }, [transactions]);

  return (
    <div className="space-y-4 pb-20 font-sans">
      {/* 1. Hero Net Balance Card (Apple HIG & Material 3) */}
      <div className={`p-5 rounded-3xl border shadow-xs transition-all relative overflow-hidden ${
        yourNetBalance > 0
          ? 'bg-gradient-to-br from-emerald-500/10 via-surface to-surface border-emerald-500/30'
          : yourNetBalance < 0
          ? 'bg-gradient-to-br from-red-500/10 via-surface to-surface border-red-500/30'
          : 'bg-surface border-border'
      }`}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
            <Users size={14} className="text-google-blue" />
            <span>Group Balance Status</span>
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface border border-border text-text-secondary">
            {group.name}
          </span>
        </div>

        <div className="py-1">
          {yourNetBalance > 0 ? (
            <div>
              <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                You are owed overall
              </div>
              <div className="text-3xl sm:text-4xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-baseline gap-1">
                <span>+₹{yourNetBalance.toLocaleString('en-IN')}</span>
              </div>
              <p className="text-xs text-text-secondary mt-1">
                Your group members owe you this amount after deducting your share.
              </p>
            </div>
          ) : yourNetBalance < 0 ? (
            <div>
              <div className="text-xs font-medium text-google-red">
                You owe overall
              </div>
              <div className="text-3xl sm:text-4xl font-bold tracking-tight text-google-red mt-0.5 flex items-baseline gap-1">
                <span>-₹{Math.abs(yourNetBalance).toLocaleString('en-IN')}</span>
              </div>
              <p className="text-xs text-text-secondary mt-1">
                This is your pending cut for expenses paid by others in this ledger.
              </p>
            </div>
          ) : (
            <div>
              <div className="text-xs font-medium text-text-secondary">
                Your Net Balance
              </div>
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary mt-0.5 flex items-center gap-2">
                <CheckCircle2 size={24} className="text-emerald-500" />
                <span>All Settled Up</span>
              </div>
              <p className="text-xs text-text-secondary mt-1">
                No pending debts. You don't owe anyone and no one owes you!
              </p>
            </div>
          )}
        </div>

        {/* Action Bar */}
        {!isViewer && (
          <div className="flex items-center gap-2 pt-3 mt-3 border-t border-border/70">
            <button
              type="button"
              onClick={onOpenAddExpense}
              className="flex-1 h-9.5 px-3.5 rounded-xl bg-google-blue hover:bg-blue-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-colors select-none"
            >
              <Plus size={15} />
              <span>Add Expense</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenSettleModal()}
              className="h-9.5 px-3.5 rounded-xl bg-surface hover:bg-surface-hover border border-border text-text-primary font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors select-none shrink-0"
            >
              <RotateCw size={13} />
              <span>Settle Up</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. Key Metrics Row */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="p-3 rounded-2xl bg-surface border border-border">
          <div className="text-[11px] font-medium text-text-secondary truncate">
            Total Spend
          </div>
          <div className="text-sm sm:text-base font-bold text-text-primary mt-0.5">
            ₹{totalGroupSpend.toLocaleString('en-IN')}
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-surface border border-border">
          <div className="text-[11px] font-medium text-text-secondary truncate">
            You Paid
          </div>
          <div className="text-sm sm:text-base font-bold text-google-blue mt-0.5">
            ₹{yourTotalPaid.toLocaleString('en-IN')}
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-surface border border-border">
          <div className="text-[11px] font-medium text-text-secondary truncate">
            Your Cut
          </div>
          <div className="text-sm sm:text-base font-bold text-purple-600 dark:text-purple-400 mt-0.5">
            ₹{yourTotalShare.toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      {/* 3. Individual Member Balances (Who owes whom) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Member Balances
          </span>
          <span className="text-xs text-text-secondary">
            {individualBalances.length} other {individualBalances.length === 1 ? 'member' : 'members'}
          </span>
        </div>

        {individualBalances.length === 0 ? (
          <div className="p-4 rounded-2xl bg-surface border border-border text-center text-xs text-text-secondary">
            No other members in this group yet. Invite friends via the ledger menu to start splitting expenses!
          </div>
        ) : (
          <div className="bg-surface rounded-2xl border border-border divide-y divide-border overflow-hidden">
            {individualBalances.map((m) => {
              const owesYou = m.netOwed > 0.01;
              const youOwe = m.netOwed < -0.01;
              const absVal = Math.abs(m.netOwed);

              return (
                <div key={m.memberKey} className="p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-surface-hover border border-border flex items-center justify-center font-semibold text-xs text-text-primary shrink-0">
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-xs sm:text-sm text-text-primary truncate">
                        {m.name}
                      </div>
                      <div className="text-[11px] text-text-secondary truncate">
                        {m.email || 'Member'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      {owesYou ? (
                        <div>
                          <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            owes you
                          </div>
                          <div className="font-bold text-xs sm:text-sm text-emerald-600 dark:text-emerald-400">
                            ₹{absVal.toLocaleString('en-IN')}
                          </div>
                        </div>
                      ) : youOwe ? (
                        <div>
                          <div className="text-[11px] font-medium text-google-red">
                            you owe
                          </div>
                          <div className="font-bold text-xs sm:text-sm text-google-red">
                            ₹{absVal.toLocaleString('en-IN')}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-text-secondary font-medium">
                          Settled
                        </div>
                      )}
                    </div>

                    {!isViewer && (owesYou || youOwe) && (
                      <button
                        type="button"
                        onClick={() => {
                          const myKey = user?.uid || '';
                          if (owesYou) {
                            // m paid me
                            onOpenSettleModal(m.memberKey, myKey, absVal);
                          } else {
                            // I paid m
                            onOpenSettleModal(myKey, m.memberKey, absVal);
                          }
                        }}
                        className="px-2.5 py-1 rounded-xl bg-surface-hover hover:bg-surface-active border border-border text-xs font-semibold text-text-primary cursor-pointer transition-colors"
                      >
                        Settle
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Smart Debt Simplification (Min-Cash-Flow) */}
      {simplifiedDebts.length > 0 && (
        <div className="p-4 rounded-2xl bg-surface border border-border space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles size={14} className="text-amber-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Optimal Debt Settlement
              </span>
            </div>
            <span className="text-[11px] text-text-secondary">
              {simplifiedDebts.length} {simplifiedDebts.length === 1 ? 'transfer' : 'transfers'} to clear all debts
            </span>
          </div>

          <div className="space-y-1.5">
            {simplifiedDebts.map((d, i) => (
              <div 
                key={i}
                className="p-2.5 rounded-xl bg-surface-hover/50 border border-border/80 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-semibold text-text-primary truncate">{d.fromName}</span>
                  <span className="text-text-secondary text-[11px]">pays</span>
                  <span className="font-semibold text-text-primary truncate">{d.toName}</span>
                </div>
                <div className="font-bold text-google-blue shrink-0 ml-2">
                  ₹{d.amount.toLocaleString('en-IN')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Recent Split Activity Preview */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Recent Activity
          </span>
          {transactions.length > 0 && (
            <button
              type="button"
              onClick={onNavigateToTransactions}
              className="text-xs text-google-blue hover:underline cursor-pointer font-medium flex items-center gap-1"
            >
              <span>View All ({transactions.length})</span>
              <ArrowRight size={12} />
            </button>
          )}
        </div>

        {recentTransactions.length === 0 ? (
          <div className="p-6 rounded-2xl bg-surface border border-border text-center space-y-2">
            <Receipt size={24} className="text-text-secondary/60 mx-auto" />
            <div className="text-xs text-text-secondary">
              No split bills or payments recorded in this ledger yet.
            </div>
            {!isViewer && (
              <button
                type="button"
                onClick={onOpenAddExpense}
                className="px-4 py-1.5 rounded-full bg-google-blue text-white text-xs font-semibold hover:bg-blue-700 transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus size={13} />
                <span>Add First Split Expense</span>
              </button>
            )}
          </div>
        ) : (
          <div className="bg-surface rounded-2xl border border-border divide-y divide-border overflow-hidden">
            {recentTransactions.map((tx) => {
              const isSettlement = Boolean(tx.isSettlement);
              const payer = tx.paidByName || 'Member';

              return (
                <div key={tx.id} className="p-3 flex items-center justify-between gap-3 text-xs sm:text-sm">
                  <div className="min-w-0">
                    <div className="font-semibold text-text-primary truncate flex items-center gap-1.5">
                      {isSettlement ? (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 size={13} />
                          <span>{formatSettlementDisplayTitle(tx, group, user?.uid, user?.email || undefined)}</span>
                        </span>
                      ) : (
                        <span>{tx.name}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-text-secondary mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>{tx.date}</span>
                      <span>·</span>
                      <span>Paid by {payer}</span>
                      {tx.splitMembers && tx.splitMembers.length > 0 && !isSettlement && (
                        <>
                          <span>·</span>
                          <span>{tx.splitMembers.length} {tx.splitMembers.length === 1 ? 'person' : 'people'}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-bold text-text-primary">
                      ₹{tx.amount.toLocaleString('en-IN')}
                    </div>
                    {isSettlement ? (
                      <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        Settled
                      </div>
                    ) : (
                      <div className="text-[10px] text-text-secondary">
                        Total bill
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
