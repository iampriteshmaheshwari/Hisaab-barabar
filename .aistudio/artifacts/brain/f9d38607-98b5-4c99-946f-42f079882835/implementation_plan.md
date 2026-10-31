# Shared Living & Flatmate Hisaab: Net Balances, Debtor Nudges & Frictionless Settlements

Empowers flatmates and hostel wings to effortlessly track shared expenses (mess outings, chai, birthday cakes, flat utilities) using a pure bilateral Net Balances model, private debtor-led settlement prompts, UPI/mobile profile integration, and creator-only double-confirmed deletion—while keeping family and household budget tracking 100% clean and untouched.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> **Summary of Confirmed Architectural Decisions:**
> 1. **Dual Ledger Modes:** Configured at the Group level:
>    - 🏠 *Family / Shared Budget (Pool Mode)*: Retains 100% of existing behavior—pure category budgeting, zero splits, zero IOU cards.
>    - 🤝 *Flat & Hostel (Split & Settle Mode)*: Enables member selection, net balance ledgers, and debtor settlement flows.
> 2. **Financial Model — Pure Net Balances (No per-expense checkoffs):** Expenses serve as immutable audit history. Bilateral running balances net out automatically across multiple expenses (e.g., ₹80 shake credit offsets a ₹300 dinner share to ₹220 net due).
> 3. **Social Tone & Privacy:** Neutral group feed (no public shaming or "unpaid" badges). Actionable prompts live privately on the debtor's personal dashboard card.
> 4. **Creator-Only Double-Confirmed Deletion:** Only the entry creator can delete an expense or settlement, requiring an explicit confirmation dialog explaining the balance impact.
> 5. **UPI ID & Mobile Details:** Members can configure their UPI VPA and phone number in their profile/member sheet for instant copy/deep-link settlement.
> 6. **Zero-Friction Onboarding ("Virtual Members"):** Roommates who haven't installed the app can be added as placeholder members immediately by name/phone, seamlessly linking when they sign up.

---

## 1. Overview & Core Concept

* **What It Does**: Bridges casual Indian roommate spending with automated bilateral debt calculation. When one flatmate pays out-of-pocket for food, drinks, or bills, expenses are split with selected flatmates in 5 seconds. Debtors are nudged quietly on their personal dashboard to settle via UPI/cash, and the recipient confirms receipt with one tap.
* **Target Audience / Persona**: College students living in hostels, young professionals sharing flats/PGs, and friends on weekend trips who want zero awkwardness chasing money.
* **Key Value**: Eradicates the "Payer's Burden / Chasing Tax"—putting the prompt on the debtor without petty public callouts, while mathematically eliminating messy micro-settlement tracking.

---

## 2. User Experience & Visual Design

### Key User Flows

```
┌────────────────────────────────────────────────────────────────────────┐
│                          LEDGER SELECTION                              │
│   Group Type: [🏠 Family / Budget]  vs  [🤝 Flat & Hostel (Split)]     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
              ┌────────────────────┴─────────────────────┐
              ▼                                          ▼
     [FAMILY LEDGER]                           [FLAT/HOSTEL LEDGER]
   Pure category totals,                    1. Add Expense (5 sec)
   shopping, fixed costs.                     - Paid by: [You ▾]
   (Zero IOU / split cards)                   - Split with: [✓X] [✓Y] [✓Z]
                                            2. Private Debtor Card
                                              - "You owe X ₹220 net"
                                            3. Settle Up Sheet
                                              - Copy UPI ID / Launch App
                                            4. Creator Confirmation & Deletion
                                              - Recipient verifies payment
                                              - Creator-only double-confirm delete
```

1. **Creating/Configuring a Group (`GroupModal.tsx`)**:
   - Selector during group creation: **Shared Budget (Family)** vs **Flat & Hostel (Split & Settle)**.
   - For Flat/Hostel groups: Ability to add both registered users and **Virtual Members** (e.g. "Rohit Room 204") with phone/UPI details.

2. **Logging a Shared Expense (`ExpenseModal.tsx`)**:
   - Takes 5 seconds: Input amount (`₹480`), title (`"Sunday Mess Dinner"`), category (`Food`).
   - In Flat Mode, shows clean inline split row:
     - `Paid by:` [User selector, defaults to current user]
     - `Split between:` Avatar chips with checkboxes for all active members. 1 tap deselects anyone absent or birthday honorees.
     - Live integer calculation chip: *₹120 / person (4 members)*.
   - Exact/Unequal split toggle for itemized bills when needed.

3. **The Overview Dashboard (`OverviewTab.tsx`)**:
   - **For Debtors**: A clean, high-contrast **"My Hisaab"** card at the top:
     > 💳 **You owe Amit ₹220 net** &nbsp;·&nbsp; `[Settle Up]`
   - **For Creditors**:
     > 📥 **You are owed ₹540 total** &nbsp;*(₹220 from Rahul, ₹320 from Vicky)*
   - **Neutral Group Feed**: Displays expenses with standard metadata: *"Sunday Mess Dinner · ₹480 · Paid by You · Split with 3 others"*. No accusatory labels.

4. **Settle Up Modal & Cross-Platform Payment (`SettleModal.tsx`)**:
   - Opens when tapping `[Settle Up]`:
     - Displays recipient's **UPI ID** with a 1-tap **Copy UPI ID** button.
     - Displays phone number with 1-tap **Copy Phone / Call**.
     - Provides standard `upi://pay` deep link for Android/supported devices.
     - Action button: **Record Settlement (₹220)**.
   - Recipient receives an in-app notice and one-tap **[Confirm Received]** to finalize the balance.

5. **Creator-Only Double-Confirmed Deletion**:
   - Delete icon is visible *only* to the user who created that transaction (or the group owner).
   - Clicking Delete triggers a prominent warning modal:
     > ⚠️ **Delete Expense?**  
     > Deleting *"Sunday Mess Dinner (₹480)"* will reverse the ₹120 share credited to all 4 members. This cannot be undone.  
     > `[Cancel]` &nbsp; `[Confirm Delete]`

---

### Visual Identity & Ergonomics
- **Domain Aesthetic**: Modern mobile-touch first utility (Tailwind CSS, high contrast daylight legibility, dark/light mode sync).
- **Anti-Slop Discipline**: Zero static pills; clean inline metadata separators (`·`). Semantic color accents: Emerald for credits/received, Amber/Orange for pending dues, Slate for neutral group spends.
- **Thumb Zone Compliance**: Primary action buttons and settlement triggers occupy bottom sheets with $\ge 44\text{px}$ touch targets.

---

## 3. Key Product Decisions & Trade-Offs

* **Decision 1: Pure Bilateral Net Balances over Per-Expense Statuses**
  - *Approach*: Maintain net pairwise balances between any two flatmates: $\text{Balance}(A, B) = \sum \text{PaidBy}_A^{\text{share}_B} - \sum \text{PaidBy}_B^{\text{share}_A} - \sum \text{Settlements}$.
  - *Why*: Prevents circular debt, avoids asking flatmates to confirm 20 separate ₹30-₹80 transactions, and guarantees math remains coherent.
  - *Alternatives Considered*: Per-expense status lists (rejected due to state conflicts when counter-expenses occur).

* **Decision 2: Creator-Only Deletion with Impact Warning**
  - *Approach*: Restrict expense edit/delete privileges to the original creator (`createdBy === user.uid`) or group owner.
  - *Why*: Eliminates rogue modifications where flatmates alter past bills to manipulate their dues.

* **Decision 3: Virtual / Placeholder Roommates**
  - *Approach*: Allow adding members by name and mobile before they create an AI Studio / Firebase account.
  - *Why*: Prevents 100% adoption blockage; when the roommate signs in later, their email or invite code links them to their virtual persona.

* **Decision 4: Rupee Integer Remainder Allocation**
  - *Approach*: When splitting ₹100 among 3 people, base share is ₹33. The remainder (₹1) is absorbed by the payer.
  - *Why*: Matches real-world Indian UPI behavior where fractions of a rupee are not transferred.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FIRESTORE SCHEMA EXTENSIONS                     │
│                                                                        │
│   groups/{groupId}                                                     │
│     ├── type: 'family_budget' | 'flatmates_split'                      │
│     ├── members: Record<uidOrId, {                                     │
│     │     name, email, phone?, upiId?, isVirtual?, role                │
│     │   }>                                                             │
│     │                                                                  │
│     ├── expenses/{expenseId}                                           │
│     │     ├── name, amount, category, date                             │
│     │     ├── paidBy: string (uid or memberId)                         │
│     │     ├── splitType: 'equal' | 'exact'                             │
│     │     ├── splits: Record<memberId, number> (shares)                │
│     │     └── createdBy, createdAt, updatedAt                          │
│     │                                                                  │
│     └── settlements/{settlementId}                                     │
│           ├── fromMemberId, toMemberId, amount, date                   │
│           ├── confirmed: boolean, confirmedAt?                         │
│           └── createdBy, createdAt                                     │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       REACTIVE RUNNING BALANCE HOOK                    │
│                                                                        │
│   useGroupBalances(groupId, expenses, settlements, currentUserId)      │
│     ├── Computes bilateral matrix: balances[userA][userB]              │
│     ├── Derives currentUser: { totalOwed, totalDue, netByMember }      │
│     └── Emits live state to OverviewTab & SettleModal                  │
└────────────────────────────────────────────────────────────────────────┘
```

### Component & State Mapping

1. **`src/types.ts`**:
   - Extend `ExpenseGroup` with `groupType?: 'family_budget' | 'flatmates_split'`.
   - Extend `GroupMember` with `upiId?: string`, `phoneNumber?: string`, `isVirtual?: boolean`.
   - Extend `Transaction` with `paidBy?: string`, `splitType?: 'equal' | 'exact'`, `splits?: Record<string, number>`, `isSettlement?: boolean`, `settlementData?: { from: string; to: string }`.

2. **`src/services/expenseService.ts`**:
   - `calculateGroupNetBalances(members, expenses, settlements)`: Pure deterministic matrix calculator handling integer split math and netting.
   - `addSplitExpenseToGroup(...)`, `updateSplitExpense(...)`, `recordSettlement(...)`, `confirmSettlement(...)`.
   - Guarded deletion: `canDeleteExpense(tx, user, groupRole)`.

3. **`src/components/modals/ExpenseModal.tsx`**:
   - Dynamic split selection interface with avatar chips, "Split with All" / "Custom" toggles, integer rounding math, and payer dropdown.

4. **`src/components/modals/SettleModal.tsx`**:
   - UPI VPA copy button, phone number copy button, deep link handler, and instant settlement record creator.

5. **`src/components/tabs/OverviewTab.tsx`**:
   - Contextual **"My Hisaab"** card rendering personal net obligations for Flat/Hostel groups; unrendered for Family/Budget groups.
