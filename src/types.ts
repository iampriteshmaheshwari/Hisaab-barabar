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
}

export type NotificationType = 
  | 'DAILY_EXPENSE_SUMMARY' 
  | 'BUYING_ITEM_ADDED' 
  | 'MEMBER_JOINED' 
  | 'INVITE_CODE_ROTATED';

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
}
