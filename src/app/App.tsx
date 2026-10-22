import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import {
  Activity, ArrowDownLeft, ArrowLeft, ArrowRight, ChevronDown, CircleHelp,
  FileBarChart2, Home, LayoutDashboard, LogOut, Menu, Plus, Settings,
  ShieldCheck, Wallet, X,
} from "lucide-react";
import { auth, firebaseConfigured } from "../lib/firebase";
import { listExpenses } from "../services/expenseService";
import { getUserHousehold } from "../services/householdService";
import { listBudgets } from "../services/budgetService";
import { listCategories } from "../services/categoryService";
import { monthString, addMonths, formatMonth } from "../lib/dates";
import { CATEGORIES } from "../lib/categories";
import type { Budget, Category, Expense, Household } from "../types";
import AuthScreen from "./AuthScreen";
import HouseholdSetup from "./HouseholdSetup";
const Dashboard = lazy(() => import("../features/dashboard/Dashboard"));
const ExpensesPage = lazy(() => import("../features/expenses/ExpensesPage"));
const BudgetsPage = lazy(() => import("../features/budgets/BudgetsPage"));
const ReportsPage = lazy(() => import("../features/reports/ReportsPage"));
const SettingsPage = lazy(() => import("../features/household/SettingsPage"));

type Page = "dashboard" | "expenses" | "budgets" | "reports" | "settings";
const navItems: { id: Page; label: string; icon: typeof Home }[] = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "expenses", label: "Expenses", icon: ArrowDownLeft },
  { id: "budgets", label: "Budgets", icon: Wallet },
  { id: "reports", label: "Reports", icon: FileBarChart2 },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [household, setHousehold] = useState<Household | null>(null);
  const [householdVersion, setHouseholdVersion] = useState(0);
  const [householdError, setHouseholdError] = useState("");
  const [householdReady, setHouseholdReady] = useState(false);
  const [page, setPage] = useState<Page>("dashboard");
  const [month, setMonth] = useState(monthString());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>(CATEGORIES);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [openExpenseForm, setOpenExpenseForm] = useState(false);
  const [initialReceiptMode, setInitialReceiptMode] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return;
    }
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setHousehold(null);
      setHouseholdReady(!nextUser);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!user || !firebaseConfigured) return;
    let cancelled = false;
    setHouseholdReady(false);
    setHouseholdError("");
    getUserHousehold(user.uid)
      .then((nextHousehold) => { if (!cancelled) setHousehold(nextHousehold); })
      .catch((error: unknown) => { if (!cancelled) setHouseholdError(error instanceof Error ? error.message : "Couldn't load household."); })
      .finally(() => { if (!cancelled) setHouseholdReady(true); });
    return () => { cancelled = true; };
  }, [user, householdVersion]);

  const refreshData = useCallback(async () => {
    if (!household) return;
    setLoading(true);
    setLoadError("");
    try {
      const [nextExpenses, nextBudgets, nextCategories] = await Promise.all([
        listExpenses(household.id),
        listBudgets(household.id, month),
        listCategories(household.id),
      ]);
      setExpenses(nextExpenses);
      setBudgets(nextBudgets);
      setCategories(nextCategories);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Couldn't load your household data.");
    } finally {
      setLoading(false);
    }
  }, [household, month]);

  useEffect(() => { void refreshData(); }, [refreshData]);

  const greeting = useMemo(() => user?.displayName?.split(" ")[0] ?? "there", [user]);
  const startExpense = (receipt: boolean) => {
    setExpenseToEdit(null);
    setInitialReceiptMode(receipt);
    setOpenExpenseForm(true);
  };

  if (!authReady) return <div className="loading-screen"><span className="spinner" /> Getting things ready…</div>;
  if (!firebaseConfigured || !user) return <AuthScreen />;
  if (!householdReady) return <div className="loading-screen"><span className="spinner" /> Finding your household…</div>;
  if (householdError) return <main className="setup-page"><div className="page-alert" role="alert">{householdError}<button onClick={() => setHouseholdVersion((version) => version + 1)}>Try again</button></div></main>;
  if (!household) return <HouseholdSetup user={user} onComplete={() => setHouseholdVersion((version) => version + 1)} />;

  const contentProps = {
    household,
    user,
    month,
    expenses,
    budgets,
    categories,
    loading,
    onRefresh: refreshData,
    onAddExpense: () => startExpense(false),
    onScanReceipt: () => startExpense(true),
    onViewExpenses: () => setPage("expenses"),
    onViewReports: () => setPage("reports"),
    onEditExpense: (expense: Expense) => {
      setExpenseToEdit(expense);
      setInitialReceiptMode(false);
      setOpenExpenseForm(true);
    },
  };

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setPage("dashboard"); }}><span className="brand-mark"><Activity size={18} /></span> expenselake</a>
        <div className="side-household"><div className="household-avatar">{household.name.charAt(0).toUpperCase()}</div><div className="household-name"><strong>{household.name}</strong><span>Shared household</span></div><ChevronDown size={15} /></div>
        <span className="nav-label">WORKSPACE</span>
        <nav className="side-nav" aria-label="Main navigation">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? "selected" : ""}`} onClick={() => setPage(id)}><Icon size={18} strokeWidth={page === id ? 2.2 : 1.8} /><span>{label}</span>{id === "expenses" && expenses.length > 0 && <span className="nav-count">{expenses.length}</span>}</button>)}</nav>
        <div className="sidebar-bottom">
          <div className="privacy-card"><span className="privacy-icon"><ShieldCheck size={17} /></span><strong>Your data stays yours</strong><p>Only your household can access these records.</p><button onClick={() => setPage("settings")}>Privacy details <ArrowRight size={13} /></button></div>
          <div className="profile-row"><div className="profile-avatar">{greeting.charAt(0).toUpperCase()}</div><div className="profile-label"><strong>{user.displayName ?? "Member"}</strong><span>{user.email}</span></div><button className="icon-button" aria-label="Sign out" title="Sign out" onClick={() => auth && signOut(auth)}><LogOut size={17} /></button></div>
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <button className="mobile-menu-button icon-button" aria-label="Open navigation" onClick={() => setShowMobileMenu(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>{household.name}</span><span className="crumb-slash">/</span><strong>{navItems.find((item) => item.id === page)?.label}</strong></div>
          <div className="topbar-actions">
            <button className="month-switch" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ArrowLeft size={16} /></button><span className="month-current">{formatMonth(month)}</span><button className="month-switch" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= monthString()}><ArrowRight size={16} /></button>
            <span className="topbar-divider" />
            <button className="help-button" onClick={() => setPage("settings")}><CircleHelp size={17} /><span>Help</span></button>
          </div>
        </header>
        {loadError && <div className="page-alert" role="alert">{loadError}<button onClick={() => void refreshData()}>Try again</button></div>}
        {loading && <div className="sync-line"><span className="spinner small" /> Syncing household data…</div>}
        <div className="page-content">
          <Suspense fallback={<div className="loading-screen page-loading"><span className="spinner" /> Loading your budget…</div>}>
            {page === "dashboard" && <Dashboard {...contentProps} greeting={greeting} />}
            {page === "expenses" && <ExpensesPage {...contentProps} />}
            {page === "budgets" && <BudgetsPage {...contentProps} />}
            {page === "reports" && <ReportsPage {...contentProps} />}
            {page === "settings" && <SettingsPage household={household} user={user} />}
          </Suspense>
        </div>
        <nav className="bottom-nav" aria-label="Mobile navigation">
          {navItems.slice(0, 2).map(({ id, label, icon: Icon }) => <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}><Icon size={19} /><span>{label}</span></button>)}
          <button className="mobile-add" onClick={() => startExpense(false)} aria-label="Add expense"><Plus size={24} /></button>
          {navItems.slice(2, 4).map(({ id, label, icon: Icon }) => <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}><Icon size={19} /><span>{label}</span></button>)}
        </nav>
        {openExpenseForm && <ExpenseOverlay household={household} user={user} categories={categories} receiptMode={initialReceiptMode} expense={expenseToEdit} onClose={() => { setOpenExpenseForm(false); setExpenseToEdit(null); }} onSaved={() => { setOpenExpenseForm(false); setExpenseToEdit(null); void refreshData(); }} />}
      </main>
      {showMobileMenu && <div className="mobile-drawer-backdrop" onClick={() => setShowMobileMenu(false)}><aside className="mobile-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-head"><a className="brand"><span className="brand-mark"><Activity size={18} /></span> expenselake</a><button className="icon-button" onClick={() => setShowMobileMenu(false)} aria-label="Close navigation"><X size={19} /></button></div>{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? "selected" : ""}`} onClick={() => { setPage(id); setShowMobileMenu(false); }}><Icon size={18} />{label}</button>)}</aside></div>}
      <button className="floating-add" onClick={() => startExpense(false)}><Plus size={18} /> Add expense</button>
    </div>
  );
}

import ExpenseOverlay from "../features/expenses/ExpenseOverlay";
