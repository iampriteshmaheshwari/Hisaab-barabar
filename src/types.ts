export type UserRole = 'owner' | 'editor' | 'viewer';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface GroupMember {
  uid?: string;
  email: string;
  displayName?: string;
  role: UserRole;
  addedAt: string;
  joinedVia?: 'invite_code' | 'email_invite' | 'creator';
  inviteCodeUsed?: string;
  upiId?: string;
  upiAddedBy?: string;
  upiPendingConfirmation?: boolean;
  phoneNumber?: string;
}

export interface ExpenseGroup {
  id: string;
  name: string;
  createdBy: string;
  ownerEmail: string;
  memberUids: string[];
  memberEmails: string[];
  members: Record<string, GroupMember>;
  customCategories?: Record<string, CategoryData>;
  inviteCode?: string;
  inviteCodeRotatedAt?: string;
  previousInviteCodes?: string[];
  createdAt: string;
  updatedAt?: string;
  type?: 'budget' | 'split';
}

export type SplitMode = 'equal' | 'exact';

export interface SplitMemberShare {
  memberKey: string; // UID or email
  name: string;
  amount: number;
}

export interface TransactionEditRecord {
  editedAt: string;
  editedBy?: string;
  editedByName: string;
  previousAmount?: number;
  previousName?: string;
}

export interface Transaction {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: string;
  settled: boolean;
  originalAmount?: number;
  groupId: string;
  createdBy?: string;
  createdByName?: string;
  note?: string;
  createdAt?: string;
  recurringExpenseId?: string;
  recurringInstanceDate?: string;

  // Edit history tracking
  lastEditedBy?: string;
  lastEditedByName?: string;
  lastEditedAt?: string;
  editCount?: number;
  editHistory?: TransactionEditRecord[];

  // Soft-delete / Trash retention tracking (30 days)
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletedByName?: string;
  deletedReason?: string;

  // Split Ledger specific fields
  paidBy?: string; // UID or email of the person who paid
  paidByName?: string; // Display name of payer
  splitMode?: SplitMode; // 'equal' or 'exact'
  splitMembers?: string[]; // Array of member keys (UID or emails) involved in split
  splits?: Record<string, number>; // Map of memberKey to exact cut amount
  isSettlement?: boolean; // True if this transaction is a debt settlement payment
  settledTo?: string; // Member key who received the payment
  settledToName?: string; // Display name of recipient
  settledMembers?: string[]; // Array of member keys whose dues have been settled for this expense
}

export interface ShoppingItem {
  id: string;
  name: string;
  status: 'pending' | 'bought';
  date: string;
  groupId: string;
  category?: string;
  byWhen?: string;
  createdBy?: string;
  createdAt?: string;
}

export interface RecurringExpense {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  category: string;
  startDate?: string;
  endDate?: string;
  status?: 'active' | 'cancelled';
  groupId: string;
  createdBy?: string;
  createdAt?: string;
  lastLoggedDate?: string;
  pausedAt?: string;
  resumedAt?: string;
}

export interface CategoryData {
  name: string;
  color?: string;
  bg?: string;
  hex: string;
  iconName: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  createdAt: string;
  lastLoginAt: string;
  upiId?: string;
  phoneNumber?: string;
}

export type NotificationType = 
  | 'DAILY_EXPENSE_SUMMARY' 
  | 'BUYING_ITEM_ADDED' 
  | 'MEMBER_JOINED' 
  | 'INVITE_CODE_ROTATED'
  | 'SPLIT_EXPENSE_ADDED'
  | 'SETTLEMENT_RECORDED'
  | 'SETTLEMENT_REMINDER';

export interface AppNotification {
  id: string;
  groupId: string;
  groupName: string;
  type: NotificationType;
  title: string;
  message: string;
  itemName?: string;
  itemCategory?: string;
  itemByWhen?: string;
  totalAmount?: number;
  expenseCount?: number;
  membersWithAccess?: string[];
  date?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
  readBy?: string[];
  // Split specific notification data
  paidByName?: string;
  settledToName?: string;
  splitMembersCount?: number;
}
