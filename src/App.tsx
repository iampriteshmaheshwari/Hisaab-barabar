/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  BarChart2, 
  BookOpen, 
  ShoppingBag, 
  Repeat, 
  Settings, 
  Plus, 
  Lock,
  Cloud,
  CheckCircle,
  LogIn,
  AlertCircle,
  Wallet,
  X
} from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { GroupModal } from './components/modals/GroupModal';
import { JoinGroupModal } from './components/modals/JoinGroupModal';
import { SettleModal } from './components/modals/SettleModal';
import { ExpenseModal } from './components/modals/ExpenseModal';
import { RecurringModal } from './components/modals/RecurringModal';
import { CategoryModal } from './components/modals/CategoryModal';
import { MergeOfflineModal } from './components/modals/MergeOfflineModal';
import { OnboardingModal } from './components/modals/OnboardingModal';
import { DeleteAccountModal } from './components/modals/DeleteAccountModal';
import { InstallAppModal } from './components/modals/InstallAppModal';
import { LedgerContextModal } from './components/modals/LedgerContextModal';
import { AppToast, type ToastData } from './components/notifications/AppToast';
import { purgeAllLocalData } from './services/accountService';

import { OverviewTab } from './components/tabs/OverviewTab';
import { TransactionsTab } from './components/tabs/TransactionsTab';
import { ShoppingTab } from './components/tabs/ShoppingTab';
import { FixedTab } from './components/tabs/FixedTab';
import { SettingsTab } from './components/tabs/SettingsTab';

import type { 
  Transaction, 
  ShoppingItem, 
  RecurringExpense, 
  CategoryData, 
  ExpenseGroup, 
  UserRole,
  ThemeMode,
  AppNotification
} from './types';

import { 
  subscribeToGroupNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  dispatchDailyExpenseSummary,
  dispatchBuyingItemNotification,
  getPushPermissionState,
  requestPushPermission,
  showDeviceNotification,
  getUserDigestTime,
  setUserDigestTime,
  formatDigestTime,
  DEFAULT_DIGEST_TIME
} from './services/notificationService';

import { 
  subscribeToUserGroups, 
  subscribeToGroupExpenses, 
  subscribeToGroupShopping, 
  subscribeToGroupRecurring,
  createGroup,
  deleteExpenseGroup,
  migrateLocalGroupsToCloud,
  addExpenseToGroup,
  updateExpenseInGroup,
  deleteExpenseFromGroup,
  settleExpenseInGroup,
  undoSettleExpenseInGroup,
  addShoppingItemToGroup,
  toggleShoppingItemStatus,
  updateShoppingItemInGroup,
  deleteShoppingItemFromGroup,
  addRecurringExpenseToGroup,
  updateRecurringExpenseInGroup,
  toggleRecurringExpenseStatus,
  deleteRecurringExpenseFromGroup,
  syncLocalDataToGroup,
  reassignCategoryInCloudGroup,
  updateGroupCustomCategories,
  getLocalTodayIso,
  getDueOccurrences,
  getNextOccurrenceDate
} from './services/expenseService';

import { 
  getCachedExpenses, 
  setCachedExpenses, 
  getCachedShopping, 
  setCachedShopping, 
  getCachedRecurring, 
  setCachedRecurring,
  enqueueMutation,
  getPendingMutationsCount,
  syncPendingMutations,
  subscribeToSyncState,
  mergeServerExpensesWithPending,
  mergeServerShoppingWithPending,
  mergeServerRecurringWithPending
} from './services/offlineSyncService';

const DEFAULT_CATEGORIES: Record<string, CategoryData> = {
  groceries: { name: 'Groceries', color: 'text-google-blue', bg: 'bg-google-blue/10', hex: '#1a73e8', iconName: 'ShoppingCart' },
  utilities: { name: 'Utilities', color: 'text-amber-700', bg: 'bg-amber-50', hex: '#F4B400', iconName: 'Zap' },
  investments: { name: 'Investments', color: 'text-blue-700', bg: 'bg-blue-50', hex: '#4285F4', iconName: 'TrendingUp' },
  other: { name: 'Other', color: 'text-purple-700', bg: 'bg-purple-50', hex: '#AB47BC', iconName: 'Tag' }
};

function getSavedActiveGroupId(userUid?: string | null): string {
  try {
    if (userUid) {
      const userSaved = localStorage.getItem(`hisaab_active_group_id_${userUid}`);
      if (userSaved) return userSaved;
    }
    return localStorage.getItem('hisaab_active_group_id') || '';
  } catch {
    return '';
  }
}

function saveActiveGroupId(groupId: string, userUid?: string | null): void {
  try {
    if (groupId) {
      localStorage.setItem('hisaab_active_group_id', groupId);
      if (userUid) {
        localStorage.setItem(`hisaab_active_group_id_${userUid}`, groupId);
      }
    }
  } catch (e) {
    console.warn('Could not save active group id:', e);
  }
}

export default function App() {
  const { user, loading: authLoading, signInWithGoogle, authError, clearAuthError } = useAuth();

  // Navigation tab state (remembers last active tab across app closes)
  const [activeTab, setActiveTab] = useState<'Overview' | 'Transactions' | 'Lists' | 'Fixed' | 'Settings'>(() => {
    try {
      const saved = localStorage.getItem('hisaab_active_tab');
      if (saved === 'Overview' || saved === 'Transactions' || saved === 'Lists' || saved === 'Fixed' || saved === 'Settings') {
        return saved;
      }
    } catch {}
    return 'Overview';
  });

  useEffect(() => {
    try {
      localStorage.setItem('hisaab_active_tab', activeTab);
    } catch {}
  }, [activeTab]);

  // Appearance (Light | Dark | System)
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('hisaab_theme_mode');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
    const legacyDark = localStorage.getItem('hisaab_dark_mode');
    if (legacyDark === 'true') return 'dark';
    if (legacyDark === 'false') return 'light';
    return 'system';
  });

  const [resolvedDarkMode, setResolvedDarkMode] = useState<boolean>(() => {
    if (themeMode === 'dark') return true;
    if (themeMode === 'light') return false;
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    localStorage.setItem('hisaab_theme_mode', themeMode);

    const applyTheme = () => {
      const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = themeMode === 'dark' || (themeMode === 'system' && isSystemDark);
      setResolvedDarkMode(isDark);
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme();

    if (themeMode === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme();
      mql.addEventListener('change', handleChange);
      return () => mql.removeEventListener('change', handleChange);
    }
  }, [themeMode]);

  const handleCycleTheme = () => {
    setThemeMode((current) => {
      if (current === 'system') return 'light';
      if (current === 'light') return 'dark';
      return 'system';
    });
  };

  // Group Management State
  const [groups, setGroups] = useState<ExpenseGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string>(() => {
    return getSavedActiveGroupId();
  });

  // Group data
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);

  // Modals state
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupModalTab, setGroupModalTab] = useState<'members' | 'groups' | 'create'>('members');
  const [showJoinModal, setShowJoinModal] = useState<boolean>(false);
  const [initialJoinCode, setInitialJoinCode] = useState<string>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('joinCode') || params.get('code') || sessionStorage.getItem('hisaab_pending_invite_code');
      if (code) {
        const clean = code.trim().toUpperCase();
        sessionStorage.setItem('hisaab_pending_invite_code', clean);
        return clean;
      }
    } catch {}
    return '';
  });
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [convertingShoppingItemIds, setConvertingShoppingItemIds] = useState<string[] | null>(null);
  const [settleTx, setSettleTx] = useState<Transaction | null>(null);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringExpense | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryModalTab, setCategoryModalTab] = useState<'manage' | 'add'>('manage');
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [hasCheckedMergeForUser, setHasCheckedMergeForUser] = useState<string | null>(null);
  const [showOnboardingModal, setShowOnboardingModal] = useState<boolean>(() => {
    try {
      const viewed = localStorage.getItem('hisaab_barabar_onboarding_viewed');
      // If user navigated using an invite link, let them join their group directly without popup
      const params = new URLSearchParams(window.location.search);
      if (params.get('joinCode') || params.get('code')) {
        return false;
      }
      return viewed !== 'true';
    } catch {
      return false;
    }
  });
  const [toast, setToast] = useState<ToastData | null>(null);
  const [ledgerContextGroup, setLedgerContextGroup] = useState<{
    group: ExpenseGroup;
    isOwner: boolean;
    previousGroupName?: string;
  } | null>(null);

  const showToast = useCallback((data: string | ToastData) => {
    const toastObj: ToastData = typeof data === 'string'
      ? { 
          id: `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, 
          message: data, 
          type: 'info' 
        }
      : { 
          id: data.id || `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, 
          ...data 
        };
    setToast(toastObj);
  }, []);

  const handleDismissToast = useCallback(() => {
    setToast(null);
  }, []);

  const setToastMessage = useCallback((msg: string | null) => {
    if (!msg) {
      setToast(null);
    } else {
      showToast(msg);
    }
  }, [showToast]);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [showResetDataModal, setShowResetDataModal] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Standalone PWA detection (iOS Safari, Android standalone, Desktop Chrome/Edge)
  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    return typeof window !== 'undefined' && (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://')
    );
  });

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
      setToastMessage('Hisaab Barabar added to your device');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallNative = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
        setToastMessage('Hisaab Barabar installed successfully');
      }
    } else {
      setShowInstallModal(true);
    }
  };

  // Network connectivity status & Offline Sync Engine
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(() => {
    return getPendingMutationsCount(user?.uid);
  });

  // Track sync engine state in real time
  useEffect(() => {
    const unsub = subscribeToSyncState((syncing, count) => {
      setIsSyncing(syncing);
      setPendingSyncCount(count);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setPendingSyncCount(getPendingMutationsCount(user?.uid));
  }, [user?.uid]);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      if (user) {
        const countBefore = getPendingMutationsCount(user.uid);
        if (countBefore > 0) {
          showToast({
            message: 'Back online',
            subMessage: `Uploading ${countBefore} offline change${countBefore > 1 ? 's' : ''}...`,
            type: 'sync'
          });
          try {
            const { synced } = await syncPendingMutations(user);
            if (synced > 0) {
              showToast({
                message: 'Cloud ledger synced',
                subMessage: `All ${synced} offline change${synced > 1 ? 's' : ''} saved`,
                type: 'sync'
              });
            } else {
              showToast({
                message: 'Back online',
                subMessage: 'Cloud ledger synced',
                type: 'sync'
              });
            }
          } catch {
            showToast({
              message: 'Back online',
              subMessage: 'Cloud ledger synced',
              type: 'sync'
            });
          }
        } else {
          showToast({
            message: 'Back online',
            subMessage: 'Cloud ledger synced',
            type: 'sync'
          });
        }
      } else {
        showToast({
          message: 'Back online',
          subMessage: 'Connected to network',
          type: 'sync'
        });
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      const pending = getPendingMutationsCount(user?.uid);
      if (pending > 0) {
        showToast({
          message: 'Offline mode',
          subMessage: `${pending} offline change${pending > 1 ? 's' : ''} saved locally`,
          type: 'info'
        });
      } else {
        showToast({
          message: 'Offline mode',
          subMessage: 'Entries will autosync when reconnected',
          type: 'info'
        });
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // If online on mount and there are pending offline mutations, sync immediately
    if (typeof navigator !== 'undefined' && navigator.onLine && user) {
      if (getPendingMutationsCount(user.uid) > 0) {
        syncPendingMutations(user).catch(() => {});
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user]);

  const handleAccountDeleted = () => {
    setActiveGroupId('');
    setGroups([]);
    setTransactions([]);
    setShoppingItems([]);
    setRecurringExpenses([]);
    setActiveTab('Overview');
    setShowDeleteAccountModal(false);
    setToastMessage('Account and all associated records permanently deleted');
  };

  const handleResetLocalData = () => {
    purgeAllLocalData();
    setActiveGroupId('');
    setGroups([]);
    setTransactions([]);
    setShoppingItems([]);
    setRecurringExpenses([]);
    setActiveTab('Overview');
    setShowResetDataModal(false);
    showToast({
      message: 'Offline ledger data reset',
      type: 'info'
    });
  };

  const handleOpenGroupModal = (tab: 'members' | 'groups' | 'create' = 'members') => {
    setGroupModalTab(tab);
    setShowGroupModal(true);
  };

  // Period filter for Overview
  const [selectedPeriod, setSelectedPeriod] = useState<'current_month' | 'last_month' | 'ytd'>('current_month');
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);

  // Local fallback storage for guests
  const [localTransactions, setLocalTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('expenses_transactions');
    return saved ? JSON.parse(saved) : [];
  });
  const [localShopping, setLocalShopping] = useState<ShoppingItem[]>(() => {
    const saved = localStorage.getItem('expenses_shopping_list');
    return saved ? JSON.parse(saved) : [];
  });
  const [localRecurring, setLocalRecurring] = useState<RecurringExpense[]>(() => {
    const saved = localStorage.getItem('expenses_recurring');
    return saved ? JSON.parse(saved) : [];
  });

  // Helper to distinguish genuine guest scratchpad records from cloud records
  const isGuestGroupId = useCallback((gid?: string | null): boolean => {
    if (!gid) return true;
    return gid === 'local_group' || gid.startsWith('local_') || gid.startsWith('local');
  }, []);

  // Filter only genuine guest items created in local sandbox
  const genuineGuestTransactions = useMemo(() => {
    return localTransactions.filter(t => isGuestGroupId(t.groupId));
  }, [localTransactions, isGuestGroupId]);

  const genuineGuestShopping = useMemo(() => {
    return localShopping.filter(s => isGuestGroupId(s.groupId));
  }, [localShopping, isGuestGroupId]);

  const genuineGuestRecurring = useMemo(() => {
    return localRecurring.filter(r => isGuestGroupId(r.groupId));
  }, [localRecurring, isGuestGroupId]);

  // Check URL parameters & session storage for invitation links (e.g. ?joinCode=ABCDEF)
  // Smartly detects if user is already the owner or an active member of this ledger!
  useEffect(() => {
    // If auth state is still resolving, wait before deciding to pop up modals
    if (authLoading) return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('joinCode') || params.get('code') || sessionStorage.getItem('hisaab_pending_invite_code') || initialJoinCode;
    if (!code) return;

    const cleanCode = code.trim().toUpperCase();

    // 1. If signed in, check if user is already the owner or member of this group
    if (user) {
      const existingGroup = groups.find(g => 
        g.inviteCode?.toUpperCase() === cleanCode || 
        g.previousInviteCodes?.some(c => c.toUpperCase() === cleanCode) ||
        g.id === cleanCode
      );

      if (existingGroup) {
        // User already belongs to this group! Do NOT prompt them to join!
        const userEmail = (user.email || '').toLowerCase().trim();
        const isOwner = existingGroup.createdBy === user.uid || (existingGroup.ownerEmail && existingGroup.ownerEmail.toLowerCase() === userEmail);

        // Clean the URL query params without reloading the page
        try {
          const url = new URL(window.location.href);
          if (url.searchParams.has('joinCode') || url.searchParams.has('code')) {
            url.searchParams.delete('joinCode');
            url.searchParams.delete('code');
            window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ''));
          }
          sessionStorage.removeItem('hisaab_pending_invite_code');
          sessionStorage.removeItem('hisaab_auto_join');
        } catch (e) {
          console.error(e);
        }

        setInitialJoinCode('');
        setShowJoinModal(false);

        // Determine previous group name if switching
        const prevGroupName = activeGroupId && activeGroupId !== existingGroup.id
          ? groups.find(g => g.id === activeGroupId)?.name
          : undefined;

        // Switch to this group
        setActiveGroupId(existingGroup.id);
        saveActiveGroupId(existingGroup.id, user.uid);
        setActiveTab('Overview');

        // Present the dedicated Ledger Context Modal (clear, interactive, never unnoticed)
        setLedgerContextGroup({
          group: existingGroup,
          isOwner,
          previousGroupName: prevGroupName
        });
        return;
      }
    }

    // 2. If user is guest/not signed in, or group is not in existing groups:
    setInitialJoinCode(cleanCode);
    setShowJoinModal(true);
  }, [authLoading, user, groups]);

  // Handle Home Screen Shortcuts & Tab Deep Links (?action=add-expense, ?tab=transactions, etc.)
  useEffect(() => {
    const handleUrlActions = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        
        // 1. Home screen shortcut action: Quick Add Expense
        const action = params.get('action');
        if (action === 'add-expense') {
          setEditingTx(null);
          setShowExpenseModal(true);
          const url = new URL(window.location.href);
          url.searchParams.delete('action');
          window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ''));
        }

        // 2. Tab navigation shortcut: ?tab=transactions / ?tab=shopping / ?tab=fixed / ?tab=settings / ?tab=overview
        const tabParam = params.get('tab')?.toLowerCase();
        if (tabParam) {
          if (tabParam === 'transactions' || tabParam === 'ledger') {
            setActiveTab('Transactions');
          } else if (tabParam === 'shopping' || tabParam === 'lists') {
            setActiveTab('Lists');
          } else if (tabParam === 'fixed' || tabParam === 'bills') {
            setActiveTab('Fixed');
          } else if (tabParam === 'settings') {
            setActiveTab('Settings');
          } else if (tabParam === 'overview') {
            setActiveTab('Overview');
          }
          const url = new URL(window.location.href);
          url.searchParams.delete('tab');
          window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ''));
        }
      } catch (e) {
        console.warn('URL shortcut check note:', e);
      }
    };

    handleUrlActions();
    window.addEventListener('popstate', handleUrlActions);
    return () => window.removeEventListener('popstate', handleUrlActions);
  }, []);

  // Android & Mobile Browser Hardware/Gesture Back Button handling for modals
  const isAnyModalOpen = Boolean(
    showExpenseModal || 
    settleTx || 
    showGroupModal || 
    showJoinModal || 
    showRecurringModal || 
    showCategoryModal || 
    showMergeModal || 
    showOnboardingModal || 
    showDeleteAccountModal || 
    showResetDataModal || 
    showInstallModal || 
    ledgerContextGroup
  );

  const modalPushedRef = useRef(false);

  useEffect(() => {
    if (isAnyModalOpen && !modalPushedRef.current) {
      modalPushedRef.current = true;
      window.history.pushState({ modalOpen: true }, '');

      const handlePopState = () => {
        modalPushedRef.current = false;
        setShowExpenseModal(false);
        setEditingTx(null);
        setSettleTx(null);
        setShowGroupModal(false);
        setShowJoinModal(false);
        setShowRecurringModal(false);
        setEditingRecurring(null);
        setShowCategoryModal(false);
        setShowMergeModal(false);
        setShowOnboardingModal(false);
        setShowDeleteAccountModal(false);
        setShowResetDataModal(false);
        setShowInstallModal(false);
        setLedgerContextGroup(null);
      };

      window.addEventListener('popstate', handlePopState, { once: true });
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    } else if (!isAnyModalOpen && modalPushedRef.current) {
      modalPushedRef.current = false;
      if (window.history.state?.modalOpen) {
        window.history.back();
      }
    }
  }, [isAnyModalOpen]);

  // 1. Subscribe to User's Expense Groups from Firestore or Local Storage
  useEffect(() => {
    // Prevent premature guest fallback or overwriting saved active group while auth state is resolving
    if (authLoading) return;

    if (!user) {
      setHasCheckedMergeForUser(null);
      // Reload local sandbox records when in guest mode
      try {
        const savedTx = localStorage.getItem('expenses_transactions');
        setLocalTransactions(savedTx ? JSON.parse(savedTx) : []);
        const savedShop = localStorage.getItem('expenses_shopping_list');
        setLocalShopping(savedShop ? JSON.parse(savedShop) : []);
        const savedRec = localStorage.getItem('expenses_recurring');
        setLocalRecurring(savedRec ? JSON.parse(savedRec) : []);
      } catch (e) {
        console.error('Error reloading local storage:', e);
      }

      // Guest mode: load or initialize local groups
      const saved = localStorage.getItem('expenses_local_groups');
      let localList: ExpenseGroup[] = saved ? JSON.parse(saved) : [];
      if (localList.length === 0) {
        localList = [{
          id: 'local_group',
          name: 'My Personal Expenses',
          createdBy: 'guest',
          ownerEmail: 'guest@device',
          memberUids: ['guest'],
          memberEmails: ['guest@device'],
          inviteCode: 'LOCAL1',
          members: {
            guest: { email: 'guest@device', displayName: 'Guest', role: 'owner', addedAt: new Date().toISOString() }
          },
          createdAt: new Date().toISOString()
        }];
        localStorage.setItem('expenses_local_groups', JSON.stringify(localList));
      }
      setGroups(localList);
      setActiveGroupId(prev => {
        const savedId = getSavedActiveGroupId(null);
        const targetId = prev || savedId;
        const exists = localList.some(g => g.id === targetId);
        const chosen = exists && targetId ? targetId : localList[0].id;
        saveActiveGroupId(chosen, null);
        return chosen;
      });
      return;
    }

    // Signed-in user: instantly seed groups from local user cache to preserve active ledger offline
    const cachedUserGroupsKey = `hisaab_cloud_groups_${user.uid}`;
    try {
      const cached = localStorage.getItem(cachedUserGroupsKey);
      if (cached) {
        const parsed: ExpenseGroup[] = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setGroups(parsed);
          const savedActiveId = getSavedActiveGroupId(user.uid);
          if (savedActiveId && !savedActiveId.startsWith('local_') && savedActiveId !== 'local_group' && parsed.some(g => g.id === savedActiveId)) {
            setActiveGroupId(savedActiveId);
          } else if (parsed[0]) {
            setActiveGroupId(parsed[0].id);
            saveActiveGroupId(parsed[0].id, user.uid);
          }
        }
      }
    } catch (e) {
      console.warn('Could not read cached cloud groups:', e);
    }

    const unsubscribe = subscribeToUserGroups(
      user,
      async (fetchedGroups) => {
        if (fetchedGroups.length === 0) {
          // If the user arrived with an invitation to join a shared ledger, do NOT create a default personal ledger.
          const pendingInviteCode = initialJoinCode || sessionStorage.getItem('hisaab_pending_invite_code');
          if (pendingInviteCode) {
            return;
          }

          // Guard against offline or pending cache states:
          // NEVER auto-create a default ledger if device is offline or if user has existing cached ledgers!
          const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
          let hasExistingCache = false;
          try {
            const cached = localStorage.getItem(cachedUserGroupsKey);
            if (cached && JSON.parse(cached).length > 0) {
              hasExistingCache = true;
            }
          } catch {}

          if (isOffline || hasExistingCache || groups.some(g => !g.id.startsWith('local_') && g.id !== 'local_group')) {
            // Keep using the existing cloud ledger from cache without creating any default ledger
            return;
          }

          // Check if the user had REAL local items or custom groups created offline before logging in
          const savedLocal = localStorage.getItem('expenses_local_groups');
          let localList: ExpenseGroup[] = [];
          try {
            if (savedLocal) localList = JSON.parse(savedLocal);
          } catch {}

          const hasLocalItems = genuineGuestTransactions.length > 0 || genuineGuestShopping.length > 0 || genuineGuestRecurring.length > 0;
          const hasCustomLocalGroups = localList.some(g => g.id !== 'local_group' && g.name !== 'My Personal Expenses');

          // Only migrate if user actually created offline expenses or customized groups
          if (hasLocalItems || hasCustomLocalGroups) {
            try {
              // Migrate local ledgers & items to user's Google account
              const promoted = await migrateLocalGroupsToCloud(
                user,
                localList,
                genuineGuestTransactions,
                genuineGuestShopping,
                genuineGuestRecurring
              );
              // Clean local storage completely so nothing remains orphaned
              localStorage.removeItem('expenses_local_groups');
              localStorage.removeItem('expenses_transactions');
              localStorage.removeItem('expenses_shopping_list');
              localStorage.removeItem('expenses_recurring');
              setLocalTransactions([]);
              setLocalShopping([]);
              setLocalRecurring([]);
              setGroups(promoted);
              localStorage.setItem(cachedUserGroupsKey, JSON.stringify(promoted));
              if (promoted[0]) {
                setActiveGroupId(promoted[0].id);
                saveActiveGroupId(promoted[0].id, user.uid);
              }
              setToastMessage(`Synced ${promoted.length} offline ledger${promoted.length === 1 ? '' : 's'} to your Google account`);
              return;
            } catch (e) {
              console.error('Failed to migrate local groups to cloud', e);
            }
          }

          // Only create initial personal ledger if confirmed online and user is truly new (zero groups)
          try {
            const initial = await createGroup('Personal Expenses', user);
            localStorage.removeItem('expenses_local_groups');
            const newGroups = [initial];
            setGroups(newGroups);
            localStorage.setItem(cachedUserGroupsKey, JSON.stringify(newGroups));
            setActiveGroupId(initial.id);
            saveActiveGroupId(initial.id, user.uid);
          } catch (e) {
            console.error('Failed to create initial user group', e);
          }
        } else {
          // Cloud ledgers exist: load existing ledgers across all devices without creating any new ones
          localStorage.removeItem('expenses_local_groups');
          setGroups(fetchedGroups);
          localStorage.setItem(cachedUserGroupsKey, JSON.stringify(fetchedGroups));
          
          // Retain active group: always prioritize user's explicitly remembered active ledger (e.g. Ledger B)
          setActiveGroupId(prev => {
            const savedId = getSavedActiveGroupId(user.uid);
            let targetId = '';
            if (savedId && !savedId.startsWith('local_') && savedId !== 'local_group' && fetchedGroups.some(g => g.id === savedId)) {
              targetId = savedId;
            } else if (prev && !prev.startsWith('local_') && prev !== 'local_group' && fetchedGroups.some(g => g.id === prev)) {
              targetId = prev;
            } else {
              targetId = fetchedGroups[0].id;
            }
            saveActiveGroupId(targetId, user.uid);
            return targetId;
          });
        }
      },
      (error) => {
        console.warn('Could not subscribe to groups:', error);
      }
    );

    return () => unsubscribe();
  }, [user, authLoading]);

  // Persist active group whenever activeGroupId or user changes
  useEffect(() => {
    if (activeGroupId) {
      saveActiveGroupId(activeGroupId, user?.uid);
    }
  }, [activeGroupId, user?.uid]);

  // Check for offline data merge whenever user signs in (strictly requires > 0 genuine guest items)
  useEffect(() => {
    if (!user || groups.length === 0) return;

    // Filter out sandbox groups to check valid cloud groups
    const hasCloudGroup = groups.some(g => !g.id.startsWith('local_') && g.id !== 'local_group');
    if (!hasCloudGroup) return;

    // Sanitize local storage: purge any cloud ledger items that erroneously leaked into guest storage
    const hasLeakedTx = localTransactions.some(t => t.groupId && !isGuestGroupId(t.groupId));
    const hasLeakedShop = localShopping.some(s => s.groupId && !isGuestGroupId(s.groupId));
    const hasLeakedRec = localRecurring.some(r => r.groupId && !isGuestGroupId(r.groupId));

    if (hasLeakedTx || hasLeakedShop || hasLeakedRec) {
      const cleanTx = localTransactions.filter(t => isGuestGroupId(t.groupId));
      const cleanShop = localShopping.filter(s => isGuestGroupId(s.groupId));
      const cleanRec = localRecurring.filter(r => isGuestGroupId(r.groupId));
      setLocalTransactions(cleanTx);
      setLocalShopping(cleanShop);
      setLocalRecurring(cleanRec);
      try {
        localStorage.setItem('expenses_transactions', JSON.stringify(cleanTx));
        localStorage.setItem('expenses_shopping_list', JSON.stringify(cleanShop));
        localStorage.setItem('expenses_recurring', JSON.stringify(cleanRec));
      } catch {}
    }

    const totalOfflineCount = genuineGuestTransactions.length + genuineGuestShopping.length + genuineGuestRecurring.length;
    if (totalOfflineCount === 0) {
      if (hasCheckedMergeForUser !== user.uid) {
        setHasCheckedMergeForUser(user.uid);
      }
      return;
    }

    if (totalOfflineCount > 0 && hasCheckedMergeForUser !== user.uid) {
      setHasCheckedMergeForUser(user.uid);
      setShowMergeModal(true);
    }
  }, [user, groups, localTransactions, localShopping, localRecurring, genuineGuestTransactions.length, genuineGuestShopping.length, genuineGuestRecurring.length, hasCheckedMergeForUser, isGuestGroupId]);

  // Create new group handler (works for both logged-in and guest users)
  const handleCreateNewGroup = async (name: string): Promise<ExpenseGroup | null> => {
    const cleanName = name.trim();
    if (!cleanName) return null;

    if (user) {
      const created = await createGroup(cleanName, user);
      setGroups(prev => [created, ...prev.filter(g => g.id !== created.id)]);
      setActiveGroupId(created.id);
      saveActiveGroupId(created.id, user.uid);
      return created;
    } else {
      const newId = `local_grp_${Date.now()}`;
      const newLocalGroup: ExpenseGroup = {
        id: newId,
        name: cleanName,
        createdBy: 'guest',
        ownerEmail: 'guest@device',
        memberUids: ['guest'],
        memberEmails: ['guest@device'],
        inviteCode: `LOC${Math.random().toString(36).substring(2, 5).toUpperCase()}`,
        members: {
          guest: { email: 'guest@device', displayName: 'Guest', role: 'owner', addedAt: new Date().toISOString() }
        },
        createdAt: new Date().toISOString()
      };
      const updated = [...groups, newLocalGroup];
      setGroups(updated);
      localStorage.setItem('expenses_local_groups', JSON.stringify(updated));
      setActiveGroupId(newId);
      saveActiveGroupId(newId, null);
      return newLocalGroup;
    }
  };

  // Delete group/ledger handler (supports both cloud and local guest groups)
  const handleDeleteGroup = async (groupId: string): Promise<void> => {
    const targetGroup = groups.find(g => g.id === groupId);
    const targetName = targetGroup?.name || 'Ledger';

    try {
      await deleteExpenseGroup(groupId, user);

      const remaining = groups.filter(g => g.id !== groupId);
      setGroups(remaining);

      // If the deleted group was the active group
      if (activeGroupId === groupId) {
        if (remaining.length > 0) {
          const nextGroup = remaining[0];
          setActiveGroupId(nextGroup.id);
          saveActiveGroupId(nextGroup.id, user?.uid);
        } else {
          // If all ledgers are deleted, recreate a fresh default ledger
          if (user) {
            const fresh = await createGroup('Personal Expenses', user);
            setGroups([fresh]);
            setActiveGroupId(fresh.id);
            saveActiveGroupId(fresh.id, user.uid);
          } else {
            const freshId = `local_grp_${Date.now()}`;
            const freshLocal: ExpenseGroup = {
              id: freshId,
              name: 'Personal Expenses',
              createdBy: 'guest',
              ownerEmail: 'guest@device',
              memberUids: ['guest'],
              memberEmails: ['guest@device'],
              inviteCode: `LOC${Math.random().toString(36).substring(2, 5).toUpperCase()}`,
              members: {
                guest: { email: 'guest@device', displayName: 'Guest', role: 'owner', addedAt: new Date().toISOString() }
              },
              createdAt: new Date().toISOString()
            };
            setGroups([freshLocal]);
            localStorage.setItem('expenses_local_groups', JSON.stringify([freshLocal]));
            setActiveGroupId(freshId);
            saveActiveGroupId(freshId, null);
          }
        }
      }

      setToastMessage(`Deleted "${targetName}"`);
    } catch (err: any) {
      console.error('Failed to delete group:', err);
      setToastMessage(err?.message || 'Failed to delete ledger');
      throw err;
    }
  };

  // Find active group object
  const activeGroup = useMemo(() => {
    return groups.find(g => g.id === activeGroupId) || groups[0] || null;
  }, [groups, activeGroupId]);

  // Determine current user's role in the active group
  const userRole: UserRole = useMemo(() => {
    if (!user) return 'owner'; // Local guest has full rights over their local sandbox
    if (!activeGroup) return 'viewer';

    if (activeGroup.createdBy === user.uid) return 'owner';

    const byUid = activeGroup.members?.[user.uid];
    if (byUid) return byUid.role;

    const userEmail = (user.email || '').toLowerCase().trim();
    const byEmail = activeGroup.members?.[userEmail];
    if (byEmail) return byEmail.role;

    // If user is registered in memberUids or memberEmails, default to 'editor'
    if (
      activeGroup.memberUids?.includes(user.uid) ||
      (userEmail && activeGroup.memberEmails?.some(e => e.toLowerCase() === userEmail))
    ) {
      return 'editor';
    }

    return 'viewer';
  }, [user, activeGroup]);

  // Categories - Ledger Scoped (Material 3 & Apple HIG Multi-tenancy)
  const categories: Record<string, CategoryData> = useMemo(() => {
    return {
      ...DEFAULT_CATEGORIES,
      ...(activeGroup?.customCategories || {})
    };
  }, [activeGroup?.customCategories]);

  // Handler: Save / Update Category for the active ledger
  const handleSaveCategory = async (key: string, data: CategoryData) => {
    if (!activeGroup) return;

    const updatedCustom = {
      ...(activeGroup.customCategories || {}),
      [key]: data
    };

    // 1. Optimistically update local activeGroup & groups state
    const updatedGroups = groups.map(g => g.id === activeGroup.id ? { ...g, customCategories: updatedCustom } : g);
    setGroups(updatedGroups);

    // Keep user's offline startup cache in sync for instant PWA / standalone load
    if (user) {
      try {
        localStorage.setItem(`hisaab_cloud_groups_${user.uid}`, JSON.stringify(updatedGroups));
      } catch {}
    }

    // 2. Persist to cloud group in Firestore if cloud ledger
    if (user && !activeGroup.id.startsWith('local_') && activeGroup.id !== 'local_group') {
      try {
        await updateGroupCustomCategories(activeGroup.id, updatedCustom);
      } catch (err) {
        console.error('Failed to sync custom categories to cloud group:', err);
      }
    } else {
      // 3. Persist to local groups in localStorage
      try {
        const savedLocal = localStorage.getItem('expenses_local_groups');
        if (savedLocal) {
          const parsed: ExpenseGroup[] = JSON.parse(savedLocal);
          const next = parsed.map(g => g.id === activeGroup.id ? { ...g, customCategories: updatedCustom } : g);
          localStorage.setItem('expenses_local_groups', JSON.stringify(next));
        }
      } catch (e) {
        console.warn('Could not save local group categories:', e);
      }
    }

    setToastMessage(`Saved category "${data.name}" in ${activeGroup.name}`);
  };

  // Auto-migrate legacy device-stored custom categories into active ledger once if ledger has no custom categories
  useEffect(() => {
    if (!activeGroup) return;
    try {
      const legacySaved = localStorage.getItem('hisaab_categories');
      if (legacySaved) {
        const parsed: Record<string, CategoryData> = JSON.parse(legacySaved);
        const legacyCustom: Record<string, CategoryData> = {};
        Object.entries(parsed).forEach(([k, v]) => {
          if (!DEFAULT_CATEGORIES[k]) {
            legacyCustom[k] = v;
          }
        });
        if (Object.keys(legacyCustom).length > 0 && (!activeGroup.customCategories || Object.keys(activeGroup.customCategories).length === 0)) {
          const merged = { ...(activeGroup.customCategories || {}), ...legacyCustom };
          setGroups(prev => prev.map(g => g.id === activeGroup.id ? { ...g, customCategories: merged } : g));
          if (user && !activeGroup.id.startsWith('local_') && activeGroup.id !== 'local_group') {
            updateGroupCustomCategories(activeGroup.id, merged).catch(console.warn);
          } else {
            const savedLocal = localStorage.getItem('expenses_local_groups');
            if (savedLocal) {
              const parsedLocal: ExpenseGroup[] = JSON.parse(savedLocal);
              const next = parsedLocal.map(g => g.id === activeGroup.id ? { ...g, customCategories: merged } : g);
              localStorage.setItem('expenses_local_groups', JSON.stringify(next));
            }
          }
        }
        // Permanently erase legacy device key so categories are never duplicated or randomly re-applied
        localStorage.removeItem('hisaab_categories');
      }
    } catch {}
  }, [activeGroup?.id, user]);

  // Desktop & Tablet Keyboard Navigation (Material & Apple productivity patterns)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      
      if (e.key === 'Escape') {
        setShowExpenseModal(false);
        setEditingTx(null);
        setSettleTx(null);
        setShowGroupModal(false);
        setShowJoinModal(false);
        setShowRecurringModal(false);
        setShowCategoryModal(false);
        setShowMergeModal(false);
        setShowOnboardingModal(false);
        setShowDeleteAccountModal(false);
        setShowResetDataModal(false);
        setShowInstallModal(false);
        setLedgerContextGroup(null);
        return;
      }

      if (isInput || e.metaKey || e.ctrlKey || e.altKey) return;

      if ((e.key === 'e' || e.key === 'n' || e.key === '+') && userRole !== 'viewer') {
        e.preventDefault();
        setEditingTx(null);
        setShowExpenseModal(true);
      } else if (e.key === '1') {
        setActiveTab('Overview');
      } else if (e.key === '2') {
        setActiveTab('Transactions');
      } else if (e.key === '3') {
        setActiveTab('Lists');
      } else if (e.key === '4') {
        setActiveTab('Fixed');
      } else if (e.key === '5') {
        setActiveTab('Settings');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [userRole]);

  // 2. Real-time Subscription to Group Expenses with Instant Cache & Smart Offline Merge
  useEffect(() => {
    if (!activeGroup) {
      setTransactions([]);
      return;
    }

    const isLocalLedger = activeGroup.id.startsWith('local_') || activeGroup.id === 'local_group';

    if (!user || isLocalLedger) {
      // Filter local transactions specifically for active ledger in guest mode or local sandbox
      const defaultGid = groups[0]?.id || 'local_group';
      const filtered = localTransactions.filter(t => {
        const itemGid = t.groupId || defaultGid;
        return itemGid === activeGroup.id;
      });
      setTransactions(filtered);
      return;
    }

    // Immediately seed with cached expenses so offline viewing has 0ms latency
    const cached = getCachedExpenses(activeGroup.id);
    if (cached.length > 0) {
      setTransactions(mergeServerExpensesWithPending(cached, activeGroup.id, user.uid));
    } else {
      setTransactions([]);
    }

    const unsubscribe = subscribeToGroupExpenses(
      activeGroup.id,
      (liveExpenses) => {
        const merged = mergeServerExpensesWithPending(liveExpenses, activeGroup.id, user.uid);
        setTransactions(merged);
        setCachedExpenses(activeGroup.id, merged);
      },
      (err) => {
        console.warn('Could not load group expenses:', err);
      }
    );

    return () => unsubscribe();
  }, [activeGroup?.id, user, localTransactions, groups]);

  // 3. Real-time Subscription to Group Shopping List with Instant Cache & Smart Offline Merge
  useEffect(() => {
    if (!activeGroup) {
      setShoppingItems([]);
      return;
    }

    const isLocalLedger = activeGroup.id.startsWith('local_') || activeGroup.id === 'local_group';

    if (!user || isLocalLedger) {
      // Filter local shopping items specifically for active ledger in guest mode or local sandbox
      const defaultGid = groups[0]?.id || 'local_group';
      const filtered = localShopping.filter(i => {
        const itemGid = i.groupId || defaultGid;
        return itemGid === activeGroup.id;
      });
      setShoppingItems(filtered);
      return;
    }

    // Immediately seed with cached shopping items so offline viewing has 0ms latency
    const cached = getCachedShopping(activeGroup.id);
    if (cached.length > 0) {
      setShoppingItems(mergeServerShoppingWithPending(cached, activeGroup.id, user.uid));
    } else {
      setShoppingItems([]);
    }

    const unsubscribe = subscribeToGroupShopping(
      activeGroup.id,
      (liveShopping) => {
        const merged = mergeServerShoppingWithPending(liveShopping, activeGroup.id, user.uid);
        setShoppingItems(merged);
        setCachedShopping(activeGroup.id, merged);
      },
      (err) => {
        console.warn('Could not load group shopping items:', err);
      }
    );

    return () => unsubscribe();
  }, [activeGroup?.id, user, localShopping, groups]);

  // 4. Real-time Subscription to Group Recurring Expenses with Instant Cache & Smart Offline Merge
  useEffect(() => {
    if (!activeGroup) {
      setRecurringExpenses([]);
      return;
    }

    const isLocalLedger = activeGroup.id.startsWith('local_') || activeGroup.id === 'local_group';

    if (!user || isLocalLedger) {
      // Filter local recurring items specifically for active ledger in guest mode or local sandbox
      const defaultGid = groups[0]?.id || 'local_group';
      const filtered = localRecurring.filter(r => {
        const itemGid = r.groupId || defaultGid;
        return itemGid === activeGroup.id;
      });
      setRecurringExpenses(filtered);
      return;
    }

    // Immediately seed with cached recurring expenses
    const cached = getCachedRecurring(activeGroup.id);
    if (cached.length > 0) {
      setRecurringExpenses(mergeServerRecurringWithPending(cached, activeGroup.id, user.uid));
    } else {
      setRecurringExpenses([]);
    }

    const unsubscribe = subscribeToGroupRecurring(
      activeGroup.id,
      (liveRecurring) => {
        const merged = mergeServerRecurringWithPending(liveRecurring, activeGroup.id, user.uid);
        setRecurringExpenses(merged);
        setCachedRecurring(activeGroup.id, merged);
      },
      (err) => {
        console.warn('Could not load group recurring expenses:', err);
      }
    );

    return () => unsubscribe();
  }, [activeGroup?.id, user, localRecurring, groups]);

  // 5. Real-time Subscription to Group Notifications & Device Alert Engine (Push-Only)
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>(getPushPermissionState());
  const previousNotifIdsRef = useRef<Set<string>>(new Set());

  // Individual user preference for daily digest time (Default: 21:00 / 9:00 PM)
  const [digestTime, setDigestTime] = useState<string>(() => getUserDigestTime(user?.uid));

  useEffect(() => {
    setDigestTime(getUserDigestTime(user?.uid));
  }, [user?.uid]);

  const handleUpdateDigestTime = (newTime: string) => {
    setDigestTime(newTime);
    setUserDigestTime(newTime, user?.uid);
    setToastMessage(`Daily digest scheduled for ${formatDigestTime(newTime)}`);
  };

  // Push permission update handler
  const handleRequestPushPermission = async () => {
    const perm = await requestPushPermission();
    setPushPermission(perm);
  };

  useEffect(() => {
    if (!activeGroup) {
      setNotifications([]);
      return;
    }

    const currentGid = activeGroup.id;
    if (!user || currentGid.startsWith('local_') || currentGid === 'local_group') {
      try {
        const saved = localStorage.getItem(`hisaab_local_notifs_${currentGid}`);
        if (saved) {
          setNotifications(JSON.parse(saved));
        } else {
          setNotifications([]);
        }
      } catch (e) {
        setNotifications([]);
      }
      return;
    }

    setNotifications([]);
    const unsubscribe = subscribeToGroupNotifications(
      activeGroup.id,
      (liveNotifications) => {
        // Detect newly arrived notifications to trigger native push notification
        liveNotifications.forEach((n) => {
          if (!previousNotifIdsRef.current.has(n.id)) {
            // Check if notification was created recently (within last 10 minutes) and not by current user
            const ageMs = Date.now() - new Date(n.createdAt).getTime();
            if (ageMs < 10 * 60 * 1000 && n.createdBy !== user.uid) {
              // Trigger native device push notification (no disruptive in-app banner)
              showDeviceNotification(n.title, {
                body: n.message,
                tag: n.id
              });
            }
          }
        });

        // Update known IDs
        previousNotifIdsRef.current = new Set(liveNotifications.map(n => n.id));
        setNotifications(liveNotifications);
      },
      (err) => {
        console.warn('Could not load group notifications:', err);
      }
    );

    return () => unsubscribe();
  }, [activeGroup?.id, user]);

  // 6. Daily Expense Digest Automation (Configurable Delivery Time, Default 9 PM / 21:00)
  // User directive: "Let that 9 pm be decided by that individual. By default : Lets keep it 9 pm. But if user wants to change it to some other, allow user to change it."
  const handleTriggerDailyDigest = async (force: boolean = false) => {
    if (!activeGroup) return;
    const notif = await dispatchDailyExpenseSummary(
      activeGroup,
      transactions,
      user,
      force
    );
    if (notif) {
      if (!user || activeGroup.id.startsWith('local_') || activeGroup.id === 'local_group') {
        setNotifications(prev => {
          const updated = [notif, ...prev];
          localStorage.setItem(`hisaab_local_notifs_${activeGroup.id}`, JSON.stringify(updated));
          return updated;
        });
      }
    }
  };

  useEffect(() => {
    if (!activeGroup || transactions.length === 0) return;

    const checkScheduledDigest = () => {
      const now = new Date();
      const [targetHour, targetMinute = 0] = (digestTime || '21:00').split(':').map(Number);
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // Trigger once current time is at or past the scheduled time today
      const isDue = currentHour > targetHour || (currentHour === targetHour && currentMinute >= targetMinute);
      if (isDue) {
        const todayIso = now.toISOString().split('T')[0];
        const storageKey = `hisaab_daily_notif_${activeGroup.id}_${todayIso}`;
        if (!localStorage.getItem(storageKey)) {
          // Check if there was any expense entry today
          const todayExpenses = transactions.filter(t => t.date === todayIso);
          if (todayExpenses.length > 0) {
            handleTriggerDailyDigest(false);
          }
        }
      }
    };

    // Check right away and then every 30 seconds
    checkScheduledDigest();
    const interval = setInterval(checkScheduledDigest, 30 * 1000);
    return () => clearInterval(interval);
  }, [activeGroup, transactions, digestTime]);

  // 7. Automated Scheduled Fixed Expense Posting Engine
  // Checks active recurring bills against transaction history and automatically logs due expenses
  const autoProcessingScheduledRef = useRef(false);

  useEffect(() => {
    if (!activeGroup) return;
    if (userRole === 'viewer') return; // Viewer permissions cannot write expenses

    const processScheduledBills = async () => {
      if (autoProcessingScheduledRef.current) return;
      autoProcessingScheduledRef.current = true;

      try {
        const todayStr = getLocalTodayIso();
        const activeBills = recurringExpenses.filter(r => (r.status || 'active') === 'active');
        if (activeBills.length === 0) return;

        const isCloud = Boolean(user && !activeGroup.id.startsWith('local_') && activeGroup.id !== 'local_group');
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        const newTransactions: Transaction[] = [];

        for (const rec of activeBills) {
          const dueOccurrences = getDueOccurrences(rec, todayStr);
          for (const occDate of dueOccurrences) {
            const deterministicId = `tx_rec_${rec.id}_${occDate.replace(/-/g, '')}`;

            // Check if this occurrence is already logged in transactions
            const alreadyLogged = transactions.some(
              tx => tx.id === deterministicId ||
                    (tx.recurringExpenseId === rec.id && (tx.date === occDate || tx.recurringInstanceDate === occDate))
            ) || newTransactions.some(
              tx => tx.id === deterministicId ||
                    (tx.recurringExpenseId === rec.id && tx.date === occDate)
            );

            if (!alreadyLogged) {
              const freqLabel = rec.frequency 
                ? rec.frequency.charAt(0).toUpperCase() + rec.frequency.slice(1).toLowerCase() 
                : 'Monthly';
              const newTx: Transaction = {
                id: deterministicId,
                name: rec.name,
                category: rec.category || 'other',
                amount: rec.amount,
                date: occDate,
                settled: false,
                groupId: activeGroup.id,
                createdBy: user?.uid || 'guest',
                createdByName: user?.displayName || user?.email?.split('@')[0] || 'Scheduled Bill',
                recurringExpenseId: rec.id,
                recurringInstanceDate: occDate,
                createdAt: new Date().toISOString()
              };
              newTransactions.push(newTx);
            }
          }
        }

        if (newTransactions.length > 0) {
          // Optimistically update transactions in state and cache
          setTransactions(prev => [...newTransactions, ...prev]);
          const currentCached = getCachedExpenses(activeGroup.id);
          setCachedExpenses(activeGroup.id, [...newTransactions, ...currentCached]);

          if (isCloud && user) {
            for (const tx of newTransactions) {
              enqueueMutation({
                type: 'ADD_EXPENSE',
                groupId: activeGroup.id,
                targetId: tx.id,
                payload: tx
              }, user.uid);
            }
            if (!isOffline) {
              syncPendingMutations(user).catch(err => console.warn('Background sync note (recurring):', err));
            }
          } else {
            // Local / Guest persistence
            setLocalTransactions(prev => {
              const updated = [...newTransactions, ...prev];
              try {
                localStorage.setItem('expenses_transactions', JSON.stringify(updated));
              } catch {}
              return updated;
            });
          }

          showToast({
            message: newTransactions.length === 1 
              ? `Logged scheduled bill: "${newTransactions[0].name}" (₹${newTransactions[0].amount.toLocaleString('en-IN')})`
              : `Logged ${newTransactions.length} scheduled bills in Ledger`,
            subMessage: 'Recorded on scheduled occurrence date',
            type: 'info'
          });
        }
      } catch (err) {
        console.warn('Auto-processing scheduled expenses error:', err);
      } finally {
        autoProcessingScheduledRef.current = false;
      }
    };

    processScheduledBills();
    const interval = setInterval(processScheduledBills, 60 * 1000);
    return () => clearInterval(interval);
  }, [activeGroup, recurringExpenses, transactions, userRole, user]);

  // Notification action handlers with instant optimistic UI update
  const handleMarkReadNotification = async (notificationId: string) => {
    if (!activeGroup) return;
    const currentUid = user?.uid || 'local_user';
    setNotifications(prev => {
      const updated = prev.map(n =>
        n.id === notificationId
          ? { ...n, readBy: Array.from(new Set([...(n.readBy || []), currentUid])) }
          : n
      );
      if (!user || activeGroup.id.startsWith('local_') || activeGroup.id === 'local_group') {
        localStorage.setItem(`hisaab_local_notifs_${activeGroup.id}`, JSON.stringify(updated));
      }
      return updated;
    });

    if (user && !activeGroup.id.startsWith('local_') && activeGroup.id !== 'local_group') {
      await markNotificationAsRead(activeGroup.id, notificationId, user.uid);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    if (!activeGroup) return;
    const currentUid = user?.uid || 'local_user';
    setNotifications(prev => {
      const updated = prev.map(n => ({
        ...n,
        readBy: Array.from(new Set([...(n.readBy || []), currentUid]))
      }));
      if (!user || activeGroup.id.startsWith('local_') || activeGroup.id === 'local_group') {
        localStorage.setItem(`hisaab_local_notifs_${activeGroup.id}`, JSON.stringify(updated));
      }
      return updated;
    });

    if (user && !activeGroup.id.startsWith('local_') && activeGroup.id !== 'local_group') {
      await markAllNotificationsAsRead(activeGroup.id, notifications, user.uid);
    }
  };

  const handleDeleteNotification = async (notificationId: string) => {
    if (!activeGroup) return;
    setNotifications(prev => {
      const updated = prev.filter(n => n.id !== notificationId);
      localStorage.setItem(`hisaab_local_notifs_${activeGroup.id}`, JSON.stringify(updated));
      return updated;
    });

    if (user && !activeGroup.id.startsWith('local_') && activeGroup.id !== 'local_group') {
      await deleteNotification(activeGroup.id, notificationId);
    }
  };

  const handleClearAllNotifications = async () => {
    if (!activeGroup) return;
    const toClear = [...notifications];
    setNotifications([]);
    localStorage.removeItem(`hisaab_local_notifs_${activeGroup.id}`);

    if (user && !activeGroup.id.startsWith('local_') && activeGroup.id !== 'local_group') {
      try {
        await Promise.all(toClear.map(n => deleteNotification(activeGroup.id, n.id)));
      } catch (err) {
        console.warn('Could not clear all notifications from cloud:', err);
      }
    }
  };

  const handleSelectNotification = (notif: AppNotification) => {
    if (notif.type === 'BUYING_ITEM_ADDED') {
      setActiveTab('Lists');
    } else if (notif.type === 'DAILY_EXPENSE_SUMMARY') {
      setActiveTab('Overview');
    }
    if (activeGroup) {
      handleMarkReadNotification(notif.id);
    }
  };

  // Handler: Select active group
  const handleSelectGroup = (groupId: string, showToastFeedback = true) => {
    const isDifferent = groupId !== activeGroupId;
    setActiveGroupId(groupId);
    saveActiveGroupId(groupId, user?.uid);
    if (showToastFeedback && isDifferent) {
      const g = groups.find(item => item.id === groupId);
      if (g) {
        const userEmail = (user?.email || '').toLowerCase().trim();
        const isOwner = g.createdBy === user?.uid || (g.ownerEmail && g.ownerEmail.toLowerCase() === userEmail);
        showToast({
          message: `Switched to "${g.name}"`,
          subMessage: isOwner ? 'Ledger Admin' : 'Ledger Member',
          type: 'ledger',
          duration: 2500
        });
      }
    }
  };

  // Handler: Add or Edit Expense with Instant Optimistic UI & Offline Sync
  const handleSaveExpense = async (data: {
    name: string;
    amount: number;
    category: string;
    date: string;
    groupId: string;
  }) => {
    const isEditOperation = Boolean(editingTx && editingTx.id && editingTx.id.trim().length > 0);
    const shoppingIdsToClean = convertingShoppingItemIds ? [...convertingShoppingItemIds] : [];
    const targetGroupId = data.groupId || activeGroup?.id || activeGroupId || (groups[0]?.id) || 'local_group';
    const isCloud = Boolean(user && !targetGroupId.startsWith('local_') && targetGroupId !== 'local_group');
    const isLocal = !isCloud;
    const nowIso = new Date().toISOString();
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (isEditOperation && editingTx) {
      // 1. Edit existing transaction
      const updatedTx: Transaction = {
        ...editingTx,
        name: data.name.trim(),
        amount: data.amount,
        category: data.category,
        date: data.date,
        groupId: targetGroupId
      };

      // Instantly update state & persistent cache
      setTransactions(prev => prev.map(t => t.id === editingTx.id ? updatedTx : t));
      const currentCached = getCachedExpenses(targetGroupId);
      setCachedExpenses(targetGroupId, currentCached.map(t => t.id === editingTx.id ? updatedTx : t));

      // ONLY write to guest scratchpad if operating in guest/local mode
      if (isLocal) {
        setLocalTransactions(prev => prev.map(t => t.id === editingTx.id ? updatedTx : t));
        try {
          localStorage.setItem('expenses_transactions', JSON.stringify(
            localTransactions.map(t => t.id === editingTx.id ? updatedTx : t)
          ));
        } catch {}
      }

      if (isCloud && user) {
        enqueueMutation({
          type: 'UPDATE_EXPENSE',
          groupId: targetGroupId,
          targetId: editingTx.id,
          payload: {
            name: data.name.trim(),
            amount: data.amount,
            category: data.category,
            date: data.date
          }
        }, user.uid);

        if (!isOffline) {
          syncPendingMutations(user).catch(err => console.warn('Background sync note:', err));
        }
      }

      const catData = categories[data.category] || { name: data.category || 'Expense', hex: '#1a73e8' };
      const formattedAmount = `₹${Number(data.amount).toLocaleString('en-IN')}`;

      showToast({
        message: isOffline ? `${formattedAmount} updated offline` : `${formattedAmount} updated`,
        subMessage: `${data.name.trim()} · ${catData.name}`,
        type: 'expense',
        amount: data.amount,
        category: data.category,
        categoryColor: catData.hex
      });
    } else {
      // 2. Add brand-new transaction
      const newTxId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newTx: Transaction = {
        id: newTxId,
        name: data.name.trim(),
        amount: data.amount,
        category: data.category,
        date: data.date,
        groupId: targetGroupId,
        settled: false,
        createdBy: user?.uid || 'guest',
        createdByName: user?.displayName || user?.email?.split('@')[0] || 'Member',
        createdAt: nowIso
      };

      // Instantly update state & persistent cache
      setTransactions(prev => [newTx, ...prev.filter(t => t.id !== newTxId)]);
      const currentCached = getCachedExpenses(targetGroupId);
      setCachedExpenses(targetGroupId, [newTx, ...currentCached.filter(t => t.id !== newTxId)]);

      // ONLY write to guest scratchpad if operating in guest/local mode
      if (isLocal) {
        setLocalTransactions(prev => [newTx, ...prev.filter(t => t.id !== newTxId)]);
        try {
          localStorage.setItem('expenses_transactions', JSON.stringify([newTx, ...localTransactions.filter(t => t.id !== newTxId)]));
        } catch {}
      }

      // Clean up converted shopping items immediately in state & cache
      if (shoppingIdsToClean.length > 0) {
        setShoppingItems(prev => prev.filter(i => !shoppingIdsToClean.includes(i.id)));
        const cachedShop = getCachedShopping(targetGroupId);
        setCachedShopping(targetGroupId, cachedShop.filter(i => !shoppingIdsToClean.includes(i.id)));
        if (isLocal) {
          setLocalShopping(prev => prev.filter(i => !shoppingIdsToClean.includes(i.id)));
          try {
            localStorage.setItem('expenses_shopping_list', JSON.stringify(localShopping.filter(i => !shoppingIdsToClean.includes(i.id))));
          } catch {}
        }
      }

      if (isCloud && user) {
        enqueueMutation({
          type: 'ADD_EXPENSE',
          groupId: targetGroupId,
          targetId: newTx.id,
          payload: newTx
        }, user.uid);

        // Also enqueue deletion for converted shopping items
        for (const sId of shoppingIdsToClean) {
          enqueueMutation({
            type: 'DELETE_SHOPPING',
            groupId: targetGroupId,
            targetId: sId,
            payload: {}
          }, user.uid);
        }

        if (!isOffline) {
          syncPendingMutations(user).catch(err => console.warn('Background sync note:', err));
        }
      }

      const catData = categories[data.category] || { name: data.category || 'Expense', hex: '#1a73e8' };
      const formattedAmount = `₹${Number(data.amount).toLocaleString('en-IN')}`;
      const groupName = (groups.find(g => g.id === targetGroupId) || activeGroup)?.name || '';

      if (shoppingIdsToClean.length > 0) {
        showToast({
          message: isOffline ? `${formattedAmount} logged offline` : `${formattedAmount} logged from shopping list`,
          subMessage: `${data.name.trim()} · ${catData.name}`,
          type: 'expense',
          amount: data.amount,
          category: data.category,
          categoryColor: catData.hex
        });
      } else {
        showToast({
          message: isOffline ? `${formattedAmount} saved offline` : `${formattedAmount} added to ${catData.name}`,
          subMessage: groupName ? `${data.name.trim()} · ${groupName}` : data.name.trim(),
          type: 'expense',
          amount: data.amount,
          category: data.category,
          categoryColor: catData.hex
        });
      }
    }

    setConvertingShoppingItemIds(null);
    setEditingTx(null);
  };

  // Handler: Delete Expense
  const handleDeleteExpense = async (txId: string) => {
    const targetGroupId = activeGroup?.id || activeGroupId || (groups[0]?.id) || 'local_group';
    const isCloud = Boolean(user && !targetGroupId.startsWith('local_') && targetGroupId !== 'local_group');
    const isLocal = !isCloud;
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    // Instantly remove from state & cache
    setTransactions(prev => prev.filter(t => t.id !== txId));
    const currentCached = getCachedExpenses(targetGroupId);
    setCachedExpenses(targetGroupId, currentCached.filter(t => t.id !== txId));

    if (isLocal) {
      setLocalTransactions(prev => prev.filter(t => t.id !== txId));
      try {
        localStorage.setItem('expenses_transactions', JSON.stringify(localTransactions.filter(t => t.id !== txId)));
      } catch {}
    }

    if (isCloud && user) {
      enqueueMutation({
        type: 'DELETE_EXPENSE',
        groupId: targetGroupId,
        targetId: txId,
        payload: {}
      }, user.uid);

      if (!isOffline) {
        syncPendingMutations(user).catch(err => console.warn('Background sync note:', err));
      }
    }

    setToastMessage(isOffline ? 'Deleted offline · Saved on device' : 'Expense deleted');
  };

  // Handler: Settle Expense
  const handleSaveSettlement = async (refundAmount: number, note: string) => {
    if (!settleTx) return;
    const targetGroupId = activeGroup?.id || activeGroupId || settleTx.groupId || 'local_group';
    const isCloud = Boolean(user && !targetGroupId.startsWith('local_') && targetGroupId !== 'local_group');
    const isLocal = !isCloud;
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const netAmount = Math.max(0, settleTx.amount - refundAmount);

    const updatedTx: Transaction = {
      ...settleTx,
      settled: true,
      originalAmount: settleTx.originalAmount || settleTx.amount,
      amount: netAmount,
      note: note || 'Settled with refund/discount'
    };

    setTransactions(prev => prev.map(t => t.id === settleTx.id ? updatedTx : t));
    const currentCached = getCachedExpenses(targetGroupId);
    setCachedExpenses(targetGroupId, currentCached.map(t => t.id === settleTx.id ? updatedTx : t));

    if (isLocal) {
      setLocalTransactions(prev => prev.map(t => t.id === settleTx.id ? updatedTx : t));
      try {
        localStorage.setItem('expenses_transactions', JSON.stringify(localTransactions.map(t => t.id === settleTx.id ? updatedTx : t)));
      } catch {}
    }

    if (isCloud && user) {
      enqueueMutation({
        type: 'SETTLE_EXPENSE',
        groupId: targetGroupId,
        targetId: settleTx.id,
        payload: {
          settled: true,
          originalAmount: updatedTx.originalAmount,
          amount: netAmount,
          note: updatedTx.note
        }
      }, user.uid);

      if (!isOffline) {
        syncPendingMutations(user).catch(err => console.warn('Background sync note:', err));
      }
    }

    showToast({
      message: isOffline ? 'Settled offline · Saved on device' : 'Expense marked as settled',
      subMessage: 'Balances updated',
      type: 'success'
    });
  };

  // Handler: Undo Settle Expense
  const handleUndoSettle = async (tx: Transaction) => {
    const targetGroupId = activeGroup?.id || activeGroupId || tx.groupId || 'local_group';
    const isCloud = Boolean(user && !targetGroupId.startsWith('local_') && targetGroupId !== 'local_group');
    const isLocal = !isCloud;
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    const restoredTx: Transaction = {
      ...tx,
      settled: false,
      amount: tx.originalAmount || tx.amount,
      note: ''
    };

    setTransactions(prev => prev.map(t => t.id === tx.id ? restoredTx : t));
    const currentCached = getCachedExpenses(targetGroupId);
    setCachedExpenses(targetGroupId, currentCached.map(t => t.id === tx.id ? restoredTx : t));

    if (isLocal) {
      setLocalTransactions(prev => prev.map(t => t.id === tx.id ? restoredTx : t));
      try {
        localStorage.setItem('expenses_transactions', JSON.stringify(localTransactions.map(t => t.id === tx.id ? restoredTx : t)));
      } catch {}
    }

    if (isCloud && user) {
      enqueueMutation({
        type: 'UNDO_SETTLE_EXPENSE',
        groupId: targetGroupId,
        targetId: tx.id,
        payload: {
          settled: false,
          amount: restoredTx.amount,
          note: ''
        }
      }, user.uid);

      if (!isOffline) {
        syncPendingMutations(user).catch(err => console.warn('Background sync note:', err));
      }
    }

    showToast({
      message: 'Settlement restored',
      subMessage: 'Original expense amount restored',
      type: 'info'
    });
  };

  // Handler: Shopping items with Instant Optimistic UI & Infinite Offline Capability
  const handleAddShoppingItem = async (
    name: string,
    options?: { category?: string; byWhen?: string }
  ) => {
    const cleanName = name.trim();
    if (!cleanName) return;

    const finalCategory = options?.category || 'other';
    const finalByWhen = options?.byWhen || 'whenever';
    const targetGroupId = activeGroup?.id || activeGroupId || (groups[0]?.id) || 'local_group';
    const isCloud = Boolean(user && !targetGroupId.startsWith('local_') && targetGroupId !== 'local_group');
    const isLocal = !isCloud;
    const nowIso = new Date().toISOString();
    const nowDate = nowIso.split('T')[0];
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    const newItemId = `shop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newItem: ShoppingItem = {
      id: newItemId,
      name: cleanName,
      status: 'pending',
      date: nowDate,
      groupId: targetGroupId,
      category: finalCategory,
      byWhen: finalByWhen,
      createdBy: user?.uid || 'guest',
      createdAt: nowIso
    };

    // 1. Immediately update React state optimistically
    setShoppingItems(prev => [newItem, ...prev.filter(i => i.id !== newItemId)]);

    // 2. Immediately write to persistent cache for this ledger
    const currentCached = getCachedShopping(targetGroupId);
    setCachedShopping(targetGroupId, [newItem, ...currentCached.filter(i => i.id !== newItemId)]);

    // Only persist for guest sandbox if isLocal
    if (isLocal) {
      setLocalShopping(prev => [newItem, ...prev.filter(i => i.id !== newItemId)]);
      try {
        localStorage.setItem('expenses_shopping_list', JSON.stringify([newItem, ...localShopping.filter(i => i.id !== newItemId)]));
      } catch {}
    }

    // 3. If signed-in to cloud ledger, enqueue mutation and trigger non-blocking background sync
    if (isCloud && user) {
      enqueueMutation({
        type: 'ADD_SHOPPING',
        groupId: targetGroupId,
        targetId: newItemId,
        payload: newItem
      }, user.uid);

      if (!isOffline) {
        syncPendingMutations(user).catch(err => console.warn('Background sync note:', err));
      }
    }

    // 4. Notifications & user feedback
    const catData = categories[finalCategory] || { name: 'Other', hex: '#AB47BC' };
    if (isOffline) {
      showToast({
        message: `"${cleanName}" added`,
        subMessage: 'Saved offline on device',
        type: 'shopping',
        category: finalCategory,
        categoryColor: catData.hex
      });
    } else {
      showToast({
        message: `"${cleanName}" added`,
        subMessage: activeGroup?.name ? `Shopping · ${activeGroup.name}` : 'Shopping list',
        type: 'shopping',
        category: finalCategory,
        categoryColor: catData.hex
      });
      if (activeGroup) {
        dispatchBuyingItemNotification(activeGroup, newItem, user).catch(() => {});
      }
    }
  };

  const handleToggleShoppingItem = async (item: ShoppingItem) => {
    const targetGroupId = activeGroup?.id || activeGroupId || item.groupId || 'local_group';
    const isCloud = Boolean(user && !targetGroupId.startsWith('local_') && targetGroupId !== 'local_group');
    const isLocal = !isCloud;
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const nextStatus = item.status === 'pending' ? 'bought' : 'pending';

    // Instantly update state & persistent cache
    setShoppingItems(prev => prev.map(i => i.id === item.id ? { ...i, status: nextStatus } : i));
    const currentCached = getCachedShopping(targetGroupId);
    setCachedShopping(targetGroupId, currentCached.map(i => i.id === item.id ? { ...i, status: nextStatus } : i));

    if (isLocal) {
      setLocalShopping(prev => prev.map(i => i.id === item.id ? { ...i, status: nextStatus } : i));
      try {
        localStorage.setItem('expenses_shopping_list', JSON.stringify(localShopping.map(i => i.id === item.id ? { ...i, status: nextStatus } : i)));
      } catch {}
    }

    if (isCloud && user) {
      enqueueMutation({
        type: 'TOGGLE_SHOPPING',
        groupId: targetGroupId,
        targetId: item.id,
        payload: { status: nextStatus }
      }, user.uid);

      if (!isOffline) {
        syncPendingMutations(user).catch(err => console.warn('Background sync note:', err));
      }
    }
  };

  const handleUpdateShoppingItem = async (
    itemId: string,
    updates: { name: string; category?: string; byWhen?: string }
  ) => {
    const targetGroupId = activeGroup?.id || activeGroupId || (groups[0]?.id) || 'local_group';
    const isCloud = Boolean(user && !targetGroupId.startsWith('local_') && targetGroupId !== 'local_group');
    const isLocal = !isCloud;
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    const cleanUpdates = {
      name: updates.name.trim(),
      category: updates.category || 'other',
      byWhen: updates.byWhen || 'whenever'
    };

    // Instantly update state & persistent cache
    setShoppingItems(prev => prev.map(i => i.id === itemId ? { ...i, ...cleanUpdates } : i));
    const currentCached = getCachedShopping(targetGroupId);
    setCachedShopping(targetGroupId, currentCached.map(i => i.id === itemId ? { ...i, ...cleanUpdates } : i));

    if (isLocal) {
      setLocalShopping(prev => prev.map(i => i.id === itemId ? { ...i, ...cleanUpdates } : i));
      try {
        localStorage.setItem('expenses_shopping_list', JSON.stringify(localShopping.map(i => i.id === itemId ? { ...i, ...cleanUpdates } : i)));
      } catch {}
    }

    if (isCloud && user) {
      enqueueMutation({
        type: 'UPDATE_SHOPPING',
        groupId: targetGroupId,
        targetId: itemId,
        payload: cleanUpdates
      }, user.uid);

      if (!isOffline) {
        syncPendingMutations(user).catch(err => console.warn('Background sync note:', err));
      }
    }

    setToastMessage(isOffline ? 'Updated offline · Saved on device' : 'Item updated');
  };

  const handleDeleteShoppingItem = async (itemId: string) => {
    const targetGroupId = activeGroup?.id || activeGroupId || (groups[0]?.id) || 'local_group';
    const isCloud = Boolean(user && !targetGroupId.startsWith('local_') && targetGroupId !== 'local_group');
    const isLocal = !isCloud;
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    // Instantly remove from state & cache
    setShoppingItems(prev => prev.filter(i => i.id !== itemId));
    const currentCached = getCachedShopping(targetGroupId);
    setCachedShopping(targetGroupId, currentCached.filter(i => i.id !== itemId));

    if (isLocal) {
      setLocalShopping(prev => prev.filter(i => i.id !== itemId));
      try {
        localStorage.setItem('expenses_shopping_list', JSON.stringify(localShopping.filter(i => i.id !== itemId)));
      } catch {}
    }

    if (isCloud && user) {
      enqueueMutation({
        type: 'DELETE_SHOPPING',
        groupId: targetGroupId,
        targetId: itemId,
        payload: {}
      }, user.uid);

      if (!isOffline) {
        syncPendingMutations(user).catch(err => console.warn('Background sync note:', err));
      }
    }

    setToastMessage(isOffline ? 'Deleted offline · Saved on device' : 'Item deleted');
  };

  const handleConvertBoughtToExpense = (itemsToConvert: ShoppingItem[]) => {
    if (!itemsToConvert || itemsToConvert.length === 0) return;
    const summary = itemsToConvert.map(i => i.name).join(', ');
    // Category uniformity check: if all items share the exact same category, use it; otherwise default to 'other'
    const firstCategory = itemsToConvert[0]?.category;
    const isUniform = Boolean(
      firstCategory &&
      itemsToConvert.every(i => Boolean(i.category) && i.category === firstCategory)
    );
    const detectedCategory = isUniform && firstCategory && (firstCategory in categories || categories[firstCategory])
      ? firstCategory
      : 'other';
    setConvertingShoppingItemIds(itemsToConvert.map(i => i.id));
    setEditingTx({
      id: '',
      name: summary,
      amount: 0,
      category: detectedCategory,
      date: new Date().toISOString().split('T')[0],
      groupId: activeGroup?.id || '',
      settled: false
    });
    setShowExpenseModal(true);
  };

  // Handler: Recurring Expenses with Instant Optimistic UI & Offline Sync
  const handleSaveRecurring = async (data: {
    id?: string;
    name: string;
    amount: number;
    category: string;
    frequency: string;
    startDate: string;
    endDate?: string;
    groupId: string;
  }) => {
    const targetGroupId = data.groupId || activeGroup?.id || activeGroupId || (groups[0]?.id) || 'local_group';
    const isCloud = Boolean(user && !targetGroupId.startsWith('local_') && targetGroupId !== 'local_group');
    const isLocal = !isCloud;
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    if (data.id) {
      // Edit existing recurring expense
      const recId = data.id;
      const existing = recurringExpenses.find(r => r.id === recId);
      const updates: Partial<RecurringExpense> = {
        name: data.name.trim(),
        amount: data.amount,
        category: data.category,
        frequency: data.frequency,
        startDate: data.startDate,
        endDate: data.endDate
      };
      if (existing && existing.startDate !== data.startDate) {
        updates.resumedAt = undefined;
      }

      setRecurringExpenses(prev => prev.map(r => r.id === recId ? { ...r, ...updates } : r));
      const currentCached = getCachedRecurring(targetGroupId);
      setCachedRecurring(targetGroupId, currentCached.map(r => r.id === recId ? { ...r, ...updates } : r));

      if (isLocal) {
        setLocalRecurring(prev => prev.map(r => r.id === recId ? { ...r, ...updates } : r));
        try {
          localStorage.setItem('expenses_recurring', JSON.stringify(localRecurring.map(r => r.id === recId ? { ...r, ...updates } : r)));
        } catch {}
      }

      if (isCloud && user) {
        enqueueMutation({
          type: 'UPDATE_RECURRING',
          groupId: targetGroupId,
          targetId: recId,
          payload: updates
        }, user.uid);

        if (!isOffline) {
          syncPendingMutations(user).catch(err => console.warn('Background sync note:', err));
        }
      }

      setToastMessage(isOffline ? 'Scheduled bill updated offline · Saved on device' : 'Scheduled bill updated');
    } else {
      // Add new recurring expense
      const newRecId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const newRec: RecurringExpense = {
        id: newRecId,
        name: data.name.trim(),
        amount: data.amount,
        category: data.category,
        frequency: data.frequency,
        startDate: data.startDate,
        endDate: data.endDate,
        status: 'active',
        groupId: targetGroupId,
        createdBy: user?.uid || 'guest',
        createdAt: new Date().toISOString()
      };

      setRecurringExpenses(prev => [newRec, ...prev.filter(r => r.id !== newRecId)]);
      const currentCached = getCachedRecurring(targetGroupId);
      setCachedRecurring(targetGroupId, [newRec, ...currentCached.filter(r => r.id !== newRecId)]);

      if (isLocal) {
        setLocalRecurring(prev => [newRec, ...prev.filter(r => r.id !== newRecId)]);
        try {
          localStorage.setItem('expenses_recurring', JSON.stringify([newRec, ...localRecurring.filter(r => r.id !== newRecId)]));
        } catch {}
      }

      if (isCloud && user) {
        enqueueMutation({
          type: 'ADD_RECURRING',
          groupId: targetGroupId,
          targetId: newRecId,
          payload: newRec
        }, user.uid);

        if (!isOffline) {
          syncPendingMutations(user).catch(err => console.warn('Background sync note:', err));
        }
      }

      setToastMessage(isOffline ? 'Scheduled bill added offline · Saved on device' : 'Scheduled bill added');
    }
  };

  const handleToggleRecurringStatus = async (rec: RecurringExpense) => {
    const targetGroupId = activeGroup?.id || activeGroupId || rec.groupId || 'local_group';
    const isCloud = Boolean(user && !targetGroupId.startsWith('local_') && targetGroupId !== 'local_group');
    const isLocal = !isCloud;
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const todayStr = getLocalTodayIso();
    const isActivating = (rec.status || 'active') === 'cancelled';
    const nextStatus = (isActivating ? 'active' : 'cancelled') as 'active' | 'cancelled';

    const updatedRec: RecurringExpense = {
      ...rec,
      status: nextStatus,
      pausedAt: !isActivating ? todayStr : rec.pausedAt,
      resumedAt: isActivating ? todayStr : rec.resumedAt
    };

    setRecurringExpenses(prev => prev.map(r => r.id === rec.id ? updatedRec : r));
    const currentCached = getCachedRecurring(targetGroupId);
    setCachedRecurring(targetGroupId, currentCached.map(r => r.id === rec.id ? updatedRec : r));

    if (isLocal) {
      setLocalRecurring(prev => prev.map(r => r.id === rec.id ? updatedRec : r));
      try {
        localStorage.setItem('expenses_recurring', JSON.stringify(localRecurring.map(r => r.id === rec.id ? updatedRec : r)));
      } catch {}
    }

    if (isCloud && user) {
      enqueueMutation({
        type: 'TOGGLE_RECURRING',
        groupId: targetGroupId,
        targetId: rec.id,
        payload: {
          status: nextStatus,
          pausedAt: updatedRec.pausedAt || null,
          resumedAt: updatedRec.resumedAt || null
        }
      }, user.uid);

      if (!isOffline) {
        syncPendingMutations(user).catch(err => console.warn('Background sync note:', err));
      }
    }

    if (isActivating) {
      const nextDate = getNextOccurrenceDate(updatedRec, todayStr);
      if (nextDate === todayStr) {
        setToastMessage('Bill reactivated · Due today');
      } else if (nextDate) {
        const [y, m, d] = nextDate.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const formatted = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        setToastMessage(`Bill reactivated · Next on ${formatted}`);
      } else {
        setToastMessage('Bill reactivated');
      }
    } else {
      setToastMessage('Bill paused');
    }
  };

  const handleDeleteRecurring = async (recId: string) => {
    const targetGroupId = activeGroup?.id || activeGroupId || (groups[0]?.id) || 'local_group';
    const isCloud = Boolean(user && !targetGroupId.startsWith('local_') && targetGroupId !== 'local_group');
    const isLocal = !isCloud;
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    setRecurringExpenses(prev => prev.filter(r => r.id !== recId));
    const currentCached = getCachedRecurring(targetGroupId);
    setCachedRecurring(targetGroupId, currentCached.filter(r => r.id !== recId));

    if (isLocal) {
      setLocalRecurring(prev => prev.filter(r => r.id !== recId));
      try {
        localStorage.setItem('expenses_recurring', JSON.stringify(localRecurring.filter(r => r.id !== recId)));
      } catch {}
    }

    if (isCloud && user) {
      enqueueMutation({
        type: 'DELETE_RECURRING',
        groupId: targetGroupId,
        targetId: recId,
        payload: {}
      }, user.uid);

      if (!isOffline) {
        syncPendingMutations(user).catch(err => console.warn('Background sync note:', err));
      }
    }

    setToastMessage('Recurring bill removed');
  };

  // Handler: 1-click Local Data Sync to Active Cloud Group
  const handleSyncLocalData = async (): Promise<number> => {
    if (!user || !activeGroup) throw new Error('Not authenticated');

    // Collect custom categories from offline groups without duplication
    let offlineCategories: Record<string, CategoryData> = {};
    try {
      const savedLocal = localStorage.getItem('expenses_local_groups');
      if (savedLocal) {
        const parsed: ExpenseGroup[] = JSON.parse(savedLocal);
        parsed.forEach(g => {
          if (g.customCategories) {
            offlineCategories = { ...offlineCategories, ...g.customCategories };
          }
        });
      }
    } catch {}

    const count = await syncLocalDataToGroup(
      activeGroup.id,
      user,
      genuineGuestTransactions,
      genuineGuestShopping,
      genuineGuestRecurring
    );

    // Merge custom categories into destination cloud group
    if (Object.keys(offlineCategories).length > 0) {
      const mergedCustom = { ...(activeGroup.customCategories || {}), ...offlineCategories };
      await updateGroupCustomCategories(activeGroup.id, mergedCustom).catch(console.warn);
      const updatedGroups = groups.map(g => g.id === activeGroup.id ? { ...g, customCategories: mergedCustom } : g);
      setGroups(updatedGroups);
      try {
        localStorage.setItem(`hisaab_cloud_groups_${user.uid}`, JSON.stringify(updatedGroups));
      } catch {}
    }

    // Clear local scratchpad and legacy device categories completely
    localStorage.removeItem('expenses_transactions');
    localStorage.removeItem('expenses_shopping_list');
    localStorage.removeItem('expenses_recurring');
    localStorage.removeItem('expenses_local_groups');
    localStorage.removeItem('hisaab_categories');
    setLocalTransactions([]);
    setLocalShopping([]);
    setLocalRecurring([]);
    setToastMessage(`Synced ${count} offline ${count === 1 ? 'record' : 'records'} to ${activeGroup.name}`);
    return count;
  };

  // Handler: Merge offline entries to chosen destination cloud group
  const handleMergeOfflineData = async (targetGroupId: string): Promise<number> => {
    if (!user) throw new Error('Not authenticated');
    const targetGroup = groups.find(g => g.id === targetGroupId);

    // Collect custom categories from offline groups
    let offlineCategories: Record<string, CategoryData> = {};
    try {
      const savedLocal = localStorage.getItem('expenses_local_groups');
      if (savedLocal) {
        const parsed: ExpenseGroup[] = JSON.parse(savedLocal);
        parsed.forEach(g => {
          if (g.customCategories) {
            offlineCategories = { ...offlineCategories, ...g.customCategories };
          }
        });
      }
    } catch {}

    const count = await syncLocalDataToGroup(
      targetGroupId,
      user,
      genuineGuestTransactions,
      genuineGuestShopping,
      genuineGuestRecurring
    );

    // Merge offline custom categories into chosen destination ledger
    if (Object.keys(offlineCategories).length > 0 && targetGroup) {
      const mergedCustom = { ...(targetGroup.customCategories || {}), ...offlineCategories };
      await updateGroupCustomCategories(targetGroupId, mergedCustom).catch(console.warn);
      const updatedGroups = groups.map(g => g.id === targetGroupId ? { ...g, customCategories: mergedCustom } : g);
      setGroups(updatedGroups);
      try {
        localStorage.setItem(`hisaab_cloud_groups_${user.uid}`, JSON.stringify(updatedGroups));
      } catch {}
    }

    // Clean local storage scratchpad and local groups completely
    localStorage.removeItem('expenses_transactions');
    localStorage.removeItem('expenses_shopping_list');
    localStorage.removeItem('expenses_recurring');
    localStorage.removeItem('expenses_local_groups');
    localStorage.removeItem('hisaab_categories');
    setLocalTransactions([]);
    setLocalShopping([]);
    setLocalRecurring([]);
    setActiveGroupId(targetGroupId);
    localStorage.setItem('hisaab_active_group_id', targetGroupId);
    setToastMessage(`Merged ${count} offline ${count === 1 ? 'entry' : 'entries'} into ${targetGroup?.name || 'ledger'}`);
    return count;
  };

  // Handler: Create new cloud group and merge offline entries into it
  const handleCreateNewAndMergeOfflineData = async (newLedgerName: string): Promise<void> => {
    if (!user) throw new Error('Not authenticated');

    // Collect custom categories from offline groups
    let offlineCategories: Record<string, CategoryData> = {};
    try {
      const savedLocal = localStorage.getItem('expenses_local_groups');
      if (savedLocal) {
        const parsed: ExpenseGroup[] = JSON.parse(savedLocal);
        parsed.forEach(g => {
          if (g.customCategories) {
            offlineCategories = { ...offlineCategories, ...g.customCategories };
          }
        });
      }
    } catch {}

    const created = await createGroup(newLedgerName, user);

    if (Object.keys(offlineCategories).length > 0) {
      await updateGroupCustomCategories(created.id, offlineCategories).catch(console.warn);
      created.customCategories = offlineCategories;
    }

    const updatedGroups = [created, ...groups.filter(g => g.id !== created.id)];
    setGroups(updatedGroups);
    try {
      localStorage.setItem(`hisaab_cloud_groups_${user.uid}`, JSON.stringify(updatedGroups));
    } catch {}

    const count = await syncLocalDataToGroup(
      created.id,
      user,
      genuineGuestTransactions,
      genuineGuestShopping,
      genuineGuestRecurring
    );

    // Clean local storage completely
    localStorage.removeItem('expenses_transactions');
    localStorage.removeItem('expenses_shopping_list');
    localStorage.removeItem('expenses_recurring');
    localStorage.removeItem('expenses_local_groups');
    localStorage.removeItem('hisaab_categories');
    setLocalTransactions([]);
    setLocalShopping([]);
    setLocalRecurring([]);
    setActiveGroupId(created.id);
    saveActiveGroupId(created.id, user.uid);
    setToastMessage(`Created "${created.name}" with ${count} offline entries`);
  };

  // Handler: Discard offline entries and clean scratchpad
  const handleDiscardOfflineData = () => {
    localStorage.removeItem('expenses_transactions');
    localStorage.removeItem('expenses_shopping_list');
    localStorage.removeItem('expenses_recurring');
    localStorage.removeItem('expenses_local_groups');
    localStorage.removeItem('hisaab_categories');
    setLocalTransactions([]);
    setLocalShopping([]);
    setLocalRecurring([]);
    setToastMessage('Offline entries cleared');
  };

  // Handler: Delete Category and safely reassign all tagged expenses, shopping items, and recurring bills to 'other' in the active ledger
  const handleDeleteCategory = async (catKey: string) => {
    if (catKey === 'other' || !activeGroup) return;
    const catData = categories[catKey];

    // 1. Remove category from active group's customCategories
    const updatedCustom = { ...(activeGroup.customCategories || {}) };
    delete updatedCustom[catKey];

    // Optimistically update React groups state & offline cache
    const updatedGroups = groups.map(g => g.id === activeGroup.id ? { ...g, customCategories: updatedCustom } : g);
    setGroups(updatedGroups);
    if (user) {
      try {
        localStorage.setItem(`hisaab_cloud_groups_${user.uid}`, JSON.stringify(updatedGroups));
      } catch {}
    }

    // 2. Count affected records in this active ledger
    const affectedTx = transactions.filter(t => (t.category || 'other') === catKey);
    const affectedShop = shoppingItems.filter(s => (s.category || 'other') === catKey);
    const affectedRec = recurringExpenses.filter(r => (r.category || 'other') === catKey);
    const totalAffected = affectedTx.length + affectedShop.length + affectedRec.length;

    // 3. Update React active state immediately with optimistic reassignment
    setTransactions(prev => prev.map(t => (t.category || 'other') === catKey ? { ...t, category: 'other' } : t));
    setShoppingItems(prev => prev.map(s => (s.category || 'other') === catKey ? { ...s, category: 'other' } : s));
    setRecurringExpenses(prev => prev.map(r => (r.category || 'other') === catKey ? { ...r, category: 'other' } : r));

    // 4. Update local storage records for this active group
    if (activeGroup.id.startsWith('local_') || activeGroup.id === 'local_group') {
      setLocalTransactions(prev => {
        const updated = prev.map(t => ((t.groupId || 'local_group') === activeGroup.id && (t.category || 'other') === catKey) ? { ...t, category: 'other' } : t);
        try {
          localStorage.setItem('expenses_transactions', JSON.stringify(updated));
        } catch {}
        return updated;
      });

      setLocalShopping(prev => {
        const updated = prev.map(s => ((s.groupId || 'local_group') === activeGroup.id && (s.category || 'other') === catKey) ? { ...s, category: 'other' } : s);
        try {
          localStorage.setItem('expenses_shopping_list', JSON.stringify(updated));
        } catch {}
        return updated;
      });

      setLocalRecurring(prev => {
        const updated = prev.map(r => ((r.groupId || 'local_group') === activeGroup.id && (r.category || 'other') === catKey) ? { ...r, category: 'other' } : r);
        try {
          localStorage.setItem('expenses_recurring', JSON.stringify(updated));
        } catch {}
        return updated;
      });

      try {
        const savedLocal = localStorage.getItem('expenses_local_groups');
        if (savedLocal) {
          const parsed: ExpenseGroup[] = JSON.parse(savedLocal);
          const next = parsed.map(g => g.id === activeGroup.id ? { ...g, customCategories: updatedCustom } : g);
          localStorage.setItem('expenses_local_groups', JSON.stringify(next));
        }
      } catch (e) {
        console.warn('Could not save local group categories on delete:', e);
      }
    } else {
      // 5. Cloud group: update customCategories in Firestore and reassign cloud items for this group
      try {
        await updateGroupCustomCategories(activeGroup.id, updatedCustom);
      } catch (err) {
        console.warn('Could not update group customCategories in Firestore:', err);
      }

      // Reassign category in Firestore cloud group
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (!isOffline && user) {
        reassignCategoryInCloudGroup(activeGroup.id, catKey, 'other').catch(err => {
          console.warn(`Category reassign in cloud group ${activeGroup.id} notice:`, err);
        });
      }

      // Enqueue mutations for offline resilience
      if (user) {
        affectedTx.forEach(tx => {
          enqueueMutation({
            type: 'UPDATE_EXPENSE',
            groupId: activeGroup.id,
            targetId: tx.id,
            payload: { category: 'other' }
          }, user.uid);
        });

        affectedShop.forEach(s => {
          enqueueMutation({
            type: 'UPDATE_SHOPPING',
            groupId: activeGroup.id,
            targetId: s.id,
            payload: { category: 'other' }
          }, user.uid);
        });

        affectedRec.forEach(r => {
          enqueueMutation({
            type: 'UPDATE_RECURRING',
            groupId: activeGroup.id,
            targetId: r.id,
            payload: { category: 'other' }
          }, user.uid);
        });

        if (!isOffline) {
          syncPendingMutations(user).catch(err => console.warn('Background sync note:', err));
        }
      }

      // Update cached items for this group
      const cachedTx = getCachedExpenses(activeGroup.id);
      if (cachedTx.some(t => (t.category || 'other') === catKey)) {
        setCachedExpenses(activeGroup.id, cachedTx.map(t => (t.category || 'other') === catKey ? { ...t, category: 'other' } : t));
      }
      const cachedShop = getCachedShopping(activeGroup.id);
      if (cachedShop.some(s => (s.category || 'other') === catKey)) {
        setCachedShopping(activeGroup.id, cachedShop.map(s => (s.category || 'other') === catKey ? { ...s, category: 'other' } : s));
      }
      const cachedRec = getCachedRecurring(activeGroup.id);
      if (cachedRec.some(r => (r.category || 'other') === catKey)) {
        setCachedRecurring(activeGroup.id, cachedRec.map(r => (r.category || 'other') === catKey ? { ...r, category: 'other' } : r));
      }
    }

    // 6. Visual toast feedback
    showToast({
      message: `"${catData?.name || 'Category'}" deleted`,
      subMessage: totalAffected > 0 
        ? `${totalAffected} ${totalAffected === 1 ? 'item' : 'items'} changed to Other`
        : `Removed from ${activeGroup.name}`,
      type: 'info'
    });
  };

  const hasLocalData = genuineGuestTransactions.length > 0 || genuineGuestShopping.length > 0 || genuineGuestRecurring.length > 0;

  // Premium Apple & Google splash screen during initial authentication resolution
  if (authLoading && groups.length === 0) {
    return (
      <div className="h-[100dvh] max-h-[100dvh] w-full bg-bg-main text-text-primary flex flex-col items-center justify-center font-sans p-4 select-none">
        <div className="flex flex-col items-center gap-3.5 animate-in fade-in duration-300">
          <div className="w-14 h-14 rounded-2xl bg-google-blue text-white flex items-center justify-center shadow-lg shadow-google-blue/20">
            <Wallet size={26} strokeWidth={2.2} />
          </div>
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="text-base font-semibold tracking-tight text-text-primary">
              Hisaab Barabar
            </span>
            <span className="text-xs text-text-secondary">
              Syncing your ledgers...
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full bg-bg-main text-text-primary flex flex-col font-sans selection:bg-google-blue/20 selection:text-google-blue overflow-hidden">
      {/* Top Navbar */}
      <Navbar
        groups={groups}
        activeGroup={activeGroup}
        userRole={userRole}
        onOpenGroupModal={handleOpenGroupModal}
        onOpenJoinModal={() => setShowJoinModal(true)}
        onSelectGroup={handleSelectGroup}
        isOnline={isOnline}
        isSyncing={isSyncing}
        pendingSyncCount={pendingSyncCount}
        themeMode={themeMode}
        onCycleThemeMode={handleCycleTheme}
        darkMode={resolvedDarkMode}
        onToggleDarkMode={handleCycleTheme}
        notifications={notifications}
        onMarkReadNotification={handleMarkReadNotification}
        onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        onClearAllNotifications={handleClearAllNotifications}
        onDeleteNotification={handleDeleteNotification}
        onSelectNotification={handleSelectNotification}
        onTriggerTestDailyDigest={() => handleTriggerDailyDigest(true)}
        pushPermission={pushPermission}
        onRequestPushPermission={handleRequestPushPermission}
        digestTime={digestTime}
        isStandalone={isStandalone}
        onOpenInstallModal={() => setShowInstallModal(true)}
      />

      {/* Main Tab Content */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-3 sm:px-6 md:px-8 py-3.5 sm:py-5 overflow-y-auto overscroll-contain no-scrollbar">
        {activeTab === 'Overview' && (
          <OverviewTab
            transactions={transactions}
            categories={categories}
            selectedPeriod={selectedPeriod}
            onSelectPeriod={setSelectedPeriod}
            showPeriodDropdown={showPeriodDropdown}
            setShowPeriodDropdown={setShowPeriodDropdown}
            userRole={userRole}
            onOpenAddExpense={() => { setEditingTx(null); setShowExpenseModal(true); }}
            onEditExpense={(tx) => { setEditingTx(tx); setShowExpenseModal(true); }}
            onDeleteExpense={handleDeleteExpense}
            onSettleExpense={(tx) => setSettleTx(tx)}
            onUndoSettleExpense={handleUndoSettle}
            groupName={activeGroup?.name || 'Group'}
            onNavigateToTransactions={() => setActiveTab('Transactions')}
          />
        )}

        {activeTab === 'Transactions' && (
          <TransactionsTab
            transactions={transactions}
            categories={categories}
            userRole={userRole}
            onOpenAddExpense={() => { setEditingTx(null); setShowExpenseModal(true); }}
            onEditExpense={(tx) => { setEditingTx(tx); setShowExpenseModal(true); }}
            onDeleteExpense={handleDeleteExpense}
            onSettleExpense={(tx) => setSettleTx(tx)}
            onUndoSettleExpense={handleUndoSettle}
            groupName={activeGroup?.name || 'Group'}
          />
        )}

        {activeTab === 'Lists' && (
          <ShoppingTab
            items={shoppingItems}
            categories={categories}
            userRole={userRole}
            onAddItem={handleAddShoppingItem}
            onUpdateItem={handleUpdateShoppingItem}
            onToggleItem={handleToggleShoppingItem}
            onDeleteItem={handleDeleteShoppingItem}
            onConvertBoughtToExpense={handleConvertBoughtToExpense}
            groupName={activeGroup?.name || 'Group'}
          />
        )}

        {activeTab === 'Fixed' && (
          <FixedTab
            recurringExpenses={recurringExpenses}
            categories={categories}
            userRole={userRole}
            onOpenAddRecurring={() => {
              setEditingRecurring(null);
              setShowRecurringModal(true);
            }}
            onEditRecurring={(rec) => {
              setEditingRecurring(rec);
              setShowRecurringModal(true);
            }}
            onToggleStatus={handleToggleRecurringStatus}
            onDeleteRecurring={handleDeleteRecurring}
            groupName={activeGroup?.name || 'Group'}
          />
        )}

        {activeTab === 'Settings' && (
          <SettingsTab
            themeMode={themeMode}
            onSelectThemeMode={setThemeMode}
            darkMode={resolvedDarkMode}
            onToggleDarkMode={handleCycleTheme}
            activeGroup={activeGroup}
            groups={groups}
            userRole={userRole}
            onOpenGroupModal={handleOpenGroupModal}
            onOpenCategoryModal={(tab = 'manage') => {
              setCategoryModalTab(tab);
              setShowCategoryModal(true);
            }}
            onDeleteCategory={handleDeleteCategory}
            categories={categories}
            transactions={transactions}
            shoppingItems={shoppingItems}
            recurringExpenses={recurringExpenses}
            onSyncLocalData={handleSyncLocalData}
            hasLocalData={hasLocalData}
            onOpenMergeModal={() => { if (hasLocalData) setShowMergeModal(true); }}
            pushPermission={pushPermission}
            onRequestPushPermission={handleRequestPushPermission}
            onTriggerTestDailyDigest={() => handleTriggerDailyDigest(true)}
            digestTime={digestTime}
            onChangeDigestTime={handleUpdateDigestTime}
            onOpenOnboarding={() => setShowOnboardingModal(true)}
            onOpenDeleteAccount={() => setShowDeleteAccountModal(true)}
            onResetLocalData={() => setShowResetDataModal(true)}
            isStandalone={isStandalone}
            onOpenInstallModal={() => setShowInstallModal(true)}
            onOpenJoinModal={() => setShowJoinModal(true)}
            pendingSyncCount={pendingSyncCount}
          />
        )}
      </main>

      {/* Modals */}
      <GroupModal
        isOpen={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        activeGroup={activeGroup}
        groups={groups}
        onSelectGroup={handleSelectGroup}
        userRole={userRole}
        initialTab={groupModalTab}
        onCreateGroup={handleCreateNewGroup}
        onDeleteGroup={handleDeleteGroup}
        onOpenJoinModal={() => setShowJoinModal(true)}
      />

      <JoinGroupModal
        isOpen={showJoinModal}
        groups={groups}
        onClose={() => {
          setShowJoinModal(false);
          setInitialJoinCode('');
          try {
            sessionStorage.removeItem('hisaab_pending_invite_code');
            sessionStorage.removeItem('hisaab_auto_join');
            const url = new URL(window.location.href);
            if (url.searchParams.has('joinCode') || url.searchParams.has('code')) {
              url.searchParams.delete('joinCode');
              url.searchParams.delete('code');
              window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ''));
            }
          } catch (e) {
            console.error(e);
          }
        }}
        onJoined={(groupId, groupName) => {
          handleSelectGroup(groupId);
          setActiveTab('Overview');
          setShowJoinModal(false);
          setInitialJoinCode('');
          try {
            sessionStorage.removeItem('hisaab_pending_invite_code');
            sessionStorage.removeItem('hisaab_auto_join');
            const url = new URL(window.location.href);
            if (url.searchParams.has('joinCode') || url.searchParams.has('code')) {
              url.searchParams.delete('joinCode');
              url.searchParams.delete('code');
              window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ''));
            }
          } catch (e) {
            console.error(e);
          }
          showToast({
            message: groupName ? `Joined "${groupName}"` : 'Joined shared ledger',
            subMessage: 'Joined with View Only access • Admin can grant Can Edit permissions',
            type: 'ledger',
            duration: 3500
          });
        }}
        initialCode={initialJoinCode}
      />

      <ExpenseModal
        isOpen={showExpenseModal}
        onClose={() => { 
          setShowExpenseModal(false); 
          setEditingTx(null); 
          setConvertingShoppingItemIds(null);
        }}
        onSave={handleSaveExpense}
        onDelete={handleDeleteExpense}
        categories={categories}
        groups={groups}
        activeGroupId={activeGroup?.id || ''}
        userRole={userRole}
        initialTx={editingTx}
      />

      <SettleModal
        isOpen={!!settleTx}
        tx={settleTx}
        activeGroup={activeGroup}
        onClose={() => setSettleTx(null)}
        onSave={handleSaveSettlement}
      />

      <RecurringModal
        isOpen={showRecurringModal}
        onClose={() => {
          setShowRecurringModal(false);
          setEditingRecurring(null);
        }}
        onSave={handleSaveRecurring}
        categories={categories}
        groups={groups}
        activeGroupId={activeGroup?.id || ''}
        userRole={userRole}
        initialRecurring={editingRecurring}
      />

      <CategoryModal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        onSave={handleSaveCategory}
        onDelete={handleDeleteCategory}
        existingCategories={categories}
        transactions={transactions}
        shoppingItems={shoppingItems}
        recurringExpenses={recurringExpenses}
        initialTab={categoryModalTab}
        groupName={activeGroup?.name || 'Personal Expenses'}
        userRole={userRole}
      />

      <MergeOfflineModal
        isOpen={showMergeModal}
        onClose={() => setShowMergeModal(false)}
        groups={groups}
        activeGroupId={activeGroupId}
        localTransactions={genuineGuestTransactions}
        localShopping={genuineGuestShopping}
        localRecurring={genuineGuestRecurring}
        onMerge={handleMergeOfflineData}
        onCreateNewAndMerge={handleCreateNewAndMergeOfflineData}
        onDiscard={handleDiscardOfflineData}
        categories={categories}
      />

      <OnboardingModal
        isOpen={showOnboardingModal}
        onClose={() => setShowOnboardingModal(false)}
        activeTab={activeTab}
        onGetStarted={() => {
          setActiveTab('Overview');
          setShowOnboardingModal(false);
        }}
        onOpenJoinModal={() => {
          setShowOnboardingModal(false);
          setShowJoinModal(true);
        }}
      />

      {/* Delete Account Modal (Apple HIG & Google M3 Irreversible Action Sheet) */}
      <DeleteAccountModal
        isOpen={showDeleteAccountModal}
        onClose={() => setShowDeleteAccountModal(false)}
        onAccountDeleted={handleAccountDeleted}
      />

      {/* PWA Home Screen Installation Guide & Native Trigger */}
      <InstallAppModal
        isOpen={showInstallModal}
        onClose={() => setShowInstallModal(false)}
        deferredPrompt={deferredPrompt}
        onInstallNative={handleInstallNative}
      />

      {/* Reset Local Guest Data Confirmation Dialog */}
      {showResetDataModal && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-sm rounded-3xl p-5 border border-border shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 font-sans">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <AlertCircle size={22} strokeWidth={2.2} />
            </div>
            <div className="space-y-1.5">
              <h4 className="text-base font-semibold text-text-primary">
                Reset Offline Data?
              </h4>
              <p className="text-xs text-text-secondary leading-relaxed">
                This will erase all guest transactions, local checklists, and settings stored on this device.
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowResetDataModal(false)}
                className="flex-1 h-11 border border-border hover:bg-surface-hover text-text-secondary hover:text-text-primary rounded-full text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetLocalData}
                className="flex-1 h-11 bg-google-red hover:bg-red-700 text-white rounded-full text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
              >
                Reset Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bottom Toast Notification (Google Material 3 + Apple iOS style) */}
      <AppToast
        toast={toast}
        onDismiss={handleDismissToast}
        categories={categories}
        hasFab={userRole !== 'viewer' && (activeTab === 'Overview' || activeTab === 'Transactions')}
      />

      {/* Ledger Deep Link Context Switch Modal */}
      <LedgerContextModal
        isOpen={Boolean(ledgerContextGroup)}
        group={ledgerContextGroup?.group || null}
        isOwner={ledgerContextGroup?.isOwner || false}
        previousGroupName={ledgerContextGroup?.previousGroupName}
        onContinue={() => setLedgerContextGroup(null)}
        onSwitchBack={() => {
          if (ledgerContextGroup?.previousGroupName) {
            const prevGroup = groups.find(g => g.name === ledgerContextGroup.previousGroupName);
            if (prevGroup) {
              setActiveGroupId(prevGroup.id);
              saveActiveGroupId(prevGroup.id, user?.uid);
            }
          }
          setLedgerContextGroup(null);
        }}
        onClose={() => setLedgerContextGroup(null)}
      />

      {/* Auth Notice Banner (e.g. pop-up blocked) */}
      {authError && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[92%] px-4 py-2.5 rounded-2xl bg-surface/95 dark:bg-surface/90 backdrop-blur-md border border-amber-500/30 shadow-lg flex items-center justify-between gap-3 text-xs font-medium text-text-primary animate-in fade-in slide-in-from-top duration-200">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle size={15} className="text-amber-500 shrink-0" />
            <span className="leading-snug text-text-secondary">{authError}</span>
          </div>
          <button
            type="button"
            onClick={clearAuthError}
            className="text-text-secondary hover:text-text-primary shrink-0 p-1 rounded-full hover:bg-surface-hover cursor-pointer"
            aria-label="Dismiss notice"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Material 3 Floating Action Button (FAB) */}
      {userRole !== 'viewer' && (activeTab === 'Overview' || activeTab === 'Transactions') && (
        <button
          type="button"
          onClick={() => { setEditingTx(null); setShowExpenseModal(true); }}
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] sm:bottom-20 right-4 sm:right-8 z-30 flex items-center gap-2 h-13 px-4 sm:px-5 rounded-2xl bg-google-blue hover:bg-google-blue-hover text-white shadow-lg shadow-google-blue/30 transition-all duration-200 cursor-pointer active:scale-95 select-none"
          title="Add Expense"
        >
          <Plus size={20} strokeWidth={2.2} />
          <span className="text-sm font-semibold tracking-tight">Add Expense</span>
        </button>
      )}

      {/* Bottom Navigation (Material 3 + Apple HIG) */}
      <footer className="bg-surface/85 backdrop-blur-md border-t border-border shrink-0 w-full z-20 pt-1.5 pb-[max(0.35rem,env(safe-area-inset-bottom,0px))]">
        <div className="w-full max-w-3xl mx-auto flex justify-around items-center h-13 sm:h-14 px-4 min-[390px]:px-6 sm:px-8 md:px-10">
          <NavItem 
            icon={<BarChart2 size={19} />} 
            label="Overview" 
            active={activeTab === 'Overview'} 
            onClick={() => setActiveTab('Overview')} 
          />
          <NavItem 
            icon={<BookOpen size={19} />} 
            label="Ledger" 
            active={activeTab === 'Transactions'} 
            onClick={() => setActiveTab('Transactions')} 
          />
          <NavItem 
            icon={<ShoppingBag size={19} />} 
            label="Shopping" 
            active={activeTab === 'Lists'} 
            onClick={() => setActiveTab('Lists')} 
          />
          <NavItem 
            icon={<Repeat size={19} />} 
            label="Fixed" 
            active={activeTab === 'Fixed'} 
            onClick={() => setActiveTab('Fixed')} 
          />
          <NavItem 
            icon={<Settings size={19} />} 
            label="Settings" 
            active={activeTab === 'Settings'} 
            onClick={() => setActiveTab('Settings')} 
          />
        </div>
      </footer>
    </div>
  );
}

function NavItem({ 
  icon, 
  label, 
  active, 
  onClick 
}: { 
  icon: React.ReactNode; 
  label: string; 
  active: boolean; 
  onClick: () => void; 
}) {
  return (
    <button 
      type="button"
      className="flex flex-col items-center justify-center cursor-pointer transition-colors group select-none min-w-[50px] min-[390px]:min-w-[56px] py-0.5"
      onClick={onClick}
    >
      <div 
        className={`w-12 h-7 rounded-full flex items-center justify-center transition-all duration-200 ${
          active 
            ? 'bg-google-blue/15 text-google-blue dark:bg-google-blue/20 dark:text-google-blue' 
            : 'text-text-secondary group-hover:text-text-primary'
        }`}
      >
        {icon}
      </div>
      <span className={`text-[11px] sm:text-xs tracking-tight leading-tight mt-0.5 transition-colors whitespace-nowrap ${
        active ? 'font-semibold text-google-blue' : 'font-medium text-text-secondary'
      }`}>
        {label}
      </span>
    </button>
  );
}
