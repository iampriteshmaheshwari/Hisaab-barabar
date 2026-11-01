import * as XLSX from 'xlsx';
import type { Transaction, CategoryData, ExpenseGroup, GroupMember } from '../types';
import { amountToIndianWords } from './indianCurrencyWords';

export interface ExportLedgerOptions {
  datePreset: 'all' | 'this_month' | 'last_month' | 'current_fy' | 'last_fy' | 'custom';
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  includeCategory: boolean;
  statusFilter: 'all' | 'settled' | 'unsettled';
}

export interface DateRangeBounds {
  startDate: string;
  endDate: string;
  label: string;
}

/**
 * Calculates standard Indian Financial Year (April 1 to March 31) and calendar presets.
 */
export function calculateDatePresetBounds(preset: ExportLedgerOptions['datePreset']): DateRangeBounds {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed (0 = Jan, 3 = April)

  const toIsoDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  switch (preset) {
    case 'this_month': {
      const start = new Date(currentYear, currentMonth, 1);
      const end = new Date(currentYear, currentMonth + 1, 0);
      return {
        startDate: toIsoDate(start),
        endDate: toIsoDate(end),
        label: start.toLocaleString('en-IN', { month: 'long', year: 'numeric' })
      };
    }
    case 'last_month': {
      const start = new Date(currentYear, currentMonth - 1, 1);
      const end = new Date(currentYear, currentMonth, 0);
      return {
        startDate: toIsoDate(start),
        endDate: toIsoDate(end),
        label: start.toLocaleString('en-IN', { month: 'long', year: 'numeric' })
      };
    }
    case 'current_fy': {
      // Indian Financial Year: April 1 to March 31
      const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
      const start = new Date(fyStartYear, 3, 1); // 1 April
      const end = new Date(fyStartYear + 1, 2, 31); // 31 March
      return {
        startDate: toIsoDate(start),
        endDate: toIsoDate(end),
        label: `FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`
      };
    }
    case 'last_fy': {
      const fyStartYear = (currentMonth >= 3 ? currentYear : currentYear - 1) - 1;
      const start = new Date(fyStartYear, 3, 1);
      const end = new Date(fyStartYear + 1, 2, 31);
      return {
        startDate: toIsoDate(start),
        endDate: toIsoDate(end),
        label: `FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`
      };
    }
    case 'all':
    default:
      return {
        startDate: '',
        endDate: '',
        label: 'All Time'
      };
  }
}

/**
 * Filter transactions based on date bounds and settlement status.
 */
export function filterTransactionsForExport(
  transactions: Transaction[],
  options: ExportLedgerOptions
): Transaction[] {
  let list = [...transactions].filter(t => !t.isDeleted);

  // Status filter
  if (options.statusFilter === 'settled') {
    list = list.filter(t => t.settled);
  } else if (options.statusFilter === 'unsettled') {
    list = list.filter(t => !t.settled);
  }

  // Date range filter
  let start = options.startDate;
  let end = options.endDate;

  if (options.datePreset !== 'custom' && options.datePreset !== 'all') {
    const bounds = calculateDatePresetBounds(options.datePreset);
    start = bounds.startDate;
    end = bounds.endDate;
  }

  if (start) {
    list = list.filter(t => (t.date || '').split('T')[0] >= start!);
  }
  if (end) {
    list = list.filter(t => (t.date || '').split('T')[0] <= end!);
  }

  // Sort chronologically ascending (Standard accounting order: oldest to newest for ledger)
  list.sort((a, b) => {
    const dateComp = (a.date || '').localeCompare(b.date || '');
    if (dateComp !== 0) return dateComp;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });

  return list;
}

/**
 * Formats a Date string into standard Indian DD/MM/YYYY
 */
export function formatIndianDate(dateStr?: string): string {
  if (!dateStr) return '';
  const datePart = dateStr.split('T')[0];
  const parts = datePart.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Parses Indian DD/MM/YYYY into standard YYYY-MM-DD
 */
export function parseIndianDateToIso(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const trimmed = dateStr.trim();
  // Check DD/MM/YYYY or DD-MM-YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, '0');
    const month = slashMatch[2].padStart(2, '0');
    const year = slashMatch[3];
    return `${year}-${month}-${day}`;
  }
  // Check ISO YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, '0');
    const day = isoMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return new Date().toISOString().split('T')[0];
}

/**
 * Format Indian currency with ₹ symbol and 2 decimals
 */
export function formatIndianCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Helper to determine member email and display name for a transaction
 */
function resolvePayerInfo(
  tx: Transaction,
  group?: ExpenseGroup | null,
  currentUserName?: string,
  currentUserEmail?: string
): { name: string; email: string } {
  // If paidBy or createdBy matches group member
  const payerKey = tx.paidBy || tx.createdBy || '';
  let payerEmail = '';
  let payerName = tx.paidByName || tx.createdByName || '';

  if (group?.members && payerKey) {
    // Check direct key match
    if (group.members[payerKey]?.email) {
      payerEmail = group.members[payerKey].email;
      payerName = payerName || group.members[payerKey].displayName || '';
    } else {
      // Find by uid or email
      const found = Object.values(group.members).find(
        m => m.uid === payerKey || m.email.toLowerCase() === payerKey.toLowerCase()
      );
      if (found) {
        payerEmail = found.email;
        payerName = payerName || found.displayName || '';
      }
    }
  }

  // Fallback to group owner or current user
  if (!payerEmail) {
    if (currentUserEmail) {
      payerEmail = currentUserEmail;
    } else if (group?.ownerEmail) {
      payerEmail = group.ownerEmail;
    }
  }

  if (!payerName) {
    payerName = currentUserName || payerEmail.split('@')[0] || 'Member';
  }

  return { name: payerName, email: payerEmail };
}

/**
 * Export to Indian Accounting Ledger CSV format.
 * Prepends UTF-8 BOM so MS Excel renders Rupee symbols properly.
 */
export function exportLedgerToCSV(
  transactions: Transaction[],
  categories: Record<string, CategoryData>,
  group: ExpenseGroup | null,
  options: ExportLedgerOptions,
  currentUserName?: string,
  currentUserEmail?: string
): void {
  const filtered = filterTransactionsForExport(transactions, options);
  const groupName = group?.name || 'Expense Ledger';
  const totalAmount = filtered.reduce((acc, t) => acc + (t.amount || 0), 0);

  // CSV Headers
  const headers = [
    'Transaction ID',
    'Date (DD/MM/YYYY)',
    'Particulars'
  ];

  if (options.includeCategory) {
    headers.push('Category');
  }

  headers.push(
    'Debit Amount (INR)',
    'Paid By',
    'Paid By Email',
    'Status',
    'Remarks'
  );

  const escapeCsv = (str: string | number | undefined | null) => {
    if (str === null || str === undefined) return '';
    const text = String(str).replace(/"/g, '""');
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text}"`;
    }
    return text;
  };

  const rows: string[] = [];

  // Metadata block in Indian Accounting Ledger header
  rows.push(`"Hisaab Barabar - Indian Accounting Expense Ledger"`);
  rows.push(`"Ledger Name:",${escapeCsv(groupName)}`);
  rows.push(`"Date Range:",${escapeCsv(options.datePreset !== 'all' ? `${options.startDate || ''} to ${options.endDate || ''}` : 'All Time')}`);
  rows.push(`"Exported By:",${escapeCsv(currentUserName ? `${currentUserName} (${currentUserEmail || ''})` : (currentUserEmail || 'User'))}`);
  rows.push(`"Exported On:",${escapeCsv(new Date().toLocaleString('en-IN'))}`);
  rows.push(`"Total Expenses:",${filtered.length}`);
  rows.push(`"Total Debit:",${totalAmount.toFixed(2)}`);
  rows.push(`"Amount in Words:","${amountToIndianWords(totalAmount)} Only"`);
  rows.push(''); // Empty line before table
  rows.push(headers.map(escapeCsv).join(','));

  // Data rows
  filtered.forEach((tx, idx) => {
    const txnId = `HB-${new Date(tx.date || Date.now()).getFullYear()}-${String(idx + 1).padStart(4, '0')}`;
    const dateFormatted = formatIndianDate(tx.date);
    const particulars = tx.name || 'Expense';
    const catName = categories[tx.category]?.name || tx.category || 'Other';
    const payer = resolvePayerInfo(tx, group, currentUserName, currentUserEmail);
    const status = tx.settled ? 'Settled' : 'Active';
    const amtWords = amountToIndianWords(tx.amount || 0);
    const remarks = tx.note && tx.note.trim().length > 0 ? tx.note.trim() : (amtWords ? `INR ${amtWords} Only` : '');

    const rowData: string[] = [
      txnId,
      dateFormatted,
      particulars
    ];

    if (options.includeCategory) {
      rowData.push(catName);
    }

    rowData.push(
      Number(tx.amount || 0).toFixed(2),
      payer.name,
      payer.email,
      status,
      remarks
    );

    rows.push(rowData.map(escapeCsv).join(','));
  });

  // Summary Row at the bottom
  rows.push('');
  const summaryRow: string[] = ['TOTAL', '', ''];
  if (options.includeCategory) summaryRow.push('');
  summaryRow.push(totalAmount.toFixed(2), '', '', '', `In Words: ${amountToIndianWords(totalAmount)} Only`);
  rows.push(summaryRow.map(escapeCsv).join(','));

  // Prepend UTF-8 BOM (\uFEFF)
  const csvContent = '\uFEFF' + rows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const cleanGroupName = (groupName || 'Ledger').replace(/[^a-zA-Z0-9_-]/g, '_');
  a.href = url;
  a.download = `${cleanGroupName}_Ledger_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export to Excel (.xlsx) using SheetJS with formatting and optional Category Breakdown.
 */
export function exportLedgerToExcel(
  transactions: Transaction[],
  categories: Record<string, CategoryData>,
  group: ExpenseGroup | null,
  options: ExportLedgerOptions,
  currentUserName?: string,
  currentUserEmail?: string
): void {
  const filtered = filterTransactionsForExport(transactions, options);
  const groupName = group?.name || 'Expense Ledger';
  const totalAmount = filtered.reduce((acc, t) => acc + (t.amount || 0), 0);

  // Create workbook
  const wb = XLSX.utils.book_new();

  // 1. General Ledger Sheet Data
  const sheetData: (string | number)[][] = [
    ['HISAAB BARABAR - GENERAL EXPENSE LEDGER'],
    ['Ledger Name', groupName],
    ['Date Range', options.datePreset !== 'all' ? `${options.startDate || ''} to ${options.endDate || ''}` : 'All Time'],
    ['Exported By', currentUserName ? `${currentUserName} (${currentUserEmail || ''})` : (currentUserEmail || 'User')],
    ['Generated On', new Date().toLocaleString('en-IN')],
    ['Total Expenses', filtered.length],
    ['Total Debit Amount (INR)', totalAmount],
    ['Amount in Words', `${amountToIndianWords(totalAmount)} Only`],
    [] // Blank row
  ];

  // Column headers
  const tableHeaders = ['Transaction ID', 'Date (DD/MM/YYYY)', 'Particulars'];
  if (options.includeCategory) {
    tableHeaders.push('Category');
  }
  tableHeaders.push('Debit Amount (₹)', 'Paid By', 'Paid By Email', 'Status', 'Remarks');
  sheetData.push(tableHeaders);

  // Table rows
  filtered.forEach((tx, idx) => {
    const txnId = `HB-${new Date(tx.date || Date.now()).getFullYear()}-${String(idx + 1).padStart(4, '0')}`;
    const dateFormatted = formatIndianDate(tx.date);
    const particulars = tx.name || 'Expense';
    const catName = categories[tx.category]?.name || tx.category || 'Other';
    const payer = resolvePayerInfo(tx, group, currentUserName, currentUserEmail);
    const status = tx.settled ? 'Settled' : 'Active';
    const amtWords = amountToIndianWords(tx.amount || 0);
    const remarks = tx.note && tx.note.trim().length > 0 ? tx.note.trim() : (amtWords ? `INR ${amtWords} Only` : '');

    const row: (string | number)[] = [
      txnId,
      dateFormatted,
      particulars
    ];

    if (options.includeCategory) {
      row.push(catName);
    }

    row.push(
      Number(tx.amount || 0),
      payer.name,
      payer.email,
      status,
      remarks
    );

    sheetData.push(row);
  });

  // Summary Row
  sheetData.push([]);
  const summaryRow: (string | number)[] = ['TOTAL', '', ''];
  if (options.includeCategory) summaryRow.push('');
  summaryRow.push(totalAmount, '', '', '', `In Words: ${amountToIndianWords(totalAmount)} Only`);
  sheetData.push(summaryRow);

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Auto-fit column widths
  const colWidths = [
    { wch: 14 }, // Voucher No
    { wch: 18 }, // Date
    { wch: 32 }  // Particulars
  ];
  if (options.includeCategory) {
    colWidths.push({ wch: 18 }); // Category
  }
  colWidths.push(
    { wch: 18 }, // Debit Amount
    { wch: 20 }, // Paid By
    { wch: 28 }, // Email
    { wch: 12 }, // Status
    { wch: 30 }  // Remarks
  );
  ws['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, 'General Ledger');

  // 2. Category Breakdown Sheet (Only if Category toggle is ON)
  if (options.includeCategory && filtered.length > 0) {
    const categoryTotals: Record<string, { count: number; total: number }> = {};
    filtered.forEach(t => {
      const catKey = t.category || 'other';
      if (!categoryTotals[catKey]) {
        categoryTotals[catKey] = { count: 0, total: 0 };
      }
      categoryTotals[catKey].count += 1;
      categoryTotals[catKey].total += t.amount || 0;
    });

    const catSheetData: (string | number)[][] = [
      ['CATEGORY-WISE EXPENSE SUMMARY'],
      ['Ledger Name', groupName],
      ['Total Vouchers', filtered.length],
      ['Total Expenses (INR)', totalAmount],
      [],
      ['Category Name', 'Voucher Count', 'Total Amount (₹)', '% of Total Spend']
    ];

    Object.entries(categoryTotals)
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([catKey, stat]) => {
        const catName = categories[catKey]?.name || catKey;
        const pct = totalAmount > 0 ? ((stat.total / totalAmount) * 100).toFixed(1) + '%' : '0%';
        catSheetData.push([catName, stat.count, stat.total, pct]);
      });

    catSheetData.push([]);
    catSheetData.push(['TOTAL', filtered.length, totalAmount, '100%']);

    const catWs = XLSX.utils.aoa_to_sheet(catSheetData);
    catWs['!cols'] = [{ wch: 22 }, { wch: 15 }, { wch: 20 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, catWs, 'Category Breakdown');
  }

  const cleanGroupName = (groupName || 'Ledger').replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `${cleanGroupName}_Ledger_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/**
 * Print & Export to PDF: Renders a pristine Indian Accounting Ledger Statement in a new print-ready window.
 */
export function exportLedgerToPrintablePDF(
  transactions: Transaction[],
  categories: Record<string, CategoryData>,
  group: ExpenseGroup | null,
  options: ExportLedgerOptions,
  currentUserName?: string,
  currentUserEmail?: string
): void {
  const filtered = filterTransactionsForExport(transactions, options);
  const groupName = group?.name || 'Expense Ledger';
  const totalAmount = filtered.reduce((acc, t) => acc + (t.amount || 0), 0);
  const inWords = amountToIndianWords(totalAmount) || 'Zero Rupees';
  const dateRangeLabel = options.datePreset !== 'all' 
    ? `${formatIndianDate(options.startDate) || 'Start'} to ${formatIndianDate(options.endDate) || 'End'}`
    : 'All Time';

  // Category breakdown calculation if category toggle is ON
  let categorySummaryHtml = '';
  if (options.includeCategory && filtered.length > 0) {
    const catMap: Record<string, { count: number; total: number }> = {};
    filtered.forEach(t => {
      const c = t.category || 'other';
      if (!catMap[c]) catMap[c] = { count: 0, total: 0 };
      catMap[c].count++;
      catMap[c].total += t.amount || 0;
    });

    const rows = Object.entries(catMap)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([k, v]) => {
        const name = categories[k]?.name || k;
        const pct = totalAmount > 0 ? ((v.total / totalAmount) * 100).toFixed(1) : '0';
        return `
          <tr>
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0; font-size: 11px;">${name}</td>
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; font-size: 11px;">${v.count}</td>
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: right; font-size: 11px; font-weight: 600;">₹${v.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td style="padding: 6px 10px; border: 1px solid #e2e8f0; text-align: right; font-size: 11px;">${pct}%</td>
          </tr>
        `;
      }).join('');

    categorySummaryHtml = `
      <div style="margin-top: 18px; margin-bottom: 22px;">
        <h4 style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; margin-bottom: 6px;">Category Summary</h4>
        <table style="width: 100%; max-width: 550px; border-collapse: collapse; margin-bottom: 12px;">
          <thead>
            <tr style="background: #f8fafc;">
              <th style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: left; font-size: 11px;">Category</th>
              <th style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: center; font-size: 11px;">Expenses</th>
              <th style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; font-size: 11px;">Amount (₹)</th>
              <th style="padding: 6px 10px; border: 1px solid #cbd5e1; text-align: right; font-size: 11px;">Share</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  const tableRowsHtml = filtered.map((tx, idx) => {
    const txnId = `HB-${new Date(tx.date || Date.now()).getFullYear()}-${String(idx + 1).padStart(4, '0')}`;
    const dateFormatted = formatIndianDate(tx.date);
    const particulars = tx.name || 'Expense';
    const catName = categories[tx.category]?.name || tx.category || 'Other';
    const payer = resolvePayerInfo(tx, group, currentUserName, currentUserEmail);
    const status = tx.settled ? 'Settled' : 'Active';
    const amtWords = amountToIndianWords(tx.amount || 0);
    const remarks = tx.note && tx.note.trim().length > 0 ? tx.note.trim() : (amtWords ? `INR ${amtWords} Only` : '—');

    return `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 7px 8px; font-family: monospace; font-size: 10.5px; color: #64748b;">${txnId}</td>
        <td style="padding: 7px 8px; font-size: 11px; white-space: nowrap;">${dateFormatted}</td>
        <td style="padding: 7px 8px; font-size: 11.5px; font-weight: 500; color: #1e293b;">${particulars}</td>
        ${options.includeCategory ? `<td style="padding: 7px 8px; font-size: 11px; color: #475569;">${catName}</td>` : ''}
        <td style="padding: 7px 8px; font-size: 11px; color: #334155;">${payer.name}<div style="font-size: 9.5px; color: #94a3b8;">${payer.email || ''}</div></td>
        <td style="padding: 7px 8px; font-size: 10.5px; text-align: center;">
          <span style="display: inline-block; padding: 2px 6px; border-radius: 9999px; font-size: 9.5px; font-weight: 600; background: ${tx.settled ? '#dcfce7; color: #15803d;' : '#e0e7ff; color: #3730a3;'}">${status}</span>
        </td>
        <td style="padding: 7px 8px; font-size: 11.5px; font-family: monospace; font-weight: 700; text-align: right; color: #0f172a;">₹${Number(tx.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        <td style="padding: 7px 8px; font-size: 10px; color: #475569; font-style: ${tx.note ? 'normal' : 'italic'};">${remarks}</td>
      </tr>
    `;
  }).join('');

  const printHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>${groupName} - Expense Ledger</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 12mm;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #0f172a;
          line-height: 1.4;
          margin: 0;
          padding: 10px;
          background: #fff;
        }
        .header-bar {
          border-bottom: 2px solid #1a73e8;
          padding-bottom: 12px;
          margin-bottom: 16px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }
        .app-brand {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #1a73e8;
          margin-bottom: 2px;
        }
        .ledger-title {
          font-size: 20px;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
        .meta-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 10px 14px;
          margin-bottom: 16px;
        }
        .meta-item {
          display: flex;
          flex-direction: column;
        }
        .meta-label {
          font-size: 9.5px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #64748b;
          font-weight: 600;
        }
        .meta-val {
          font-size: 13px;
          font-weight: 700;
          color: #1e293b;
        }
        table.ledger-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 14px;
        }
        table.ledger-table th {
          background: #f1f5f9;
          color: #334155;
          font-size: 10.5px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          padding: 8px;
          border-top: 1px solid #cbd5e1;
          border-bottom: 1px solid #cbd5e1;
          text-align: left;
        }
        .in-words-box {
          border: 1px dashed #94a3b8;
          border-radius: 6px;
          padding: 10px 14px;
          background: #fafaf9;
          margin-top: 14px;
          font-size: 11.5px;
        }
        .sign-area {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-top: 36px;
          padding-top: 14px;
        }
        .sign-block {
          font-size: 10.5px;
          color: #475569;
        }
        @media print {
          body { padding: 0; }
          .no-print { display: none !important; }
        }
      </style>
    </head>
    <body>
      <div class="no-print" style="margin-bottom: 14px; background: #e0f2fe; border: 1px solid #bae6fd; padding: 10px 14px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 12px; color: #0369a1; font-weight: 500;">
          Accounting Ledger Statement preview ready. Click Print or choose "Save as PDF" in your print window.
        </span>
        <button onclick="window.print()" style="background: #1a73e8; color: #fff; border: none; padding: 6px 14px; border-radius: 9999px; font-weight: 600; cursor: pointer; font-size: 12px;">
          Print / Save PDF
        </button>
      </div>

      <div class="header-bar">
        <div>
          <div class="app-brand">Hisaab Barabar • Accounting General Ledger</div>
          <h1 class="ledger-title">${groupName}</h1>
          <div style="font-size: 11.5px; color: #64748b; margin-top: 2px;">
            Statement Period: <strong>${dateRangeLabel}</strong>
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 10px; color: #64748b; text-transform: uppercase;">Generated Date</div>
          <div style="font-size: 12px; font-weight: 600; color: #1e293b;">${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
          <div style="font-size: 10px; color: #94a3b8;">${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </div>

      <div class="meta-grid">
        <div class="meta-item">
          <span class="meta-label">Total Expenses</span>
          <span class="meta-val">${filtered.length} entries</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Total Amount</span>
          <span class="meta-val" style="color: #1a73e8;">₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Statement Period</span>
          <span class="meta-val">${dateRangeLabel}</span>
        </div>
      </div>

      ${categorySummaryHtml}

      <table class="ledger-table">
        <thead>
          <tr>
            <th style="width: 14%;">Transaction ID</th>
            <th style="width: 11%;">Date</th>
            <th style="width: 25%;">Particulars</th>
            ${options.includeCategory ? '<th style="width: 14%;">Category</th>' : ''}
            <th style="width: 15%;">Paid By</th>
            <th style="width: 8%; text-align: center;">Status</th>
            <th style="width: 14%; text-align: right;">Amount (₹)</th>
            <th style="width: 14%;">Remarks</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml.length > 0 ? tableRowsHtml : '<tr><td colspan="8" style="text-align: center; padding: 24px; color: #94a3b8;">No transactions found in selected period</td></tr>'}
        </tbody>
        <tfoot>
          <tr style="background: #f8fafc; border-top: 2px solid #cbd5e1; border-bottom: 2px solid #cbd5e1;">
            <td colspan="${options.includeCategory ? 5 : 4}" style="padding: 9px 8px; font-weight: 700; font-size: 12px; text-transform: uppercase;">Total</td>
            <td></td>
            <td style="padding: 9px 8px; font-size: 13px; font-weight: 800; font-family: monospace; text-align: right; color: #0f172a;">₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <div class="in-words-box">
        <strong style="color: #334155;">Amount in Words (INR):</strong> 
        <span style="font-weight: 600; color: #0f172a;">${inWords} Only</span>
      </div>

      <div class="sign-area">
        <div class="sign-block" style="text-align: left; width: 240px;">
          <div style="font-weight: 700; color: #0f172a; font-size: 11.5px;">${currentUserName || 'Account Holder'}</div>
          ${currentUserEmail ? `<div style="font-size: 10px; color: #64748b; margin-top: 1px;">${currentUserEmail}</div>` : ''}
          <div style="font-size: 9px; color: #94a3b8; margin-top: 2px;">Exported on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
          <div style="border-top: 1px solid #94a3b8; margin-top: 6px; padding-top: 4px; font-size: 9.5px; color: #475569; font-weight: 600; text-transform: uppercase;">
            Prepared By (Exported By)
          </div>
        </div>
        <div class="sign-block" style="text-align: right; width: 200px;">
          <div style="height: 28px;"></div>
          <div style="border-top: 1px solid #94a3b8; margin-top: 6px; padding-top: 4px; font-size: 9.5px; color: #475569; font-weight: 600; text-transform: uppercase;">
            Verified & Reconciled
          </div>
        </div>
      </div>

      <div style="margin-top: 25px; text-align: center; font-size: 9.5px; color: #94a3b8;">
        Generated via Hisaab Barabar — India's Premier Expense & Debt Simplification Ledger
      </div>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(printHtml);
    printWindow.document.close();
  }
}

/**
 * Re-import Parser & Validator
 * Reads CSV or Excel file, validates that all paid-by email addresses match members of the target group.
 */
export interface ImportRowParsed {
  rowNumber: number;
  name: string;
  amount: number;
  date: string; // YYYY-MM-DD
  category: string;
  paidByName: string;
  paidByEmail: string;
  matchedMember?: GroupMember;
  isEmailMatched: boolean;
  settled: boolean;
  note?: string;
  voucherNo?: string;
}

export interface ImportValidationResult {
  validRows: ImportRowParsed[];
  totalRows: number;
  totalAmount: number;
  dateRange: { start: string; end: string };
  uniqueFileEmails: string[];
  matchedEmails: string[];
  unmatchedEmails: string[];
  groupMemberEmails: string[];
  canProceed: boolean;
  error?: string;
}

export async function parseAndValidateLedgerImport(
  file: File,
  group: ExpenseGroup | null,
  currentUserEmail?: string,
  currentUserName?: string
): Promise<ImportValidationResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          resolve({
            validRows: [],
            totalRows: 0,
            totalAmount: 0,
            dateRange: { start: '', end: '' },
            uniqueFileEmails: [],
            matchedEmails: [],
            unmatchedEmails: [],
            groupMemberEmails: [],
            canProceed: false,
            error: 'Could not read file.'
          });
          return;
        }

        // Parse workbook using SheetJS
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          resolve({
            validRows: [],
            totalRows: 0,
            totalAmount: 0,
            dateRange: { start: '', end: '' },
            uniqueFileEmails: [],
            matchedEmails: [],
            unmatchedEmails: [],
            groupMemberEmails: [],
            canProceed: false,
            error: 'The uploaded file contains no sheets.'
          });
          return;
        }

        const sheet = workbook.Sheets[sheetName];
        // Read raw 2D array
        const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (!rawRows || rawRows.length === 0) {
          resolve({
            validRows: [],
            totalRows: 0,
            totalAmount: 0,
            dateRange: { start: '', end: '' },
            uniqueFileEmails: [],
            matchedEmails: [],
            unmatchedEmails: [],
            groupMemberEmails: [],
            canProceed: false,
            error: 'The uploaded file is empty.'
          });
          return;
        }

        // Find header row: look for row containing 'Particulars' or 'Expense' or 'Date' or 'Debit'
        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
          const rowStr = rawRows[i].map(c => String(c).toLowerCase().trim());
          if (
            (rowStr.includes('particulars') || rowStr.includes('expense') || rowStr.includes('item') || rowStr.includes('name')) &&
            (rowStr.some(c => c.includes('date')) || rowStr.some(c => c.includes('debit') || c.includes('amount')))
          ) {
            headerRowIdx = i;
            break;
          }
        }

        if (headerRowIdx === -1) {
          // If no explicit header matched, assume row 0 if it has strings
          headerRowIdx = 0;
        }

        const headerCols = rawRows[headerRowIdx].map(c => String(c).toLowerCase().trim());

        // Map column indices
        const findCol = (...keywords: string[]) => {
          return headerCols.findIndex(col => keywords.some(k => col.includes(k)));
        };

        const voucherIdx = findCol('transaction id', 'txn id', 'id', 'voucher', 'ref');
        const dateIdx = findCol('date');
        const particularsIdx = findCol('particulars', 'expense', 'item', 'name', 'description');
        const categoryIdx = findCol('category');
        const amountIdx = findCol('debit', 'amount', 'cost', 'price', 'inr');
        const paidByNameIdx = findCol('paid by', 'payer', 'member');
        const paidByEmailIdx = findCol('email', 'mail');
        const statusIdx = findCol('status');
        const remarksIdx = findCol('remarks', 'note', 'comment');

        // Compile set of all group member emails
        const groupEmails = new Set<string>();
        if (group?.memberEmails) {
          group.memberEmails.forEach(m => m && groupEmails.add(m.trim().toLowerCase()));
        }
        if (group?.members) {
          Object.values(group.members).forEach(m => {
            if (m.email) groupEmails.add(m.email.trim().toLowerCase());
          });
        }
        if (group?.ownerEmail) {
          groupEmails.add(group.ownerEmail.trim().toLowerCase());
        }
        if (currentUserEmail) {
          groupEmails.add(currentUserEmail.trim().toLowerCase());
        }

        const groupMemberEmailsArray = Array.from(groupEmails);

        const parsedRows: ImportRowParsed[] = [];
        const fileEmails = new Set<string>();
        let minDate = '';
        let maxDate = '';

        for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!row || row.length === 0) continue;

          // Check if this row is a TOTAL summary row
          const firstCol = String(row[0] || '').trim().toUpperCase();
          if (firstCol === 'TOTAL' || firstCol.startsWith('TOTAL ') || firstCol.includes('AMOUNT IN WORDS')) {
            continue;
          }

          // Extract particulars
          const particulars = particularsIdx !== -1 && row[particularsIdx] ? String(row[particularsIdx]).trim() : '';
          if (!particulars) continue; // Skip blank rows

          // Extract amount
          let rawAmount = amountIdx !== -1 ? row[amountIdx] : 0;
          if (typeof rawAmount === 'string') {
            rawAmount = rawAmount.replace(/[^0-9.-]/g, '');
          }
          const numAmount = parseFloat(rawAmount) || 0;
          if (numAmount <= 0) continue; // Skip zero or invalid rows

          // Extract date
          let isoDate = new Date().toISOString().split('T')[0];
          if (dateIdx !== -1 && row[dateIdx]) {
            const rawDate = row[dateIdx];
            if (rawDate instanceof Date) {
              isoDate = rawDate.toISOString().split('T')[0];
            } else {
              isoDate = parseIndianDateToIso(String(rawDate));
            }
          }

          if (!minDate || isoDate < minDate) minDate = isoDate;
          if (!maxDate || isoDate > maxDate) maxDate = isoDate;

          // Extract category
          const rawCat = categoryIdx !== -1 && row[categoryIdx] ? String(row[categoryIdx]).trim().toLowerCase() : 'other';

          // Extract payer name and email
          const pName = paidByNameIdx !== -1 && row[paidByNameIdx] ? String(row[paidByNameIdx]).trim() : (currentUserName || 'Member');
          let pEmail = paidByEmailIdx !== -1 && row[paidByEmailIdx] ? String(row[paidByEmailIdx]).trim().toLowerCase() : '';

          // If no email column was provided in file, fallback to current user's email
          if (!pEmail && currentUserEmail) {
            pEmail = currentUserEmail.toLowerCase();
          }

          if (pEmail) {
            fileEmails.add(pEmail);
          }

          const isEmailMatched = pEmail ? groupEmails.has(pEmail) : true;

          // Find matched GroupMember if available
          let matchedMember: GroupMember | undefined;
          if (group?.members && pEmail) {
            matchedMember = Object.values(group.members).find(m => m.email.toLowerCase() === pEmail);
          }

          // Status & notes
          const rawStatus = statusIdx !== -1 && row[statusIdx] ? String(row[statusIdx]).toLowerCase() : '';
          const settled = rawStatus.includes('settled') || rawStatus.includes('paid');
          const note = remarksIdx !== -1 && row[remarksIdx] ? String(row[remarksIdx]).trim() : undefined;
          const voucherNo = voucherIdx !== -1 && row[voucherIdx] ? String(row[voucherIdx]).trim() : undefined;

          parsedRows.push({
            rowNumber: r + 1,
            name: particulars,
            amount: numAmount,
            date: isoDate,
            category: rawCat || 'other',
            paidByName: pName,
            paidByEmail: pEmail,
            matchedMember,
            isEmailMatched,
            settled,
            note,
            voucherNo
          });
        }

        if (parsedRows.length === 0) {
          resolve({
            validRows: [],
            totalRows: 0,
            totalAmount: 0,
            dateRange: { start: '', end: '' },
            uniqueFileEmails: [],
            matchedEmails: [],
            unmatchedEmails: [],
            groupMemberEmails: groupMemberEmailsArray,
            canProceed: false,
            error: 'No valid transaction rows found in the uploaded file.'
          });
          return;
        }

        const uniqueFileEmails = Array.from(fileEmails);
        const matchedEmails = uniqueFileEmails.filter(e => groupEmails.has(e));
        const unmatchedEmails = uniqueFileEmails.filter(e => !groupEmails.has(e));

        const totalAmount = parsedRows.reduce((acc, r) => acc + r.amount, 0);

        resolve({
          validRows: parsedRows,
          totalRows: parsedRows.length,
          totalAmount,
          dateRange: { start: minDate, end: maxDate },
          uniqueFileEmails,
          matchedEmails,
          unmatchedEmails,
          groupMemberEmails: groupMemberEmailsArray,
          canProceed: unmatchedEmails.length === 0
        });
      } catch (err: any) {
        resolve({
          validRows: [],
          totalRows: 0,
          totalAmount: 0,
          dateRange: { start: '', end: '' },
          uniqueFileEmails: [],
          matchedEmails: [],
          unmatchedEmails: [],
          groupMemberEmails: [],
          canProceed: false,
          error: `Error parsing file: ${err?.message || 'Invalid format'}`
        });
      }
    };

    reader.onerror = () => {
      resolve({
        validRows: [],
        totalRows: 0,
        totalAmount: 0,
        dateRange: { start: '', end: '' },
        uniqueFileEmails: [],
        matchedEmails: [],
        unmatchedEmails: [],
        groupMemberEmails: [],
        canProceed: false,
        error: 'Failed to read file from disk.'
      });
    };

    reader.readAsBinaryString(file);
  });
}
