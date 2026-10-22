import { useState } from "react";
import { CalendarDays, ChevronDown, MoreHorizontal, Pencil, ReceiptText, Trash2 } from "lucide-react";
import { formatMoney } from "../../lib/money";
import { getCategory } from "../../lib/categories";
import { CATEGORIES } from "../../lib/categories";
import type { Category, Expense } from "../../types";

export default function ExpenseRow({
  expense,
  categories = CATEGORIES,
  canEdit,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  categories?: Category[];
  canEdit: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const category = getCategory(expense.categoryId, categories);
  const date = new Date(`${expense.expenseDate}T12:00:00`);
  function showDetails() {
    const nextOpen = !detailsOpen;
    setDetailsOpen(nextOpen);
  }

  return (
    <article className="expense-row">
      <span className="expense-category-icon" style={{ backgroundColor: `${category.color}20`, color: category.color }}>{category.icon}</span>
      <button className="expense-description expense-description-button" onClick={showDetails} aria-expanded={detailsOpen}>
        <strong>{expense.merchant || category.name}</strong>
        <span>{category.name}<i />{expense.createdByName || "Household member"}{expense.source === "receipt" && <><i /><span className="receipt-label"><ReceiptText size={12} /> Receipt</span></>}</span>
      </button>
      <div className="expense-date"><CalendarDays size={14} />{new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(date)}</div>
      <strong className="expense-amount">−{formatMoney(expense.amountMinor)}</strong>
      <button className={`icon-button details-toggle ${detailsOpen ? "expanded" : ""}`} aria-label={`${detailsOpen ? "Hide" : "View"} details for ${expense.merchant || category.name}`} aria-expanded={detailsOpen} onClick={showDetails}><ChevronDown size={16} /></button>
      {canEdit && <div className="expense-actions">
        <button className="icon-button row-menu-trigger" aria-label={`Options for ${expense.merchant || category.name}`} onClick={() => setMenuOpen(!menuOpen)}><MoreHorizontal size={19} /></button>
        {menuOpen && <div className="row-menu"><button onClick={() => { setMenuOpen(false); onEdit?.(); }}><Pencil size={14} /> Edit</button><button className="danger-text" onClick={() => { setMenuOpen(false); onDelete?.(); }}><Trash2 size={14} /> Delete</button></div>}
      </div>}
      {detailsOpen && <div className="expense-detail-panel"><div><span>Payment</span><strong>{expense.paymentMethod?.replaceAll("_", " ") ?? "Not specified"}</strong></div><div><span>Recorded by</span><strong>{expense.createdByName || "Household member"}</strong></div>{expense.notes && <div className="detail-notes"><span>Notes</span><strong>{expense.notes}</strong></div>}</div>}
    </article>
  );
}
