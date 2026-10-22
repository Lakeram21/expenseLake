import { useMemo, useState, type FormEvent } from "react";
import { ArrowDownRight, ArrowUpRight, Check, CircleAlert, Plus, Wallet } from "lucide-react";
import type { Budget, Expense, Household } from "../../types";
import type { User } from "firebase/auth";
import { formatMoney, parseAmountToMinor } from "../../lib/money";
import { budgetForCategory, spendingByCategory } from "../../lib/analytics";
import { calculateBudget, saveBudget } from "../../services/budgetService";
import { createCategory } from "../../services/categoryService";
import { formatMonth } from "../../lib/dates";
import type { Category } from "../../types";

export default function BudgetsPage({
  household,
  categories,
  month,
  expenses,
  budgets,
  onRefresh,
}: {
  household: Household;
  categories: Category[];
  user: User;
  month: string;
  expenses: Expense[];
  budgets: Budget[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onAddExpense: () => void;
  onScanReceipt: () => void;
  onEditExpense: (expense: Expense) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryIcon, setCategoryIcon] = useState("✳️");
  const spentByCategory = useMemo(() => spendingByCategory(expenses, month), [expenses, month]);
  const overallSpent = [...spentByCategory.values()].reduce((sum, value) => sum + value, 0);
  const overallLimit = budgetForCategory(budgets, "overall");
  const overallProgress = calculateBudget(overallLimit, overallSpent);

  async function save(categoryId: string) {
    setError("");
    try {
      const amountMinor = parseAmountToMinor(amount);
      setBusy(true);
      await saveBudget(household.id, month, categoryId, amountMinor);
      setEditing(null);
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save the budget.");
    } finally {
      setBusy(false);
    }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await createCategory(household.id, categoryName, categoryIcon);
      setCategoryName("");
      setCategoryIcon("✳️");
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't add the category.");
    } finally {
      setBusy(false);
    }
  }

  function beginEdit(categoryId: string, current: number) {
    setEditing(categoryId);
    setAmount(current > 0 ? (current / 100).toFixed(2) : "");
    setError("");
  }

  return (
    <section className="feature-page">
      <div className="page-heading"><div><span className="eyebrow">PLAN WITH A LITTLE MORE CLARITY</span><h1>Budgets</h1><p>Set a monthly limit that feels right for your household.</p></div><div className="budget-period"><span>MONTHLY PLAN</span><strong>{formatMonth(month)}</strong></div></div>
      {error && <div className="page-alert" role="alert">{error}</div>}
      <article className={`overall-budget-card ${overallProgress.status === "over" ? "over" : ""}`}>
        <div className="overall-budget-main"><span className="overall-icon"><Wallet size={21} /></span><div><span className="eyebrow">WHOLE HOUSEHOLD</span><h2>Monthly spending limit</h2><p>One shared limit across all your categories.</p></div></div>
        {editing === "overall" ? <div className="budget-edit-control"><span>$</span><input autoFocus inputMode="decimal" aria-label="Overall monthly budget in pesos" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /><button className="button button-primary compact" disabled={busy} onClick={() => void save("overall")}><Check size={15} /> Save</button></div> : <button className="overall-limit-button" onClick={() => beginEdit("overall", overallLimit)}>{overallLimit ? formatMoney(overallLimit) : <><Plus size={16} /> Set limit</>}<span>{overallLimit ? "Edit limit" : "MXN per month"}</span></button>}
        {overallLimit > 0 && <div className="overall-progress-area"><div className="overall-progress-label"><span>{formatMoney(overallSpent)} spent</span><span>{overallProgress.percentUsed.toFixed(0)}% used</span><span>{overallProgress.remainingMinor < 0 ? `${formatMoney(Math.abs(overallProgress.remainingMinor))} over` : `${formatMoney(overallProgress.remainingMinor)} left`}</span></div><div className={`budget-progress ${overallProgress.status}`}><i style={{ width: `${Math.min(overallProgress.percentUsed, 100)}%` }} /></div>{overallProgress.status === "over" && <span className="over-budget-note"><CircleAlert size={14} /> You’re over your household budget this month.</span>}</div>}
      </article>
      <div className="budget-section-heading"><div><h2>Category budgets</h2><p>Give each part of life a limit of its own.</p></div><span>{budgets.filter((budget) => budget.categoryId !== "overall").length} set this month</span></div>
      <form className="content-card invite-form category-create-form" onSubmit={(event) => void addCategory(event)}>
        <div><strong>Add a category</strong><span>New categories are shared with your household and available for expenses and budgets.</span></div>
        <label className="field"><span>Category name</span><input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="e.g. Pets" minLength={2} maxLength={40} required /></label>
        <label className="field"><span>Icon</span><input value={categoryIcon} onChange={(event) => setCategoryIcon(event.target.value)} aria-label="Category icon" maxLength={8} /></label>
        <button className="button button-primary" disabled={busy}><Plus size={16} /> Add category</button>
      </form>
      <div className="budget-grid">{categories.map((category) => {
        const limit = budgetForCategory(budgets, category.id);
        const spent = spentByCategory.get(category.id) ?? 0;
        const progress = calculateBudget(limit, spent);
        const isEditing = editing === category.id;
        return <article className={`category-budget-card ${progress.status === "over" && limit ? "over" : ""}`} key={category.id}>
          <div className="budget-card-heading"><span className="expense-category-icon" style={{ backgroundColor: `${category.color}20`, color: category.color }}>{category.icon}</span><div><strong>{category.name}</strong><span>{spent ? `${formatMoney(spent)} spent` : "No spending yet"}</span></div><button className="budget-edit-link" onClick={() => beginEdit(category.id, limit)}>{limit ? "Edit" : "Set limit"}</button></div>
          {limit ? <><div className="budget-card-amounts"><strong>{formatMoney(limit)}</strong><span>{progress.remainingMinor < 0 ? `${formatMoney(Math.abs(progress.remainingMinor))} over` : `${formatMoney(progress.remainingMinor)} left`}</span></div><div className={`budget-progress ${progress.status}`}><i style={{ width: `${Math.min(progress.percentUsed, 100)}%` }} /></div><div className={`budget-status ${progress.status}`}>{progress.status === "over" ? <><ArrowUpRight size={13} /> Over budget</> : progress.status === "warning" ? <><CircleAlert size={13} /> Almost at your limit</> : <><ArrowDownRight size={13} /> {progress.percentUsed.toFixed(0)}% used</>}</div></> : <div className="budget-not-set">Set a limit to keep an eye on this category.</div>}
          {isEditing && <div className="inline-budget-editor"><label className="field"><span>Monthly limit (MXN)</span><div className="input-wrap"><span>$</span><input autoFocus inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></div></label><div><button className="text-link" onClick={() => setEditing(null)}>Cancel</button><button className="button button-primary compact" disabled={busy} onClick={() => void save(category.id)}><Check size={14} /> Save</button></div></div>}
        </article>;
      })}</div>
      <div className="budget-footnote">Budgets are monthly and shared with everyone in {household.name}. Expenses count once in their assigned category.</div>
    </section>
  );
}
