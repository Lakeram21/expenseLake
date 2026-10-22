import { useMemo, useState } from "react";
import { Download, FileDown, TrendingUp } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import type { Budget, Category, Expense, Household } from "../../types";
import type { User } from "firebase/auth";
import { getCategory } from "../../lib/categories";
import { formatMoney } from "../../lib/money";
import { addMonths, formatMonth, monthString } from "../../lib/dates";

function csvCell(value: string | number): string {
  const text = String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(expenses: Expense[], categories: Category[]) {
  const headings = ["Date", "Merchant", "Category", "Amount (MXN)", "Payment method", "Recorded by", "Source", "Notes"];
  const rows = expenses.map((expense) => [
    expense.expenseDate,
    expense.merchant ?? "",
    getCategory(expense.categoryId, categories).name,
    (expense.amountMinor / 100).toFixed(2),
    expense.paymentMethod ?? "",
    expense.createdByName ?? "",
    expense.source,
    expense.notes,
  ]);
  const csv = [headings, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `expenselake-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReportsPage({
  household,
  categories,
  month,
  expenses,
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
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const filtered = useMemo(() => expenses.filter((expense) => (!fromDate || expense.expenseDate >= fromDate) && (!toDate || expense.expenseDate <= toDate)), [expenses, fromDate, toDate]);
  const total = filtered.reduce((sum, expense) => sum + expense.amountMinor, 0);
  const categoryTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const expense of filtered) totals.set(expense.categoryId, (totals.get(expense.categoryId) ?? 0) + expense.amountMinor);
    return categories.map((category) => ({ name: category.name, value: totals.get(category.id) ?? 0, color: category.color })).filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  }, [filtered, categories]);
  const merchantTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const expense of filtered) {
      const name = expense.merchant?.trim() || "No merchant";
      totals.set(name, (totals.get(name) ?? 0) + expense.amountMinor);
    }
    return [...totals].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [filtered]);
  const memberTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const expense of filtered) {
      const name = expense.createdByName || "Household member";
      totals.set(name, (totals.get(name) ?? 0) + expense.amountMinor);
    }
    return [...totals].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);
  const monthlyTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const expense of filtered) {
      const month = expense.expenseDate.slice(0, 7);
      totals.set(month, (totals.get(month) ?? 0) + expense.amountMinor);
    }
    const lastMonth = toDate ? toDate.slice(0, 7) : month || monthString();
    const firstMonth = fromDate ? fromDate.slice(0, 7) : addMonths(lastMonth, -5);
    const [firstYear, firstMonthNumber] = firstMonth.split("-").map(Number);
    const [lastYear, lastMonthNumber] = lastMonth.split("-").map(Number);
    const span = (lastYear - firstYear) * 12 + lastMonthNumber - firstMonthNumber;
    if (span < 0) return [];
    const chartStart = span > 23 ? addMonths(lastMonth, -23) : firstMonth;
    const [startYear, startMonthNumber] = chartStart.split("-").map(Number);
    const count = (lastYear - startYear) * 12 + lastMonthNumber - startMonthNumber + 1;
    return Array.from({ length: count }, (_, index) => {
      const current = addMonths(chartStart, index);
      return { month: current, label: new Intl.DateTimeFormat("es-MX", { month: "short" }).format(new Date(`${current}-01T12:00:00`)), value: (totals.get(current) ?? 0) / 100 };
    });
  }, [filtered, month, fromDate, toDate]);
  const activeMonthCount = new Set(filtered.map((expense) => expense.expenseDate.slice(0, 7))).size;
  const latestMonth = monthlyTotals.at(-1);
  const previousMonth = monthlyTotals.at(-2);
  const change = latestMonth && previousMonth && previousMonth.value > 0 ? ((latestMonth.value - previousMonth.value) / previousMonth.value) * 100 : null;

  return (
    <section className="feature-page">
      <div className="page-heading"><div><span className="eyebrow">A CLEARER PICTURE OF YOUR SPENDING</span><h1>Reports</h1><p>Patterns and progress for {household.name}.</p></div><button className="button button-primary" onClick={() => downloadCsv(filtered, categories)}><Download size={16} /> Export CSV</button></div>
      <div className="report-filter content-card"><div><span className="filter-icon"><FileDown size={17} /></span><div><strong>Choose a date range</strong><span>Only this household’s expenses are included.</span></div></div><label className="field"><span>From</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label className="field"><span>To</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label><button className="text-link" onClick={() => { setFromDate(""); setToDate(""); }}>Clear</button></div>
      <div className="report-summary-grid"><article className="report-summary-card"><span>Total expenses</span><strong>{formatMoney(total)}</strong><small>{filtered.length} transactions</small></article><article className="report-summary-card"><span>Monthly average</span><strong>{activeMonthCount ? formatMoney(Math.round(total / activeMonthCount)) : formatMoney(0)}</strong><small>Based on {activeMonthCount} months with spending</small></article><article className="report-summary-card"><span>Month over month</span><strong className={change !== null && change > 0 ? "negative-change" : "positive-change"}>{change === null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}</strong><small>{latestMonth && previousMonth ? `${formatMonth(previousMonth.month)} → ${formatMonth(latestMonth.month)}` : "Add more monthly data to compare"}</small></article></div>
      <div className="report-charts">
        <article className="content-card report-trend"><div className="card-heading"><div><h2>Monthly spending</h2><p>Household totals, by month</p></div><span className="card-heading-icon"><TrendingUp size={17} /></span></div>{monthlyTotals.length === 0 ? <div className="chart-empty"><strong>No spending to report yet</strong><span>Add a few expenses to see your trends.</span></div> : <div className="report-bar-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyTotals} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf0eb" strokeDasharray="3 5" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#929b93", fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "#929b93", fontSize: 10 }} tickFormatter={(value: number) => `$${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`} /><Tooltip formatter={(value: number) => [formatMoney(Math.round(value * 100)), "Spent"]} contentStyle={{ borderRadius: 10, borderColor: "#edf0eb", fontSize: 12 }} /><Bar dataKey="value" fill="#77a685" radius={[5, 5, 0, 0]} maxBarSize={38} /></BarChart></ResponsiveContainer></div>}</article>
        <article className="content-card report-category"><div className="card-heading"><div><h2>By category</h2><p>Share of total spending</p></div></div>{categoryTotals.length === 0 ? <div className="chart-empty short"><strong>No categories yet</strong></div> : <div className="report-category-layout"><div className="report-pie"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryTotals} dataKey="value" innerRadius="64%" outerRadius="90%" paddingAngle={2} stroke="none">{categoryTotals.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={(value: number) => formatMoney(value)} /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{formatMoney(total)}</strong><span>total</span></div></div><div className="category-legend report-legend">{categoryTotals.slice(0, 5).map((item) => <div key={item.name}><span><i style={{ backgroundColor: item.color }} />{item.name}</span><strong>{total ? `${Math.round(item.value / total * 100)}%` : "0%"}</strong></div>)}</div></div>}</article>
      </div>
      <div className="report-lower">
        <article className="content-card ranked-card"><div className="card-heading"><div><h2>Top merchants</h2><p>Where you spent the most</p></div></div>{merchantTotals.length ? <div className="ranked-list">{merchantTotals.map((item, index) => <div key={item.name}><span className="rank-number">0{index + 1}</span><span className="rank-name">{item.name}</span><div className="rank-track"><i style={{ width: `${merchantTotals[0].value ? item.value / merchantTotals[0].value * 100 : 0}%` }} /></div><strong>{formatMoney(item.value)}</strong></div>)}</div> : <div className="empty-inline">Merchant details appear after you log a transaction.</div>}</article>
        <article className="content-card ranked-card"><div className="card-heading"><div><h2>By household member</h2><p>Who recorded the expense</p></div></div>{memberTotals.length ? <div className="ranked-list">{memberTotals.map((item, index) => <div key={item.name}><span className="member-dot">{item.name.charAt(0).toUpperCase()}</span><span className="rank-name">{item.name}</span><div className="rank-track"><i className={index > 0 ? "member-bar" : ""} style={{ width: `${memberTotals[0].value ? item.value / memberTotals[0].value * 100 : 0}%` }} /></div><strong>{formatMoney(item.value)}</strong></div>)}</div> : <div className="empty-inline">Member totals appear after expenses are recorded.</div>}</article>
      </div>
    </section>
  );
}
