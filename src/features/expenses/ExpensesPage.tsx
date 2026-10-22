import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, Plus, CalendarRange, ReceiptText } from "lucide-react";
import { deleteExpense } from "../../services/expenseService";
import type { Budget, Category, Expense, Household } from "../../types";
import type { User } from "firebase/auth";
import ExpenseRow from "./ExpenseRow";
import { formatMoney } from "../../lib/money";

export default function ExpensesPage({
  household,
  user,
  categories,
  expenses,
  onRefresh,
  onAddExpense,
  onScanReceipt,
  onEditExpense,
}: {
  household: Household;
  user: User;
  categories: Category[];
  month: string;
  expenses: Expense[];
  budgets: Budget[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onAddExpense: () => void;
  onScanReceipt: () => void;
  onEditExpense: (expense: Expense) => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [error, setError] = useState("");
  const filtered = useMemo(() => expenses.filter((expense) => {
    const matchesText = `${expense.merchant ?? ""} ${expense.notes} ${expense.createdByName}`.toLowerCase().includes(search.toLowerCase());
    return matchesText && (category === "all" || expense.categoryId === category) &&
      (!fromDate || expense.expenseDate >= fromDate) && (!toDate || expense.expenseDate <= toDate);
  }), [expenses, search, category, fromDate, toDate]);
  const total = filtered.reduce((sum, expense) => sum + expense.amountMinor, 0);
  const groups = useMemo(() => filtered.reduce<Record<string, Expense[]>>((result, expense) => {
    (result[expense.expenseDate.slice(0, 7)] ??= []).push(expense);
    return result;
  }, {}), [filtered]);

  async function remove(expense: Expense) {
    if (!window.confirm(`Delete ${expense.merchant || "this expense"} for ${formatMoney(expense.amountMinor)}? This cannot be undone.`)) return;
    setError("");
    try { await deleteExpense(household.id, expense.id); await onRefresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Couldn't delete the expense."); }
  }

  return (
    <section className="feature-page">
      <div className="page-heading"><div><span className="eyebrow">YOUR HOUSEHOLD, AT A GLANCE</span><h1>Expenses</h1><p>Everyday spending, recorded together.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={onScanReceipt}><ReceiptText size={16} /> Scan receipt</button><button className="button button-primary" onClick={onAddExpense}><Plus size={17} /> Add expense</button></div></div>
      <div className="expenses-summary-strip"><div><span>Transactions</span><strong>{filtered.length}</strong></div><div><span>Total shown</span><strong>{formatMoney(total)}</strong></div><div><span>Recorded by you</span><strong>{filtered.filter((expense) => expense.createdBy === user.uid).length}</strong></div></div>
      <section className="content-card expense-list-card">
        <div className="list-tools"><div className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search merchant or notes" aria-label="Search expenses" /></div><button className={`button button-secondary filter-trigger ${filterOpen ? "active" : ""}`} onClick={() => setFilterOpen(!filterOpen)}><SlidersHorizontal size={16} /> Filters</button></div>
        {filterOpen && <div className="filter-panel"><label className="field"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field"><span>From</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label className="field"><span>To</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label><button className="text-link" onClick={() => { setCategory("all"); setFromDate(""); setToDate(""); }}>Clear filters</button></div>}
        {error && <p className="form-error inline-error" role="alert">{error}</p>}
        {filtered.length === 0 ? <div className="empty-state"><span className="empty-icon"><CalendarRange size={23} /></span><h3>{expenses.length ? "No expenses match those filters" : "A fresh start"}</h3><p>{expenses.length ? "Try changing your search or clearing filters." : "When you add your first expense, it’ll show up here."}</p>{expenses.length === 0 && <button className="button button-primary" onClick={onAddExpense}><Plus size={16} /> Add an expense</button>}</div> :
          <div className="expense-groups">{Object.entries(groups).sort(([a], [b]) => b.localeCompare(a)).map(([month, items]) => <section className="expense-group" key={month}><div className="group-heading"><strong>{new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`))}</strong><span>{items.length} {items.length === 1 ? "transaction" : "transactions"}</span></div>{items.map((expense) => <ExpenseRow key={expense.id} expense={expense} categories={categories} canEdit={expense.createdBy === user.uid} onEdit={() => onEditExpense(expense)} onDelete={() => void remove(expense)} />)}</section>)}</div>}
      </section>
    </section>
  );
}
