import type { User } from 'firebase/auth';
import type { ExpenseGroup, Transaction, GroupMember, UserRole } from '../types';
import { addExpenseToGroup, updateExpenseInGroup, getGroupExpensesOnce } from './expenseService';

export interface IndividualBalance {
  memberKey: string;
  name: string;
  email?: string;
  netOwed: number; // Positive: they owe current user. Negative: current user owes them.
  groupNet?: number; // Member's total net balance across the group
}

export interface SimplifiedDebt {
  fromKey: string;
  fromName: string;
  toKey: string;
  toName: string;
  amount: number;
}

export interface CalculationLineItem {
  id: string;
  date?: string;
  expenseName: string;
  type: 'you_owed_them' | 'they_owed_you' | 'you_paid_them' | 'they_paid_you';
  description: string;
  amount: number;
  isSettled?: boolean;
}

export interface SimplifiedRouteContext {
  isSimplifiedRoute: boolean;
  debtorName: string;
  creditorName: string;
  debtorOverallNet: number;
  creditorOverallNet: number;
  debtorContributingExpenses: { id: string; name: string; amount: number; share: number; date?: string; paidByName?: string }[];
  creditorContributingExpenses: { id: string; name: string; amount: number; share: number; date?: string; paidByName?: string }[];
  intermediaryChain?: {
    intermediaryName: string;
    debtorBillName: string;
    creditorBillName: string;
    amount: number;
  };
}

export interface AppliedSettlementItem {
  id: string;
  date?: string;
  description: string;
  amount: number;
  fromName: string;
  toName: string;
}

export interface PairwiseCalculationBreakdown {
  memberA: { key: string; name: string };
  memberB: { key: string; name: string };
  activeItems: CalculationLineItem[];
  settledItems: CalculationLineItem[];
  appliedSettlements?: AppliedSettlementItem[];
  items: CalculationLineItem[];
  totalAOwedB: number;
  totalBOwedA: number;
  paymentsAToB: number;
  paymentsBToA: number;
  directNet: number; // positive: A owes B; negative: B owes A
  simplifiedAmount?: number;
  simplifiedRoute?: SimplifiedRouteContext;
}

export interface SplitGroupSummary {
  totalGroupSpend: number;
  yourTotalPaid: number;
  yourTotalShare: number;
  yourNetBalance: number; // Positive: you are owed. Negative: you owe.
  individualBalances: IndividualBalance[];
  simplifiedDebts: SimplifiedDebt[];
}

/**
 * Resolves the real canonical display name for a group member.
 * NEVER returns the relative word 'You' - suitable for persistent storage and cross-user records.
 */
export function getCanonicalMemberName(
  memberKey: string,
  group?: ExpenseGroup,
  currentUid?: string,
  currentEmail?: string,
  currentUser?: User | null
): string {
  if (!memberKey) return 'Member';
  const normKey = memberKey.toLowerCase().trim();
  const currentNormEmail = (currentEmail || currentUser?.email || '').toLowerCase().trim();
  const effectiveUid = (currentUid || currentUser?.uid || '').toLowerCase().trim();

  // 1. Check if memberKey corresponds to current user
  const isMe = (effectiveUid && normKey === effectiveUid) ||
               (currentNormEmail && normKey === currentNormEmail) ||
               normKey === 'you' || normKey === 'guest' || normKey === 'local_user';

  if (isMe) {
    if (currentUser?.displayName && currentUser.displayName.trim() && currentUser.displayName.trim().toLowerCase() !== 'you') {
      return currentUser.displayName.trim();
    }
    if (group?.members) {
      const myMem = group.members[memberKey] || (effectiveUid ? group.members[effectiveUid] : undefined) || (currentNormEmail ? group.members[currentNormEmail] : undefined);
      if (myMem?.displayName && myMem.displayName.trim().toLowerCase() !== 'you') {
        return myMem.displayName.trim();
      }
    }
    if (currentUser?.email) {
      return currentUser.email.split('@')[0];
    }
    if (currentEmail) {
      return currentEmail.split('@')[0];
    }
  }

  // 2. Look in group.members
  if (group?.members) {
    const mem = group.members[memberKey] || group.members[normKey];
    if (mem?.displayName && mem.displayName.trim().toLowerCase() !== 'you') {
      return mem.displayName.trim();
    }
    if (mem?.email) {
      return mem.email.split('@')[0];
    }

    // Search across all members by key or email
    const found = Object.values(group.members).find(m => 
      (m.email && m.email.toLowerCase().trim() === normKey) ||
      (m.displayName && m.displayName.toLowerCase().trim() === normKey)
    );
    if (found?.displayName && found.displayName.trim().toLowerCase() !== 'you') {
      return found.displayName.trim();
    }
    if (found?.email) {
      return found.email.split('@')[0];
    }
  }

  // 3. If key is an email
  if (normKey.includes('@')) {
    return normKey.split('@')[0];
  }

  return 'Member';
}

/**
 * Resolves a dynamic, viewer-aware display title for a settlement transaction.
 * - If current viewer is payer: "You paid [Recipient]"
 * - If current viewer is recipient: "[Payer] paid You"
 * - If current viewer is third party: "[Payer] paid [Recipient]"
 *
 * Robustly handles legacy records where the word "You" was erroneously saved into Firestore
 * or tx.paidByName / tx.settledToName / tx.name.
 */
export function formatSettlementDisplayTitle(
  tx: Transaction,
  group?: ExpenseGroup,
  currentUid?: string,
  currentEmail?: string
): string {
  const payerKey = tx.paidBy || tx.createdBy || '';
  const receiverKey = tx.settledTo || '';

  const effectiveUid = (currentUid || (group?.createdBy === 'guest' || group?.id.startsWith('local_') ? 'guest' : '')).toLowerCase().trim();
  const myEmail = (currentEmail || '').toLowerCase().trim();

  const isMe = (keyOrEmail?: string) => {
    if (!keyOrEmail) return false;
    const norm = keyOrEmail.toLowerCase().trim();
    if (!currentUid && !currentEmail && (norm === 'guest' || norm === 'local_user' || norm === 'you')) return true;
    return (effectiveUid && norm === effectiveUid) || (myEmail && norm === myEmail);
  };

  const isPayerMe = isMe(payerKey);
  const isReceiverMe = isMe(receiverKey);

  // 1. Resolve Payer Name
  let payerName = 'Member';
  if (isPayerMe) {
    payerName = 'You';
  } else {
    // If tx.paidByName exists and is NOT literally 'you' (case insensitive)
    if (tx.paidByName && tx.paidByName.trim().toLowerCase() !== 'you') {
      payerName = tx.paidByName.trim();
    } else if (payerKey) {
      const canonical = getCanonicalMemberName(payerKey, group, currentUid, currentEmail);
      if (canonical && canonical.toLowerCase() !== 'you' && canonical !== 'Member') {
        payerName = canonical;
      } else {
        const fallback = getMemberDisplayName(payerKey, group, currentUid, currentEmail);
        payerName = fallback.toLowerCase() === 'you' ? 'Member' : fallback;
      }
    }
  }

  // 2. Resolve Receiver Name
  let receiverName = 'Member';
  if (isReceiverMe) {
    receiverName = 'You';
  } else {
    // If tx.settledToName exists and is NOT literally 'you' (case insensitive)
    if (tx.settledToName && tx.settledToName.trim().toLowerCase() !== 'you') {
      receiverName = tx.settledToName.trim();
    } else if (receiverKey) {
      const canonical = getCanonicalMemberName(receiverKey, group, currentUid, currentEmail);
      if (canonical && canonical.toLowerCase() !== 'you' && canonical !== 'Member') {
        receiverName = canonical;
      } else {
        const fallback = getMemberDisplayName(receiverKey, group, currentUid, currentEmail);
        receiverName = fallback.toLowerCase() === 'you' ? 'Member' : fallback;
      }
    }
  }

  // 3. Legacy string salvage: if payerName or receiverName is still 'Member', inspect tx.name
  if ((payerName === 'Member' || receiverName === 'Member') && tx.name) {
    const rawClean = tx.name.replace(/^Settlement:\s*/i, '').trim();
    const parts = rawClean.split(/\s+paid\s+/i);
    if (parts.length === 2) {
      const [rawPayer, rawReceiver] = parts;
      if (payerName === 'Member') {
        if (isPayerMe) {
          payerName = 'You';
        } else if (rawPayer.trim().toLowerCase() !== 'you') {
          payerName = rawPayer.trim();
        } else if (isReceiverMe && group?.members) {
          const otherMember = Object.values(group.members).find(m => !isMe(m.uid) && !isMe(m.email));
          if (otherMember?.displayName) {
            payerName = otherMember.displayName;
          }
        }
      }

      if (receiverName === 'Member') {
        if (isReceiverMe) {
          receiverName = 'You';
        } else if (rawReceiver.trim().toLowerCase() !== 'you') {
          receiverName = rawReceiver.trim();
        } else if (isPayerMe && group?.members) {
          const otherMember = Object.values(group.members).find(m => !isMe(m.uid) && !isMe(m.email));
          if (otherMember?.displayName) {
            receiverName = otherMember.displayName;
          }
        }
      }
    }
  }

  // Final sanity checks: ensure "You" never appears for a counterparty
  if (!isPayerMe && payerName.toLowerCase() === 'you') {
    payerName = 'Member';
  }
  if (!isReceiverMe && receiverName.toLowerCase() === 'you') {
    receiverName = 'Member';
  }

  return `${payerName} paid ${receiverName}`;
}

/**
 * Resolves a human-readable name for a group member.
 */
export function getMemberDisplayName(
  memberKey: string,
  group?: ExpenseGroup,
  currentUid?: string,
  currentEmail?: string
): string {
  const normKey = memberKey.toLowerCase().trim();
  const currentNormEmail = (currentEmail || '').toLowerCase().trim();
  const effectiveUid = (currentUid || (group?.createdBy === 'guest' || group?.id.startsWith('local_') ? 'guest' : '')).toLowerCase();

  if (
    (effectiveUid && normKey === effectiveUid) ||
    (currentNormEmail && normKey === currentNormEmail) ||
    (!currentUid && !currentEmail && (normKey === 'guest' || normKey === 'you' || normKey === 'local_user'))
  ) {
    return 'You';
  }

  // Look in group.members
  if (group.members) {
    const mem = group.members[memberKey] || group.members[normKey];
    if (mem?.displayName) return mem.displayName;
    if (mem?.email) return mem.email.split('@')[0];
  }

  // If key is an email
  if (normKey.includes('@')) {
    return normKey.split('@')[0];
  }

  return 'Member';
}

/**
 * Extracts a deduplicated list of active members in a group.
 */
export function getGroupMembersList(
  group: ExpenseGroup,
  currentUid?: string,
  currentEmail?: string
): { key: string; name: string; email: string; isCurrentUser: boolean; upiId?: string; phoneNumber?: string }[] {
  const list: { key: string; name: string; email: string; isCurrentUser: boolean; upiId?: string; phoneNumber?: string }[] = [];
  const seen = new Set<string>();

  const effectiveUid = currentUid || (group.createdBy === 'guest' || group.id.startsWith('local_') ? 'guest' : undefined);
  const currentNormEmail = (currentEmail || '').toLowerCase().trim();

  // Ensure current user is in list if not already
  if (effectiveUid || currentNormEmail) {
    const myKey = effectiveUid || currentNormEmail;
    const myEmail = currentNormEmail;
    const myMem = group.members?.[myKey];
    seen.add(myKey.toLowerCase());
    if (myEmail) seen.add(myEmail);
    list.push({
      key: myKey,
      name: 'You',
      email: myEmail,
      isCurrentUser: true,
      upiId: myMem?.upiId,
      phoneNumber: myMem?.phoneNumber
    });
  }

  if (group.members) {
    Object.entries(group.members).forEach(([key, mem]) => {
      const normEmail = (mem.email || '').toLowerCase().trim();
      const normKey = key.toLowerCase();
      if (!seen.has(normKey) && (!normEmail || !seen.has(normEmail))) {
        if (normKey) seen.add(normKey);
        if (normEmail) seen.add(normEmail);
        const isMe = (effectiveUid && normKey === effectiveUid.toLowerCase()) || 
                     (currentNormEmail && normEmail === currentNormEmail) ||
                     (!currentUid && !currentEmail && (normKey === 'guest' || normKey === 'you'));
        list.push({
          key,
          name: isMe ? 'You' : (mem.displayName || mem.email?.split('@')[0] || 'Member'),
          email: mem.email || '',
          isCurrentUser: Boolean(isMe),
          upiId: mem.upiId,
          phoneNumber: mem.phoneNumber
        });
      }
    });
  }

  return list;
}

/**
 * Calculates net balances, individual member positions, and simplified debt transactions.
 */
export function calculateSplitGroupSummary(
  transactions: Transaction[],
  group: ExpenseGroup,
  currentUid?: string,
  currentEmail?: string
): SplitGroupSummary {
  const effectiveUid = currentUid || (group.createdBy === 'guest' || group.id.startsWith('local_') ? 'guest' : undefined);
  const myNormKey = (effectiveUid || '').toLowerCase();
  const myNormEmail = (currentEmail || '').toLowerCase().trim();

  const isMe = (keyOrEmail?: string) => {
    if (!keyOrEmail) return false;
    const norm = keyOrEmail.toLowerCase().trim();
    if (!currentUid && !currentEmail && (norm === 'guest' || norm === 'local_user' || norm === 'you')) return true;
    return (myNormKey && norm === myNormKey) || (myNormEmail && norm === myNormEmail);
  };

  // Pairwise net balances: netMatrix[A][B] > 0 means B owes A
  const netMatrix: Record<string, Record<string, number>> = {};
  // Overall net balance per person: overallNet[X] > 0 means X is owed money in total
  const overallNet: Record<string, number> = {};

  const ensureMember = (key: string) => {
    if (!netMatrix[key]) netMatrix[key] = {};
    if (overallNet[key] === undefined) overallNet[key] = 0;
  };

  const allMembers = getGroupMembersList(group, currentUid, currentEmail);
  allMembers.forEach(m => ensureMember(m.key));

  let totalGroupSpend = 0;
  let yourTotalPaid = 0;
  let yourTotalShare = 0;

  const activeTransactions = transactions.filter(tx => !tx.isDeleted);

  activeTransactions.forEach((tx) => {
    // 1. Settlement Payments ("A paid B ₹X")
    if (tx.isSettlement) {
      const payer = tx.paidBy || tx.createdBy || '';
      const receiver = tx.settledTo || '';
      const amt = tx.amount || 0;

      if (!payer || !receiver || amt <= 0) return;

      ensureMember(payer);
      ensureMember(receiver);

      // Payer's debt to receiver decreases by amt
      netMatrix[receiver][payer] = (netMatrix[receiver][payer] || 0) - amt;
      netMatrix[payer][receiver] = (netMatrix[payer][receiver] || 0) + amt;

      overallNet[payer] = (overallNet[payer] || 0) + amt;
      overallNet[receiver] = (overallNet[receiver] || 0) - amt;

      if (isMe(payer)) {
        yourTotalPaid += amt;
      }
      return;
    }

    // 2. Standard Split Expense
    const payer = tx.paidBy || tx.createdBy || '';
    const totalAmount = tx.amount || 0;
    if (totalAmount <= 0) return;

    totalGroupSpend += totalAmount;
    if (isMe(payer)) {
      yourTotalPaid += totalAmount;
    }

    ensureMember(payer);

    // Identify participants
    const participants = tx.splitMembers && tx.splitMembers.length > 0 
      ? tx.splitMembers 
      : allMembers.map(m => m.key);

    const count = participants.length > 0 ? participants.length : 1;

    participants.forEach((participantKey) => {
      ensureMember(participantKey);

      let cut = 0;
      if (tx.splitMode === 'exact' && tx.splits && tx.splits[participantKey] !== undefined) {
        cut = tx.splits[participantKey];
      } else {
        cut = Math.round((totalAmount / count) * 100) / 100;
      }

      if (isMe(participantKey)) {
        yourTotalShare += cut;
      }

      // If participant is NOT the payer, participant owes payer 'cut'
      if (participantKey !== payer) {
        netMatrix[payer][participantKey] = (netMatrix[payer][participantKey] || 0) + cut;
        netMatrix[participantKey][payer] = (netMatrix[participantKey][payer] || 0) - cut;

        overallNet[payer] = (overallNet[payer] || 0) + cut;
        overallNet[participantKey] = (overallNet[participantKey] || 0) - cut;
      }
    });
  });

  // Calculate individual balances from current user's perspective
  const currentKey = allMembers.find(m => m.isCurrentUser)?.key || currentUid || currentEmail || '';
  const individualBalances: IndividualBalance[] = [];

  allMembers.forEach((member) => {
    if (member.isCurrentUser) return;

    // How much does 'member' owe current user?
    const balance = netMatrix[currentKey]?.[member.key] || 0;

    // How much does 'member' owe/is owed across the entire group?
    let memberGroupNet = 0;
    Object.entries(overallNet).forEach(([k, val]) => {
      if (matchMemberKeys(k, member.key, group, currentUid, currentEmail)) {
        memberGroupNet += val;
      }
    });

    individualBalances.push({
      memberKey: member.key,
      name: member.name,
      email: member.email,
      netOwed: Math.round(balance * 100) / 100,
      groupNet: Math.round(memberGroupNet * 100) / 100
    });
  });

  // Calculate simplified debts across the group (Min-Cash-Flow algorithm)
  const simplifiedDebts = simplifyDebts(overallNet, group, currentUid, currentEmail);

  // Current user's net overall balance
  const yourNetBalance = Math.round((overallNet[currentKey] || 0) * 100) / 100;

  return {
    totalGroupSpend: Math.round(totalGroupSpend * 100) / 100,
    yourTotalPaid: Math.round(yourTotalPaid * 100) / 100,
    yourTotalShare: Math.round(yourTotalShare * 100) / 100,
    yourNetBalance,
    individualBalances,
    simplifiedDebts
  };
}

/**
 * Greedily simplifies circular debts into the minimum number of direct transactions.
 */
function simplifyDebts(
  overallNet: Record<string, number>,
  group: ExpenseGroup,
  currentUid?: string,
  currentEmail?: string
): SimplifiedDebt[] {
  const debtors: { key: string; amount: number }[] = [];
  const creditors: { key: string; amount: number }[] = [];

  Object.entries(overallNet).forEach(([key, net]) => {
    const rounded = Math.round(net * 100) / 100;
    if (rounded < -0.01) {
      debtors.push({ key, amount: -rounded });
    } else if (rounded > 0.01) {
      creditors.push({ key, amount: rounded });
    }
  });

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const debts: SimplifiedDebt[] = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];

    const settledAmt = Math.min(debtor.amount, creditor.amount);
    if (settledAmt > 0.01) {
      debts.push({
        fromKey: debtor.key,
        fromName: getMemberDisplayName(debtor.key, group, currentUid, currentEmail),
        toKey: creditor.key,
        toName: getMemberDisplayName(creditor.key, group, currentUid, currentEmail),
        amount: Math.round(settledAmt * 100) / 100
      });
    }

    debtor.amount -= settledAmt;
    creditor.amount -= settledAmt;

    if (debtor.amount <= 0.01) dIdx++;
    if (creditor.amount <= 0.01) cIdx++;
  }

  return debts;
}

/**
 * Checks if two keys reference the same member.
 */
export function matchMemberKeys(
  key1?: string,
  key2?: string,
  group?: ExpenseGroup,
  currentUid?: string,
  currentEmail?: string
): boolean {
  if (!key1 || !key2) return false;
  const norm1 = key1.toLowerCase().trim();
  const norm2 = key2.toLowerCase().trim();
  if (norm1 === norm2) return true;

  const effectiveUid = (currentUid || (group?.createdBy === 'guest' || group?.id.startsWith('local_') ? 'guest' : '')).toLowerCase();
  const myEmail = (currentEmail || '').toLowerCase().trim();
  const isMe1 = norm1 === effectiveUid || norm1 === myEmail || norm1 === 'guest' || norm1 === 'you' || norm1 === 'local_user';
  const isMe2 = norm2 === effectiveUid || norm2 === myEmail || norm2 === 'guest' || norm2 === 'you' || norm2 === 'local_user';
  if (isMe1 && isMe2) return true;

  if (group?.members) {
    const mem1 = group.members[key1] || group.members[norm1];
    const mem2 = group.members[key2] || group.members[norm2];
    if (mem1 && mem2 && mem1 === mem2) return true;

    if (mem1?.email && mem1.email.toLowerCase().trim() === norm2) return true;
    if (mem2?.email && mem2.email.toLowerCase().trim() === norm1) return true;
    if (mem1?.email && mem2?.email && mem1.email.toLowerCase().trim() === mem2.email.toLowerCase().trim()) return true;

    if (mem1?.displayName && mem1.displayName.toLowerCase().trim() === norm2) return true;
    if (mem2?.displayName && mem2.displayName.toLowerCase().trim() === norm1) return true;
    if (mem1?.displayName && mem2?.displayName && mem1.displayName.toLowerCase().trim() === mem2.displayName.toLowerCase().trim()) return true;

    // Search across all group members for matching email or displayName
    const memberObj1 = mem1 || Object.values(group.members).find(m => 
      (m.email && m.email.toLowerCase().trim() === norm1) || 
      (m.displayName && m.displayName.toLowerCase().trim() === norm1)
    );
    const memberObj2 = mem2 || Object.values(group.members).find(m => 
      (m.email && m.email.toLowerCase().trim() === norm2) || 
      (m.displayName && m.displayName.toLowerCase().trim() === norm2)
    );

    if (memberObj1 && memberObj2 && (
      memberObj1 === memberObj2 ||
      (memberObj1.email && memberObj2.email && memberObj1.email.toLowerCase().trim() === memberObj2.email.toLowerCase().trim()) ||
      (memberObj1.displayName && memberObj2.displayName && memberObj1.displayName.toLowerCase().trim() === memberObj2.displayName.toLowerCase().trim())
    )) {
      return true;
    }
  }

  return false;
}

/**
 * Computes an itemized line-by-line calculation breakdown between two members.
 * Shows exactly what Member A owed Member B, what Member B owed Member A, any settlements,
 * and the final net calculation.
 */
export function getPairwiseCalculationBreakdown(
  transactions: Transaction[],
  group: ExpenseGroup,
  memberAKey: string,
  memberBKey: string,
  currentUid?: string,
  currentEmail?: string,
  simplifiedAmount?: number
): PairwiseCalculationBreakdown {
  const nameA = getMemberDisplayName(memberAKey, group, currentUid, currentEmail);
  const nameB = getMemberDisplayName(memberBKey, group, currentUid, currentEmail);
  const allMembers = getGroupMembersList(group, currentUid, currentEmail);

  // Authoritative status map (handles FIFO settlement matching across group)
  const statusMap = getReconciledExpenseStatusMap(transactions, group, currentUid, currentEmail);

  interface RawDueItem {
    id: string;
    date?: string;
    name: string;
    type: 'a_owes_b' | 'b_owes_a';
    amount: number;
    settled: boolean;
  }
  const rawExpenses: RawDueItem[] = [];
  const settledItems: CalculationLineItem[] = [];
  const appliedSettlements: AppliedSettlementItem[] = [];

  let paymentsAToB = 0;
  let paymentsBToA = 0;

  const normA = memberAKey.toLowerCase().trim();
  const normB = memberBKey.toLowerCase().trim();

  const activeTransactions = transactions.filter(tx => !tx.isDeleted);

  activeTransactions.forEach((tx) => {
    // 1. Settlement payments between A and B
    if (tx.isSettlement) {
      const payer = tx.paidBy || tx.createdBy || '';
      const receiver = tx.settledTo || '';
      const amt = tx.amount || 0;
      if (amt <= 0) return;

      if (matchMemberKeys(payer, memberAKey, group, currentUid, currentEmail) &&
          matchMemberKeys(receiver, memberBKey, group, currentUid, currentEmail)) {
        paymentsAToB += amt;
        appliedSettlements.push({
          id: tx.id,
          date: tx.date,
          description: `${nameA} paid ${nameB}`,
          amount: amt,
          fromName: nameA,
          toName: nameB
        });
        settledItems.push({
          id: tx.id,
          date: tx.date,
          expenseName: tx.name.replace('Settlement: ', ''),
          type: nameA === 'You' ? 'you_paid_them' : 'they_paid_you',
          description: `${nameA} paid ${nameB} (Settlement)`,
          amount: amt,
          isSettled: true
        });
      } else if (matchMemberKeys(payer, memberBKey, group, currentUid, currentEmail) &&
                 matchMemberKeys(receiver, memberAKey, group, currentUid, currentEmail)) {
        paymentsBToA += amt;
        appliedSettlements.push({
          id: tx.id,
          date: tx.date,
          description: `${nameB} paid ${nameA}`,
          amount: amt,
          fromName: nameB,
          toName: nameA
        });
        settledItems.push({
          id: tx.id,
          date: tx.date,
          expenseName: tx.name.replace('Settlement: ', ''),
          type: nameB === 'You' ? 'you_paid_them' : 'they_paid_you',
          description: `${nameB} paid ${nameA} (Settlement)`,
          amount: amt,
          isSettled: true
        });
      }
      return;
    }

    // 2. Regular split expense
    const payer = tx.paidBy || tx.createdBy || '';
    const totalAmount = tx.amount || 0;
    if (totalAmount <= 0) return;

    const participants = tx.splitMembers && tx.splitMembers.length > 0
      ? tx.splitMembers
      : allMembers.map(m => m.key);
    const count = participants.length > 0 ? participants.length : 1;

    const aParticipates = participants.some(p => matchMemberKeys(p, memberAKey, group, currentUid, currentEmail));
    const bParticipates = participants.some(p => matchMemberKeys(p, memberBKey, group, currentUid, currentEmail));

    let cutA = 0;
    if (aParticipates) {
      if (tx.splitMode === 'exact' && tx.splits) {
        const matchingKey = Object.keys(tx.splits).find(k => matchMemberKeys(k, memberAKey, group, currentUid, currentEmail));
        cutA = matchingKey ? (tx.splits[matchingKey] || 0) : Math.round((totalAmount / count) * 100) / 100;
      } else {
        cutA = Math.round((totalAmount / count) * 100) / 100;
      }
    }

    let cutB = 0;
    if (bParticipates) {
      if (tx.splitMode === 'exact' && tx.splits) {
        const matchingKey = Object.keys(tx.splits).find(k => matchMemberKeys(k, memberBKey, group, currentUid, currentEmail));
        cutB = matchingKey ? (tx.splits[matchingKey] || 0) : Math.round((totalAmount / count) * 100) / 100;
      } else {
        cutB = Math.round((totalAmount / count) * 100) / 100;
      }
    }

    const isAShareSettled = Boolean(
      tx.settled ||
      (tx.settledMembers && tx.settledMembers.some(m => matchMemberKeys(m, memberAKey, group, currentUid, currentEmail))) ||
      statusMap[tx.id]?.isFullySettled ||
      statusMap[tx.id]?.settledMemberKeys?.has(normA)
    );

    const isBShareSettled = Boolean(
      tx.settled ||
      (tx.settledMembers && tx.settledMembers.some(m => matchMemberKeys(m, memberBKey, group, currentUid, currentEmail))) ||
      statusMap[tx.id]?.isFullySettled ||
      statusMap[tx.id]?.settledMemberKeys?.has(normB)
    );

    // Case 1: B paid, and A participated -> A owes B cutA
    if (matchMemberKeys(payer, memberBKey, group, currentUid, currentEmail) && aParticipates && cutA > 0) {
      rawExpenses.push({
        id: tx.id,
        date: tx.date,
        name: tx.name,
        type: 'a_owes_b',
        amount: cutA,
        settled: isAShareSettled
      });
    }

    // Case 2: A paid, and B participated -> B owes A cutB
    if (matchMemberKeys(payer, memberAKey, group, currentUid, currentEmail) && bParticipates && cutB > 0) {
      rawExpenses.push({
        id: tx.id,
        date: tx.date,
        name: tx.name,
        type: 'b_owes_a',
        amount: cutB,
        settled: isBShareSettled
      });
    }
  });

  // Reconcile settlement payments against raw expenses chronologically (FIFO)
  rawExpenses.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  let remainingPaidBToA = paymentsBToA;
  let remainingPaidAToB = paymentsAToB;

  const activeItems: CalculationLineItem[] = [];

  rawExpenses.forEach((exp) => {
    if (exp.settled) {
      settledItems.push({
        id: exp.id,
        date: exp.date,
        expenseName: exp.name,
        type: exp.type === 'a_owes_b' 
          ? (nameA === 'You' ? 'you_owed_them' : 'they_owed_you')
          : (nameA === 'You' ? 'they_owed_you' : 'you_owed_them'),
        description: exp.type === 'a_owes_b' 
          ? `${nameB} paid · ${nameA === 'You' ? 'Your' : nameA + "'s"} share: ₹${exp.amount.toLocaleString('en-IN')}`
          : `${nameA} paid · ${nameB === 'You' ? 'Your' : nameB + "'s"} share: ₹${exp.amount.toLocaleString('en-IN')}`,
        amount: exp.amount,
        isSettled: true
      });
      return;
    }

    // If B owes A, and B already paid A via settlement payments, offset FIFO
    if (exp.type === 'b_owes_a' && remainingPaidBToA > 0) {
      const offset = Math.min(exp.amount, remainingPaidBToA);
      remainingPaidBToA = Math.round((remainingPaidBToA - offset) * 100) / 100;

      if (offset >= exp.amount) {
        settledItems.push({
          id: exp.id,
          date: exp.date,
          expenseName: exp.name,
          type: nameA === 'You' ? 'they_owed_you' : 'you_owed_them',
          description: `${nameA} paid · ${nameB === 'You' ? 'Your' : nameB + "'s"} share: ₹${exp.amount.toLocaleString('en-IN')} (Settled by payment)`,
          amount: exp.amount,
          isSettled: true
        });
        return;
      } else {
        const remaining = Math.round((exp.amount - offset) * 100) / 100;
        activeItems.push({
          id: exp.id,
          date: exp.date,
          expenseName: exp.name,
          type: nameA === 'You' ? 'they_owed_you' : 'you_owed_them',
          description: `${nameA} paid · ${nameB === 'You' ? 'Your' : nameB + "'s"} share: ₹${exp.amount.toLocaleString('en-IN')} (₹${offset.toLocaleString('en-IN')} settled, ₹${remaining.toLocaleString('en-IN')} remaining)`,
          amount: remaining,
          isSettled: false
        });
        return;
      }
    }

    // If A owes B, and A already paid B via settlement payments, offset FIFO
    if (exp.type === 'a_owes_b' && remainingPaidAToB > 0) {
      const offset = Math.min(exp.amount, remainingPaidAToB);
      remainingPaidAToB = Math.round((remainingPaidAToB - offset) * 100) / 100;

      if (offset >= exp.amount) {
        settledItems.push({
          id: exp.id,
          date: exp.date,
          expenseName: exp.name,
          type: nameA === 'You' ? 'you_owed_them' : 'they_owed_you',
          description: `${nameB} paid · ${nameA === 'You' ? 'Your' : nameA + "'s"} share: ₹${exp.amount.toLocaleString('en-IN')} (Settled by payment)`,
          amount: exp.amount,
          isSettled: true
        });
        return;
      } else {
        const remaining = Math.round((exp.amount - offset) * 100) / 100;
        activeItems.push({
          id: exp.id,
          date: exp.date,
          expenseName: exp.name,
          type: nameA === 'You' ? 'you_owed_them' : 'they_owed_you',
          description: `${nameB} paid · ${nameA === 'You' ? 'Your' : nameA + "'s"} share: ₹${exp.amount.toLocaleString('en-IN')} (₹${offset.toLocaleString('en-IN')} settled, ₹${remaining.toLocaleString('en-IN')} remaining)`,
          amount: remaining,
          isSettled: false
        });
        return;
      }
    }

    // Otherwise, this is a truly OPEN expense
    activeItems.push({
      id: exp.id,
      date: exp.date,
      expenseName: exp.name,
      type: exp.type === 'a_owes_b' 
        ? (nameA === 'You' ? 'you_owed_them' : 'they_owed_you')
        : (nameA === 'You' ? 'they_owed_you' : 'you_owed_them'),
      description: exp.type === 'a_owes_b' 
        ? `${nameB} paid · ${nameA === 'You' ? 'Your' : nameA + "'s"} share: ₹${exp.amount.toLocaleString('en-IN')}`
        : `${nameA} paid · ${nameB === 'You' ? 'Your' : nameB + "'s"} share: ₹${exp.amount.toLocaleString('en-IN')}`,
      amount: exp.amount,
      isSettled: false
    });
  });

  // Calculate totals strictly from active open items
  let totalAOwedB = 0;
  let totalBOwedA = 0;

  activeItems.forEach(item => {
    const isAOwedB = nameA === 'You' ? item.type === 'you_owed_them' : item.type === 'they_owed_you';
    if (isAOwedB) {
      totalAOwedB += item.amount;
    } else {
      totalBOwedA += item.amount;
    }
  });

  // Sort newest first for display
  activeItems.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  settledItems.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Direct pairwise net: positive means A owes B; negative means B owes A
  const directNet = Math.round((totalAOwedB - totalBOwedA) * 100) / 100;

  // Simplified debt route context is ONLY used when there are zero direct active bills between A and B,
  // meaning the payment is purely a group-level balance clearing transaction.
  let simplifiedRoute: SimplifiedRouteContext | undefined;
  if (activeItems.length === 0 && simplifiedAmount !== undefined && simplifiedAmount > 0) {
    const summary = calculateSplitGroupSummary(transactions, group, currentUid, currentEmail);

    const debtorBal = summary.individualBalances.find(b => matchMemberKeys(b.memberKey, memberAKey, group, currentUid, currentEmail));
    const creditorBal = summary.individualBalances.find(b => matchMemberKeys(b.memberKey, memberBKey, group, currentUid, currentEmail));

    const debtorOverallNet = nameA === 'You'
      ? summary.yourNetBalance
      : (debtorBal?.groupNet !== undefined && Math.abs(debtorBal.groupNet) > 0.01 
          ? debtorBal.groupNet 
          : -simplifiedAmount);

    const creditorOverallNet = nameB === 'You'
      ? summary.yourNetBalance
      : (creditorBal?.groupNet !== undefined && Math.abs(creditorBal.groupNet) > 0.01 
          ? creditorBal.groupNet 
          : simplifiedAmount);

    simplifiedRoute = {
      isSimplifiedRoute: true,
      debtorName: nameA,
      creditorName: nameB,
      debtorOverallNet,
      creditorOverallNet,
      debtorContributingExpenses: [],
      creditorContributingExpenses: []
    };
  }

  return {
    memberA: { key: memberAKey, name: nameA },
    memberB: { key: memberBKey, name: nameB },
    activeItems,
    settledItems,
    appliedSettlements,
    items: activeItems,
    totalAOwedB: Math.round(totalAOwedB * 100) / 100,
    totalBOwedA: Math.round(totalBOwedA * 100) / 100,
    paymentsAToB,
    paymentsBToA,
    directNet: simplifiedAmount !== undefined ? (directNet >= 0 ? simplifiedAmount : -simplifiedAmount) : directNet,
    simplifiedAmount,
    simplifiedRoute
  };
}

/**
 * Automatically reconciles and marks member dues as settled on open expenses when a settlement payment occurs.
 * If all non-payer members of an expense have settled their dues, it automatically marks the entire expense as completed.
 */
export async function autoSettleMemberExpenses(
  groupId: string,
  payerKey: string,
  receiverKey: string,
  group?: ExpenseGroup,
  currentUid?: string,
  currentEmail?: string
): Promise<void> {
  const allTxs = await getGroupExpensesOnce(groupId);
  const defaultMembers = group 
    ? getGroupMembersList(group, currentUid, currentEmail).map(m => m.key)
    : [];

  for (const tx of allTxs) {
    if (tx.isSettlement || tx.settled || tx.isDeleted) continue;
    const txPayer = tx.paidBy || tx.createdBy || '';
    if (!matchMemberKeys(txPayer, receiverKey, group, currentUid, currentEmail)) continue;

    const participants = tx.splitMembers && tx.splitMembers.length > 0 ? tx.splitMembers : defaultMembers;
    if (!participants.some(p => matchMemberKeys(p, payerKey, group, currentUid, currentEmail))) continue;

    const currentSettled = tx.settledMembers || [];
    if (currentSettled.some(m => matchMemberKeys(m, payerKey, group, currentUid, currentEmail))) continue;

    const newSettledMembers = [...currentSettled, payerKey];
    
    // Check if now all non-payer participants are settled
    const nonPayers = participants.filter(p => !matchMemberKeys(p, txPayer, group, currentUid, currentEmail));
    const allDone = nonPayers.length > 0 && nonPayers.every(p => 
      newSettledMembers.some(k => matchMemberKeys(k, p, group, currentUid, currentEmail))
    );

    await updateExpenseInGroup(groupId, tx.id, {
      settledMembers: newSettledMembers,
      settled: allDone
    });
  }
}

/**
 * Records a debt settlement payment between two members.
 * Automatically reconciles and marks the debtor's due as paid on open expenses owed to the creditor.
 */
export async function recordSettlementPayment(
  groupId: string,
  payer: { key: string; name: string },
  receiver: { key: string; name: string },
  amount: number,
  date: string,
  note: string,
  user: User | null,
  group?: ExpenseGroup
): Promise<Transaction> {
  // Always resolve canonical, real display names for persistent storage (never relative 'You')
  const canonicalPayerName = payer.name && payer.name.trim().toLowerCase() !== 'you'
    ? payer.name.trim()
    : getCanonicalMemberName(payer.key, group, user?.uid, user?.email || undefined, user);

  const canonicalReceiverName = receiver.name && receiver.name.trim().toLowerCase() !== 'you'
    ? receiver.name.trim()
    : getCanonicalMemberName(receiver.key, group, user?.uid, user?.email || undefined, user);

  const title = `Settlement: ${canonicalPayerName} paid ${canonicalReceiverName}`;

  const tx = await addExpenseToGroup(
    groupId,
    {
      name: title,
      amount,
      category: 'split',
      date: date || new Date().toISOString().split('T')[0],
      settled: true,
      note: note || `Payment of ₹${amount} recorded`,
      paidBy: payer.key,
      paidByName: canonicalPayerName,
      settledTo: receiver.key,
      settledToName: canonicalReceiverName,
      isSettlement: true
    },
    user
  );

  try {
    await autoSettleMemberExpenses(groupId, payer.key, receiver.key, group, user?.uid, user?.email || undefined);
  } catch (err) {
    console.warn('Auto-settle reconciliation note:', err);
  }

  return tx;
}

/**
 * When a settlement payment is deleted, reverts the status of expenses that were settled by it back to pending.
 */
export async function revertSettlementOnExpenses(
  groupId: string,
  settlementTx: Transaction,
  group?: ExpenseGroup,
  currentUid?: string,
  currentEmail?: string,
  existingTransactions?: Transaction[]
): Promise<Transaction[]> {
  if (!settlementTx.isSettlement) return [];
  const payerKey = settlementTx.paidBy || '';
  const receiverKey = settlementTx.settledTo || '';

  if (!payerKey || !receiverKey) return [];

  const allTxs = (existingTransactions && existingTransactions.length > 0)
    ? existingTransactions
    : await getGroupExpensesOnce(groupId);
  const updatedTxs: Transaction[] = [];

  const defaultMembers = group 
    ? getGroupMembersList(group, currentUid, currentEmail).map(m => m.key)
    : [];

  for (const tx of allTxs) {
    if (tx.isSettlement || tx.isDeleted) continue;
    const txPayer = tx.paidBy || tx.createdBy || '';
    const isReceiverPayer = matchMemberKeys(txPayer, receiverKey, group, currentUid, currentEmail);

    const participants = tx.splitMembers && tx.splitMembers.length > 0 ? tx.splitMembers : defaultMembers;
    const isPayerParticipant = participants.some(p => matchMemberKeys(p, payerKey, group, currentUid, currentEmail));

    if (isReceiverPayer && isPayerParticipant) {
      const currentSettled = tx.settledMembers || [];
      const newSettled = currentSettled.filter(k => !matchMemberKeys(k, payerKey, group, currentUid, currentEmail));

      const updated: Transaction = {
        ...tx,
        settledMembers: newSettled,
        settled: false,
        note: tx.note?.toLowerCase().trim() === 'settled' ? '' : (tx.note || '')
      };

      await updateExpenseInGroup(groupId, tx.id, {
        settledMembers: newSettled,
        settled: false,
        note: tx.note?.toLowerCase().trim() === 'settled' ? '' : (tx.note || '')
      });

      updatedTxs.push(updated);
    }
  }

  return updatedTxs;
}

/**
 * Detects expenses that were marked as settled by an auto-settlement whose payment
 * was subsequently undone/deleted, and restores them to open status.
 */
export async function reconcileOrphanedSettledExpenses(
  groupId: string,
  transactions: Transaction[],
  group?: ExpenseGroup,
  currentUid?: string,
  currentEmail?: string
): Promise<Transaction[]> {
  const activeTransactions = transactions.filter(t => !t.isDeleted);
  const settlementTxs = activeTransactions.filter(t => t.isSettlement);
  const updatedTxs: Transaction[] = [];

  for (const tx of activeTransactions) {
    if (tx.isSettlement) continue;
    const hasStaleSettledNote = tx.note?.toLowerCase().trim() === 'settled';
    const payerKey = tx.paidBy || tx.createdBy || '';
    const defaultMembers = group 
      ? getGroupMembersList(group, currentUid, currentEmail).map(m => m.key)
      : [];
    const participants = tx.splitMembers && tx.splitMembers.length > 0 ? tx.splitMembers : defaultMembers;
    const nonPayers = participants.filter(p => !matchMemberKeys(p, payerKey, group, currentUid, currentEmail));

    if (nonPayers.length === 0) {
      if (hasStaleSettledNote) {
        const updated: Transaction = {
          ...tx,
          note: ''
        };
        await updateExpenseInGroup(groupId, tx.id, { note: '' });
        updatedTxs.push(updated);
      }
      continue;
    }

    const currentSettled = tx.settledMembers || [];
    let hasStaleSettledMember = false;
    const newSettledMembers: string[] = [];

    for (const sm of currentSettled) {
      // Check if there is an active settlement payment supporting this member's settlement to the payer
      const hasSupportingSettlement = settlementTxs.some(s =>
        matchMemberKeys(s.paidBy, sm, group, currentUid, currentEmail) &&
        matchMemberKeys(s.settledTo, payerKey, group, currentUid, currentEmail)
      );

      if (hasSupportingSettlement) {
        newSettledMembers.push(sm);
      } else {
        hasStaleSettledMember = true;
      }
    }

    const allSettledNow = nonPayers.length > 0 && nonPayers.every(p => 
      newSettledMembers.some(k => matchMemberKeys(k, p, group, currentUid, currentEmail))
    );

    const shouldReopen = (tx.settled && !allSettledNow && settlementTxs.length === 0) || hasStaleSettledMember || hasStaleSettledNote;

    if (shouldReopen) {
      const updated: Transaction = {
        ...tx,
        settledMembers: newSettledMembers,
        settled: allSettledNow,
        note: hasStaleSettledNote ? '' : (tx.note || '')
      };

      await updateExpenseInGroup(groupId, tx.id, {
        settledMembers: newSettledMembers,
        settled: allDoneOrOpen(allSettledNow),
        note: hasStaleSettledNote ? '' : (tx.note || '')
      });

      updatedTxs.push(updated);
    }
  }

  return updatedTxs;
}

function allDoneOrOpen(val: boolean): boolean {
  return Boolean(val);
}

export interface ReconciledExpenseStatus {
  isFullySettled: boolean;
  settledMemberKeys: Set<string>;
  clearedByOffsetMemberKeys: Set<string>;
}

/**
 * Computes FIFO running reconciliation across group expenses.
 * Automatically clears mutual reciprocal debts (e.g. A paid ₹1,000 for B, next day B paid ₹1,000 for A).
 * Guarantees that the Open expenses tab strictly reflects actual outstanding debts.
 * Soft-deleted items (in Trash) are strictly excluded from reconciliation calculations.
 */
export function getReconciledExpenseStatusMap(
  transactions: Transaction[],
  group: ExpenseGroup,
  currentUid?: string,
  currentEmail?: string
): Record<string, ReconciledExpenseStatus> {
  const result: Record<string, ReconciledExpenseStatus> = {};
  const allMembers = getGroupMembersList(group, currentUid, currentEmail);

  // STRICT: Soft-deleted transactions (in Trash) must never affect active running dues or settlements!
  const activeTransactions = transactions.filter(tx => !tx.isDeleted);
  const activeSettlements = activeTransactions.filter(tx => tx.isSettlement);

  // Initialize status for each active expense
  activeTransactions.forEach(tx => {
    if (tx.isSettlement) return;
    const settledSet = new Set<string>();
    const payerKey = tx.paidBy || tx.createdBy || '';
    if (payerKey) settledSet.add(payerKey.toLowerCase().trim());

    // Only recognize a member as settled if backed by an ACTIVE supporting settlement payment
    (tx.settledMembers || []).forEach(m => {
      const normM = m.toLowerCase().trim();
      const hasSupportingSettlement = activeSettlements.some(s =>
        matchMemberKeys(s.paidBy, normM, group, currentUid, currentEmail) &&
        matchMemberKeys(s.settledTo, payerKey, group, currentUid, currentEmail)
      );
      if (hasSupportingSettlement) {
        settledSet.add(normM);
      }
    });

    result[tx.id] = {
      isFullySettled: false,
      settledMemberKeys: settledSet,
      clearedByOffsetMemberKeys: new Set<string>()
    };
  });

  interface OpenDueRecord {
    txId: string;
    debtorKey: string;
    creditorKey: string;
    originalAmount: number;
    remainingAmount: number;
  }
  const openDuesMap = new Map<string, OpenDueRecord[]>();

  // Sort active transactions chronologically (oldest first)
  const sorted = [...activeTransactions].sort((a, b) => {
    const dateA = a.date ? a.date.split('T')[0] : '';
    const dateB = b.date ? b.date.split('T')[0] : '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const createdA = a.createdAt || a.id || '';
    const createdB = b.createdAt || b.id || '';
    return createdA.localeCompare(createdB);
  });

  const getNormMemberKey = (rawKey: string): string => {
    const found = allMembers.find(m => matchMemberKeys(m.key, rawKey, group, currentUid, currentEmail));
    return (found ? found.key : rawKey).toLowerCase().trim();
  };

  sorted.forEach(tx => {
    // 1. Settlement payment: Debtor paid Creditor
    if (tx.isSettlement) {
      const payer = getNormMemberKey(tx.paidBy || tx.createdBy || '');
      const receiver = getNormMemberKey(tx.settledTo || '');
      let credit = tx.amount || 0;
      if (!payer || !receiver || credit <= 0) return;

      // 1a. Offset direct dues from payer to receiver
      const queueKey = `${payer}__${receiver}`;
      const queue = openDuesMap.get(queueKey) || [];
      for (const due of queue) {
        if (credit <= 0.01) break;
        if (due.remainingAmount <= 0) continue;

        const offset = Math.min(due.remainingAmount, credit);
        due.remainingAmount -= offset;
        credit -= offset;

        if (due.remainingAmount <= 0.01) {
          result[due.txId]?.settledMemberKeys.add(due.debtorKey);
          result[due.txId]?.clearedByOffsetMemberKeys.add(due.debtorKey);
        }
      }

      return;
    }

    // 2. Regular expense
    const payer = getNormMemberKey(tx.paidBy || tx.createdBy || '');
    const totalAmount = tx.amount || 0;
    if (!payer || totalAmount <= 0) return;

    const participants = tx.splitMembers && tx.splitMembers.length > 0
      ? tx.splitMembers
      : allMembers.map(m => m.key);
    const count = participants.length > 0 ? participants.length : 1;

    participants.forEach(pRaw => {
      const p = getNormMemberKey(pRaw);
      if (p === payer) return; // Payer doesn't owe themselves

      let cut = 0;
      if (tx.splitMode === 'exact' && tx.splits) {
        const matchingKey = Object.keys(tx.splits).find(k => matchMemberKeys(k, pRaw, group, currentUid, currentEmail));
        cut = matchingKey ? (tx.splits[matchingKey] || 0) : Math.round((totalAmount / count) * 100) / 100;
      } else {
        cut = Math.round((totalAmount / count) * 100) / 100;
      }

      if (cut <= 0) return;

      const hasSupportingActiveSettlement = activeSettlements.some(s =>
        matchMemberKeys(s.paidBy, pRaw, group, currentUid, currentEmail) &&
        matchMemberKeys(s.settledTo, payer, group, currentUid, currentEmail)
      );
      const isAlreadySettled = Boolean(
        hasSupportingActiveSettlement &&
        (tx.settled || (tx.settledMembers && tx.settledMembers.some(m => matchMemberKeys(m, pRaw, group, currentUid, currentEmail))))
      );
      if (isAlreadySettled) {
        result[tx.id]?.settledMemberKeys.add(p);
        return;
      }

      // Check if payer owes p on prior open bills (Mutual offset / clearing!)
      let remainingCut = cut;
      const reverseQueueKey = `${payer}__${p}`; // Dues where payer owes p
      const reverseQueue = openDuesMap.get(reverseQueueKey) || [];

      for (const revDue of reverseQueue) {
        if (remainingCut <= 0) break;
        if (revDue.remainingAmount <= 0) continue;

        const offset = Math.min(revDue.remainingAmount, remainingCut);
        revDue.remainingAmount -= offset;
        remainingCut -= offset;

        // Payer's past due to p was cleared!
        if (revDue.remainingAmount <= 0.01) {
          result[revDue.txId]?.settledMemberKeys.add(revDue.debtorKey);
          result[revDue.txId]?.clearedByOffsetMemberKeys.add(revDue.debtorKey);
        }
      }

      if (remainingCut <= 0.01) {
        result[tx.id]?.settledMemberKeys.add(p);
        result[tx.id]?.clearedByOffsetMemberKeys.add(p);
      } else {
        const forwardQueueKey = `${p}__${payer}`;
        const queue = openDuesMap.get(forwardQueueKey) || [];
        queue.push({
          txId: tx.id,
          debtorKey: p,
          creditorKey: payer,
          originalAmount: cut,
          remainingAmount: remainingCut
        });
        openDuesMap.set(forwardQueueKey, queue);
      }
    });
  });

  // Evaluate isFullySettled for each regular active expense
  activeTransactions.forEach(tx => {
    if (tx.isSettlement) return;

    const payer = getNormMemberKey(tx.paidBy || tx.createdBy || '');
    const participants = tx.splitMembers && tx.splitMembers.length > 0
      ? tx.splitMembers
      : allMembers.map(m => m.key);
    const nonPayers = participants
      .map(p => getNormMemberKey(p))
      .filter(p => p !== payer);

    if (nonPayers.length === 0) {
      if (result[tx.id]) result[tx.id].isFullySettled = true;
      return;
    }

    // A non-payer participant is settled if:
    // 1. Cleared via FIFO queue from active settlement payments or mutual offset
    // 2. Or explicit settledMembers backed by an active settlement payment between non-payer and payer
    const allNonPayersSettled = nonPayers.every(p => {
      if (result[tx.id]?.settledMemberKeys.has(p)) return true;
      if (tx.settledMembers && tx.settledMembers.some(sm => matchMemberKeys(sm, p, group, currentUid, currentEmail))) {
        return activeSettlements.some(s =>
          matchMemberKeys(s.paidBy, p, group, currentUid, currentEmail) &&
          matchMemberKeys(s.settledTo, payer, group, currentUid, currentEmail)
        );
      }
      return false;
    });

    if (result[tx.id]) {
      result[tx.id].isFullySettled = allNonPayersSettled;
    }
  });

  // Guarantee: if all simplified debts in the group are 0 (e.g. mutual reciprocal expenses like A paid 1000, B paid 1000),
  // no phantom open expenses remain in the Open tab
  const summary = calculateSplitGroupSummary(activeTransactions, group, currentUid, currentEmail);
  if (summary.simplifiedDebts.length === 0) {
    activeTransactions.forEach(tx => {
      if (!tx.isSettlement && result[tx.id]) {
        result[tx.id].isFullySettled = true;
      }
    });
  }

  return result;
}

/**
 * Formats an ISO date into a human-friendly relative time string
 * (e.g., "just now", "5m ago", "2h ago", "yesterday", "3d ago", or "12 Oct")
 */
export function formatTimeAgo(dateStr?: string): string {
  if (!dateStr) return '';
  const timestamp = new Date(dateStr).getTime();
  if (isNaN(timestamp)) return '';
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp) / 1000);

  if (diffSec < 45) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const diffDays = Math.floor(diffSec / 86400);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  
  const d = new Date(timestamp);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * Calculates remaining days in trash before 30-day automatic permanent purge
 */
export function getDaysRemainingInTrash(deletedAt?: string): number {
  if (!deletedAt) return 30;
  const deletedTime = new Date(deletedAt).getTime();
  if (isNaN(deletedTime)) return 30;
  const elapsedDays = Math.floor((Date.now() - deletedTime) / (1000 * 60 * 60 * 24));
  return Math.max(0, 30 - elapsedDays);
}

/**
 * Separate rules for deleting transactions in a Split Ledger:
 * 1. Settlements: Only payer, recipient, or group owner can undo/delete.
 * 2. Settled Split Expenses: Only original payer or group owner can delete.
 * 3. Regular Split Expenses: Payer, creator, or group owner can delete.
 * Viewers cannot delete any transaction.
 */
export function evaluateTransactionDeleteRule(
  tx: Transaction,
  currentUser: { uid?: string; email?: string | null } | null,
  userRole: UserRole,
  group?: ExpenseGroup | null
): {
  canDelete: boolean;
  isSettlement: boolean;
  isSettledExpense: boolean;
  requiresWarning: boolean;
  actionLabel: string;
  rejectionReason?: string;
} {
  const isViewer = userRole === 'viewer';
  const isOwner = userRole === 'owner';
  const myUid = (currentUser?.uid || '').toLowerCase();
  const myEmail = (currentUser?.email || '').toLowerCase().trim();

  const isMe = (key?: string) => {
    if (!key) return false;
    const norm = key.toLowerCase().trim();
    if (myUid && norm === myUid) return true;
    if (myEmail && norm === myEmail) return true;
    if (norm === 'you' || norm === 'guest' || norm === 'local_user') return true;
    return (
      Boolean(myUid && matchMemberKeys(key, myUid, group || undefined, myUid, myEmail)) ||
      Boolean(myEmail && matchMemberKeys(key, myEmail, group || undefined, myUid, myEmail))
    );
  };

  const isSettlement = Boolean(tx.isSettlement);
  const isSettledExpense = Boolean(tx.settled || (tx.settledMembers && tx.settledMembers.length > 0));

  if (isViewer) {
    return {
      canDelete: false,
      isSettlement,
      isSettledExpense,
      requiresWarning: false,
      actionLabel: isSettlement ? 'Undo Settlement' : 'Delete Expense',
      rejectionReason: 'Viewers cannot delete or modify transactions.'
    };
  }

  // Case 1: Settlement Payment
  if (isSettlement) {
    const isPayer = isMe(tx.paidBy || tx.createdBy);
    const isReceiver = isMe(tx.settledTo);
    const canDelete = isOwner || isPayer || isReceiver;

    return {
      canDelete,
      isSettlement: true,
      isSettledExpense: false,
      requiresWarning: true,
      actionLabel: 'Undo Settlement',
      rejectionReason: canDelete
        ? undefined
        : `Only the payer (${tx.paidByName || 'Payer'}), receiver (${tx.settledToName || 'Receiver'}), or the group admin can undo this settlement.`
    };
  }

  // Case 2: Settled Split Expense
  if (isSettledExpense) {
    const isPayer = isMe(tx.paidBy || tx.createdBy);
    const canDelete = isOwner || isPayer;

    return {
      canDelete,
      isSettlement: false,
      isSettledExpense: true,
      requiresWarning: true,
      actionLabel: 'Delete Settled Expense',
      rejectionReason: canDelete
        ? undefined
        : `This expense has already been settled. Only the original payer (${tx.paidByName || 'Payer'}) or group admin can delete it.`
    };
  }

  // Case 3: Standard Open Split Expense
  const isPayerOrCreator = isMe(tx.paidBy || tx.createdBy);
  const canDelete = isOwner || isPayerOrCreator;

  return {
    canDelete,
    isSettlement: false,
    isSettledExpense: false,
    requiresWarning: false,
    actionLabel: 'Delete Expense',
    rejectionReason: canDelete
      ? undefined
      : `Only the payer (${tx.paidByName || 'Payer'}) or group admin can delete this expense.`
  };
}

export interface SettlementRestoreValidation {
  canRestore: boolean;
  reason?: 'SUPERSEDED_BY_NEWER_SETTLEMENT' | 'ALREADY_SETTLED' | 'WOULD_CAUSE_OVERPAYMENT';
  title: string;
  message: string;
  payerName: string;
  receiverName: string;
  amount: number;
  currentNetOwed: number;
  supersedingSettlement?: {
    id: string;
    amount: number;
    date: string;
    createdAt?: string;
  };
}

/**
 * Validates whether a soft-deleted settlement can safely be restored from Trash.
 * Prevents financial inconsistencies such as duplicate payments, overpayments,
 * or restoring a settlement that has already been superseded by a subsequent payment.
 */
export function validateSettlementRestore(
  settlementTx: Transaction,
  transactions: Transaction[],
  group?: ExpenseGroup,
  currentUid?: string,
  currentEmail?: string
): SettlementRestoreValidation {
  const amount = settlementTx.amount || 0;

  // Non-settlements (standard split expenses) are always safe to restore
  if (!settlementTx.isSettlement) {
    return {
      canRestore: true,
      title: 'Valid',
      message: '',
      payerName: '',
      receiverName: '',
      amount,
      currentNetOwed: 0
    };
  }

  const payerKey = settlementTx.paidBy || settlementTx.createdBy || '';
  const receiverKey = settlementTx.settledTo || '';

  if (!group || !payerKey || !receiverKey) {
    return {
      canRestore: true,
      title: 'Valid',
      message: '',
      payerName: settlementTx.paidByName || 'Payer',
      receiverName: settlementTx.settledToName || 'Receiver',
      amount,
      currentNetOwed: amount
    };
  }

  const payerName = getMemberDisplayName(payerKey, group, currentUid, currentEmail);
  const receiverName = getMemberDisplayName(receiverKey, group, currentUid, currentEmail);

  // Active settlements in the group (excluding soft-deleted ones and excluding this settlement itself)
  const activeSettlements = transactions.filter(t => !t.isDeleted && t.isSettlement && t.id !== settlementTx.id);

  // Check if a subsequent active settlement between the same parties was recorded after this deleted settlement
  // (e.g. balances tab record has again been marked as received and created an active settlement line)
  const superseding = activeSettlements.find(s => {
    const isPayerMatch = matchMemberKeys(s.paidBy || s.createdBy, payerKey, group, currentUid, currentEmail);
    const isReceiverMatch = matchMemberKeys(s.settledTo, receiverKey, group, currentUid, currentEmail);
    if (!isPayerMatch || !isReceiverMatch) return false;

    const sCreated = s.createdAt ? new Date(s.createdAt).getTime() : 0;
    const deletedTxCreated = settlementTx.createdAt ? new Date(settlementTx.createdAt).getTime() : 0;
    const deletedTxDeleted = settlementTx.deletedAt ? new Date(settlementTx.deletedAt).getTime() : 0;

    // A newer active settlement recorded after this one was deleted or created
    if (sCreated && deletedTxDeleted) {
      return sCreated >= deletedTxDeleted - 5000;
    }
    if (sCreated && deletedTxCreated) {
      return sCreated > deletedTxCreated;
    }
    if (s.date && settlementTx.date) {
      return s.date > settlementTx.date;
    }
    return false;
  });

  if (superseding) {
    const formattedSupersedingDate = superseding.date 
      ? new Date(superseding.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'recently';
    return {
      canRestore: false,
      reason: 'SUPERSEDED_BY_NEWER_SETTLEMENT',
      title: 'Payment Already Settled',
      message: `A subsequent payment of ₹${superseding.amount.toLocaleString('en-IN')} was already recorded between ${payerName} and ${receiverName} (${formattedSupersedingDate}). Restoring this deleted settlement would duplicate the payment.`,
      payerName,
      receiverName,
      amount,
      currentNetOwed: 0,
      supersedingSettlement: {
        id: superseding.id,
        amount: superseding.amount,
        date: superseding.date,
        createdAt: superseding.createdAt
      }
    };
  }

  // No superseding settlement exists: fully eligible and safe to restore!
  return {
    canRestore: true,
    title: 'Valid',
    message: '',
    payerName,
    receiverName,
    amount,
    currentNetOwed: amount
  };
}

