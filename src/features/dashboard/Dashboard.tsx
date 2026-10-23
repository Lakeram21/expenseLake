import { useMemo } from "react";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Camera, ChevronRight,
  CircleDollarSign, Plus, Sparkles, TrendingUp, Wallet,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import type {
  Budget, Category, Expense, Household, InvestmentAccount, InvestmentHolding,
  InvestmentIncome, InvestmentValuation,
} from "../../types";
import type { User } from "firebase/auth";
import { formatMoney } from "../../lib/money";
import { addMonths, formatMonth } from "../../lib/dates";
import { calculateBudget } from "../../services/budgetService";
import { totalForMonth, spendingByCategory } from "../../lib/analytics";
import { monthString } from "../../lib/dates";
import ExpenseRow from "../expenses/ExpenseRow";
import { investmentTotals } from "../../lib/investments";

export default function Dashboard({
  household,
  categories,
  month,
  expenses,
  investmentAccounts,
  investmentHoldings,
  investmentIncome,
  investmentValuations,
  budgets,
  greeting,
  onAddExpense,
  onScanReceipt,
  onViewExpenses,
  onViewReports,
  onViewInvestments,
}: {
  household: Household;
  categories: Category[];
  user: User;
  month: string;
  expenses: Expense[];
  investmentAccounts: InvestmentAccount[];
  investmentHoldings: InvestmentHolding[];
  investmentIncome: InvestmentIncome[];
  investmentValuations: InvestmentValuation[];
  budgets: Budget[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onAddExpense: () => void;
  onScanReceipt: () => void;
  onViewExpenses: () => void;
  onViewReports: () => void;
  onViewInvestments: () => void;
  onEditExpense: (expense: Expense) => void;
  greeting: string;
}) {
  const spent = totalForMonth(expenses, month);
  const portfolio = investmentTotals(
    expenses, investmentAccounts, investmentValuations, undefined, investmentIncome, investmentHoldings,
  );
  const otherCurrencyValues = [...portfolio.currentValueByCurrency.entries()]
    .filter(([currency, amount]) => currency !== "MXN" && amount > 0)
    .map(([currency, amount]) => new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount / 100));
  const overallBudget = budgets.find((budget) => budget.categoryId === "overall")?.limitMinor ?? 0;
  const overallProgress = overallBudget ? calculateBudget(overallBudget, spent) : null;
  const byCategory = spendingByCategory(expenses, month);
  const categoryData = categories.map((category) => ({
    name: category.name,
    value: byCategory.get(category.id) ?? 0,
    color: category.color,
    icon: category.icon,
  })).filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  const chartData = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const chartMonth = addMonths(month, index - 5);
    return { month: chartMonth, label: new Intl.DateTimeFormat("es-MX", { month: "short" }).format(new Date(`${chartMonth}-01T12:00:00`)), amount: totalForMonth(expenses, chartMonth) / 100 };
  }), [expenses, month]);
  const recent = useMemo(() => [...expenses].sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 5), [expenses]);

  return (
    <section className="dashboard-page">
      <div className="welcome-heading"><div><span className="eyebrow">{formatMonth(month).toUpperCase()} · HOUSEHOLD OVERVIEW</span><h1>Good morning, {greeting}<span className="greeting-comma">.</span></h1><p>Here’s how your household is doing this month.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={onScanReceipt}><Camera size={16} /> Scan receipt</button><button className="button button-primary" onClick={onAddExpense}><Plus size={17} /> Add expense</button></div></div>
      <div className="summary-grid">
        <article className="summary-card total-card"><div className="summary-top"><span className="summary-label">Total spent</span><span className="summary-icon"><CircleDollarSign size={18} /></span></div><strong className="summary-amount">{formatMoney(spent)}</strong><span className="summary-foot">{month === monthString() ? "So far this month" : `During ${formatMonth(month)}`}</span><span className="card-sparkline" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /></span></article>
        <article className="summary-card"><div className="summary-top"><span className="summary-label">Monthly budget</span><span className="summary-icon sage"><Wallet size={18} /></span></div><strong className="summary-amount">{overallBudget ? formatMoney(overallBudget) : "Not set"}</strong><span className="summary-foot">{overallBudget ? `${overallProgress?.percentUsed.toFixed(0)}% of your limit` : "Set a monthly household limit"}</span>{overallBudget && <div className={`mini-progress ${overallProgress?.status ?? ""}`}><i style={{ width: `${Math.min(overallProgress?.percentUsed ?? 0, 100)}%` }} /></div>}</article>
        <article className={`summary-card remaining-card ${(overallProgress?.status === "over" || (overallProgress && overallProgress.remainingMinor < 0)) ? "is-over" : ""}`}><div className="summary-top"><span className="summary-label">Still available</span><span className="summary-icon cream"><ArrowDownRight size={18} /></span></div><strong className="summary-amount">{overallBudget ? formatMoney(Math.max(0, overallProgress?.remainingMinor ?? 0)) : "—"}</strong><span className="summary-foot">{overallBudget ? (overallProgress!.remainingMinor < 0 ? `${formatMoney(Math.abs(overallProgress!.remainingMinor))} over budget` : "Left for the rest of the month") : "Your remaining budget will appear here"}</span></article>
        <button className="summary-card investment-summary-card" onClick={onViewInvestments}><div className="summary-top"><span className="summary-label">Investments · tracked total</span><span className="summary-icon sage"><TrendingUp size={18} /></span></div><strong className="summary-amount">{formatMoney(portfolio.currentValueMinor)}</strong><span className="summary-foot">{formatMoney(portfolio.contributedMinor)} contributed to date · View accounts</span>{otherCurrencyValues.length > 0 && <span className="summary-foot">{otherCurrencyValues.join(" · ")} in other currencies</span>}</button>
      </div>
      <div className="dashboard-charts">
        <article className="content-card trend-card"><div className="card-heading"><div><h2>Spending trend</h2><p>Your monthly household spending</p></div><span className="card-heading-icon"><ArrowUpRight size={17} /></span></div>{expenses.length === 0 ? <div className="chart-empty"><span className="empty-icon"><Sparkles size={20} /></span><strong>Your trend starts here</strong><span>Add your first expense to see a monthly pattern.</span></div> : <div className="trend-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 12, right: 6, left: -14, bottom: 0 }}><defs><linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#639a78" stopOpacity={0.18} /><stop offset="100%" stopColor="#639a78" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf0eb" strokeDasharray="3 5" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#929b93", fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "#929b93", fontSize: 10 }} tickFormatter={(value: number) => `$${value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}`} /><Tooltip formatter={(value: number) => [formatMoney(Math.round(value * 100)), "Spent"]} labelFormatter={(_, payload) => payload?.[0]?.payload.month ? formatMonth(payload[0].payload.month) : ""} contentStyle={{ borderRadius: 10, borderColor: "#edf0eb", fontSize: 12 }} /><Area type="monotone" dataKey="amount" stroke="#639a78" strokeWidth={2.5} fill="url(#spendFill)" activeDot={{ r: 4, fill: "#639a78", strokeWidth: 0 }} /></AreaChart></ResponsiveContainer></div>}</article>
        <article className="content-card category-card"><div className="card-heading"><div><h2>Spending by category</h2><p>Where your money went</p></div><button className="link-icon" aria-label="View reports" onClick={onViewReports}><ChevronRight size={17} /></button></div>{categoryData.length === 0 ? <div className="chart-empty short"><span className="empty-icon"><CircleDollarSign size={20} /></span><strong>No spending yet</strong><span>Categories appear once you add expenses.</span></div> : <div className="category-chart-layout"><div className="donut-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryData} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="92%" paddingAngle={3} stroke="none">{categoryData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip formatter={(value: number) => formatMoney(value)} contentStyle={{ borderRadius: 10, borderColor: "#edf0eb", fontSize: 12 }} /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{categoryData.length}</strong><span>categories</span></div></div><div className="category-legend">{categoryData.slice(0, 4).map((item) => <div key={item.name}><span><i style={{ backgroundColor: item.color }} />{item.name}</span><strong>{formatMoney(item.value)}</strong></div>)}</div></div>}</article>
      </div>
      <div className="dashboard-lower">
        <article className="content-card recent-card"><div className="card-heading"><div><h2>Recent expenses</h2><p>The latest from your household</p></div><button className="text-link" onClick={onViewExpenses}>View all <ArrowRight size={14} /></button></div>{recent.length === 0 ? <div className="recent-empty"><span className="empty-icon"><Wallet size={20} /></span><div><strong>Your transactions will appear here</strong><span>Log a receipt or enter one manually to get started.</span></div><button className="button button-secondary compact" onClick={onAddExpense}><Plus size={15} /> Add first expense</button></div> : <div className="recent-list">{recent.map((expense) => <ExpenseRow key={expense.id} expense={expense} categories={categories} canEdit={false} />)}</div>}</article>
        <article className="insight-card"><div className="insight-icon"><Sparkles size={18} /></div><span className="eyebrow">A GOOD HABIT</span><h3>Small steps add up.</h3><p>A quick note on your receipt today can make next month’s report even more useful.</p><button onClick={onScanReceipt}>Scan a receipt <ArrowRight size={14} /></button><div className="insight-decoration" aria-hidden="true">✳</div></article>
      </div>
      <span className="sr-only">Household: {household.name}</span>
    </section>
  );
}
