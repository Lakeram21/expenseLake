import { useMemo, useState, type FormEvent } from "react";
import { Building2, CalendarDays, CircleDollarSign, Plus, Trash2, TrendingUp, Wallet } from "lucide-react";
import type {
  Category, Expense, Household, InvestmentAccount, InvestmentAccountType, InvestmentHolding,
  InvestmentHoldingKind, InvestmentIncome, InvestmentIncomeFrequency, InvestmentIncomeType,
  InvestmentValuation,
} from "../../types";
import type { User } from "firebase/auth";
import { formatMoney, MAX_INVESTMENT_AMOUNT_MINOR, parseAmountToMinor } from "../../lib/money";
import { localDateString } from "../../lib/dates";
import { incomeTotalsByCurrency, investmentReminders, investmentTotals } from "../../lib/investments";
import { deleteExpense } from "../../services/expenseService";
import {
  createInvestmentAccount, createInvestmentHolding, deleteInvestmentAccount, deleteInvestmentHolding,
  deleteInvestmentIncome, deleteInvestmentValuation, recordInvestmentIncome,
  recordInvestmentValuation, updateInvestmentHoldingSchedule, updateInvestmentHoldingValue,
} from "../../services/investmentService";
import ExpenseRow from "../expenses/ExpenseRow";

const ACCOUNT_TYPES: { value: InvestmentAccountType; label: string }[] = [
  { value: "government_bonds", label: "Government securities" },
  { value: "brokerage", label: "Brokerage" },
  { value: "real_estate", label: "Real estate / land" },
  { value: "other", label: "Other" },
];

const INCOME_FREQUENCIES: { value: InvestmentIncomeFrequency; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semiannual", label: "Every six months" },
  { value: "annual", label: "Annually" },
  { value: "manual", label: "Date entered manually" },
  { value: "none", label: "No cash distributions" },
];

const HOLDING_KINDS: { value: InvestmentHoldingKind; label: string }[] = [
  { value: "udibono", label: "Udibono" },
  { value: "etf", label: "ETF" },
  { value: "land", label: "Land" },
  { value: "real_estate", label: "Real estate" },
  { value: "other", label: "Other" },
];

function formatIncomeAmount(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amountMinor / 100);
}

function parseNonnegativeAmount(value: string): number {
  if (/^0+(?:\.0{1,2})?$/.test(value.trim())) return 0;
  return parseAmountToMinor(value, MAX_INVESTMENT_AMOUNT_MINOR);
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${date}T12:00:00`));
}

export default function InvestmentsPage({
  household,
  user,
  expenses,
  investmentAccounts,
  investmentHoldings,
  investmentIncome,
  investmentValuations,
  categories,
  onRefresh,
  onAddExpense,
  onEditExpense,
}: {
  household: Household;
  user: User;
  expenses: Expense[];
  investmentAccounts: InvestmentAccount[];
  investmentHoldings: InvestmentHolding[];
  investmentIncome: InvestmentIncome[];
  investmentValuations: InvestmentValuation[];
  categories: Category[];
  onRefresh: () => Promise<void>;
  onAddExpense: () => void;
  onEditExpense: (expense: Expense) => void;
}) {
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showHoldingForm, setShowHoldingForm] = useState(false);
  const [valuationAccountId, setValuationAccountId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<InvestmentAccountType>("government_bonds");
  const [provider, setProvider] = useState("");
  const [notes, setNotes] = useState("");
  const [valuationValue, setValuationValue] = useState("");
  const [valuationDate, setValuationDate] = useState(localDateString());
  const [holdingAccountId, setHoldingAccountId] = useState("");
  const [holdingName, setHoldingName] = useState("");
  const [holdingKind, setHoldingKind] = useState<InvestmentHoldingKind>("udibono");
  const [ticker, setTicker] = useState("");
  const [holdingCurrency, setHoldingCurrency] = useState("MXN");
  const [holdingInvested, setHoldingInvested] = useState("");
  const [holdingCurrentValue, setHoldingCurrentValue] = useState("");
  const [holdingValueDate, setHoldingValueDate] = useState(localDateString());
  const [incomeFrequency, setIncomeFrequency] = useState<InvestmentIncomeFrequency>("semiannual");
  const [nextExpectedDate, setNextExpectedDate] = useState(localDateString());
  const [holdingNotes, setHoldingNotes] = useState("");
  const [paymentHoldingId, setPaymentHoldingId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState("MXN");
  const [paymentType, setPaymentType] = useState<InvestmentIncomeType>("coupon");
  const [paymentExpectedDate, setPaymentExpectedDate] = useState(localDateString());
  const [paymentReceivedDate, setPaymentReceivedDate] = useState(localDateString());
  const [paymentReinvested, setPaymentReinvested] = useState(false);
  const [paymentNotes, setPaymentNotes] = useState("");
  const [scheduleHoldingId, setScheduleHoldingId] = useState("");
  const [scheduleFrequency, setScheduleFrequency] = useState<InvestmentIncomeFrequency>("semiannual");
  const [scheduleDate, setScheduleDate] = useState(localDateString());
  const [valueHoldingId, setValueHoldingId] = useState("");
  const [updatedHoldingValue, setUpdatedHoldingValue] = useState("");
  const [updatedHoldingValueDate, setUpdatedHoldingValueDate] = useState(localDateString());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const totals = investmentTotals(
    expenses, investmentAccounts, investmentValuations, undefined, investmentIncome, investmentHoldings,
  );
  const reminders = investmentReminders(investmentHoldings);
  const reminderByHoldingId = new Map(reminders.map((reminder) => [reminder.holding.id, reminder.status]));
  const recordedIncomeTotals = incomeTotalsByCurrency(investmentIncome);
  const holdingById = useMemo(
    () => new Map(investmentHoldings.map((holding) => [holding.id, holding])),
    [investmentHoldings],
  );
  const accountNames = useMemo(
    () => new Map(investmentAccounts.map((account) => [account.id, account.name])),
    [investmentAccounts],
  );
  const contributions = useMemo(() => expenses
    .filter((expense) => expense.investmentAccountId && accountNames.has(expense.investmentAccountId))
    .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdAt.getTime() - a.createdAt.getTime()),
  [expenses, accountNames]);

  async function performDelete(action: () => Promise<void>, confirmation: string, fallback: string) {
    if (!window.confirm(confirmation)) return;
    setError("");
    setBusy(true);
    try {
      await action();
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  function deleteContribution(expense: Expense) {
    void performDelete(
      () => deleteExpense(household.id, expense.id),
      `Delete this ${formatMoney(expense.amountMinor)} contribution and its household expense? This cannot be undone.`,
      "Couldn't delete the contribution.",
    );
  }

  function deleteAccount(account: InvestmentAccount) {
    void performDelete(
      () => deleteInvestmentAccount(household.id, account.id),
      `Delete empty investment account "${account.name}"? This cannot be undone.`,
      "Couldn't delete the investment account.",
    );
  }

  function deleteHolding(holding: InvestmentHolding) {
    void performDelete(
      () => deleteInvestmentHolding(household.id, holding.id),
      `Delete asset "${holding.name}"? This cannot be undone.`,
      "Couldn't delete the investment asset.",
    );
  }

  function deleteValuation(valuation: InvestmentValuation) {
    void performDelete(
      () => deleteInvestmentValuation(household.id, valuation.id),
      `Delete the ${formatMoney(valuation.valueMinor)} valuation from ${formatDate(valuation.valuationDate)}?`,
      "Couldn't delete the valuation.",
    );
  }

  function deleteIncome(payment: InvestmentIncome) {
    void performDelete(
      () => deleteInvestmentIncome(household.id, payment.id),
      `Delete this ${formatIncomeAmount(payment.amountMinor, payment.currency)} income record?`,
      "Couldn't delete the income record.",
    );
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await createInvestmentAccount(household.id, { name: accountName, type: accountType, provider, notes });
      setAccountName("");
      setProvider("");
      setNotes("");
      setShowAccountForm(false);
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't create the investment account.");
    } finally {
      setBusy(false);
    }
  }

  async function saveValuation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await recordInvestmentValuation(household.id, {
        accountId: valuationAccountId,
        valueMinor: parseAmountToMinor(valuationValue, MAX_INVESTMENT_AMOUNT_MINOR),
        valuationDate,
      });
      setValuationValue("");
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't record the investment value.");
    } finally {
      setBusy(false);
    }
  }

  async function saveHolding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await createInvestmentHolding(household.id, {
        accountId: holdingAccountId || investmentAccounts[0]?.id || "",
        name: holdingName,
        kind: holdingKind,
        ticker,
        currency: holdingCurrency,
        incomeFrequency,
        nextPaymentDate: incomeFrequency === "none" ? null : nextExpectedDate,
        amountInvestedMinor: parseNonnegativeAmount(holdingInvested),
        currentValueMinor: parseNonnegativeAmount(holdingCurrentValue),
        currentValueDate: holdingValueDate,
        notes: holdingNotes,
      });
      setHoldingName("");
      setTicker("");
      setHoldingInvested("");
      setHoldingCurrentValue("");
      setHoldingNotes("");
      setShowHoldingForm(false);
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't add the investment holding.");
    } finally {
      setBusy(false);
    }
  }

  async function saveHoldingValue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const holding = holdingById.get(valueHoldingId);
    if (!holding) {
      setError("Choose a valid investment asset.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await updateInvestmentHoldingValue(household.id, holding, {
        currentValueMinor: parseNonnegativeAmount(updatedHoldingValue),
        currentValueDate: updatedHoldingValueDate,
      });
      setValueHoldingId("");
      setUpdatedHoldingValue("");
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't update the asset value.");
    } finally {
      setBusy(false);
    }
  }

  function startHoldingValueUpdate(holding: InvestmentHolding) {
    setValueHoldingId(holding.id);
    setUpdatedHoldingValue(
      holding.currentValueMinor === undefined ? "" : (holding.currentValueMinor / 100).toFixed(2),
    );
    setUpdatedHoldingValueDate(localDateString());
  }

  async function savePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const holding = holdingById.get(paymentHoldingId);
    if (!holding) {
      setError("Choose a valid investment holding.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await recordInvestmentIncome(household.id, holding, {
        amountMinor: parseAmountToMinor(paymentAmount, MAX_INVESTMENT_AMOUNT_MINOR),
        currency: paymentCurrency,
        expectedDate: paymentExpectedDate,
        receivedDate: paymentReceivedDate,
        type: paymentType,
        reinvested: paymentReinvested,
        notes: paymentNotes,
      });
      setPaymentHoldingId("");
      setPaymentAmount("");
      setPaymentNotes("");
      setPaymentReinvested(false);
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't record the investment payment.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const holding = holdingById.get(scheduleHoldingId);
      if (!holding) throw new Error("Choose a valid investment holding.");
      await updateInvestmentHoldingSchedule(household.id, holding, {
        incomeFrequency: scheduleFrequency,
        nextPaymentDate: scheduleFrequency === "none" ? null : scheduleDate,
      });
      setScheduleHoldingId("");
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't update the payment reminder.");
    } finally {
      setBusy(false);
    }
  }

  function startPayment(holding: InvestmentHolding) {
    setPaymentHoldingId(holding.id);
    setPaymentAmount("");
    setPaymentCurrency(holding.currency);
    setPaymentExpectedDate(holding.nextPaymentDate ?? localDateString());
    setPaymentReceivedDate(localDateString());
    setPaymentType(holding.kind === "udibono" ? "coupon" : holding.kind === "etf" ? "dividend" : "other");
    setPaymentReinvested(false);
    setPaymentNotes("");
  }

  return (
    <section className="feature-page investment-page">
      <div className="page-heading">
        <div><span className="eyebrow">YOUR LONG-TERM PICTURE</span><h1>Investments</h1><p>Manage your portfolio by account and by individual asset.</p></div>
        <div className="heading-actions"><button className="button button-secondary" onClick={() => setShowAccountForm((open) => !open)}><Plus size={16} /> Add account</button><button className="button button-primary" onClick={onAddExpense}><Plus size={17} /> Add contribution</button></div>
      </div>
      {error && <div className="page-alert" role="alert">{error}</div>}
      <div className="investment-summary-grid">
        <article className="investment-total-card"><span><TrendingUp size={18} /> Tracked portfolio</span><strong>{formatMoney(totals.currentValueMinor)}</strong><small>Recorded values plus all contributions; asset values are shown in their original currency</small>{[...totals.currentValueByCurrency.entries()].filter(([currency, amount]) => currency !== "MXN" && amount > 0).map(([currency, amount]) => <small key={currency}>{formatIncomeAmount(amount, currency)} tracked in {currency}</small>)}</article>
        <article className="investment-total-card"><span><CircleDollarSign size={18} /> Contributions to date</span><strong>{formatMoney(totals.contributedMinor)}</strong><small>{contributions.length} linked {contributions.length === 1 ? "expense" : "expenses"}</small></article>
      </div>

      {showAccountForm && <form className="content-card investment-form" onSubmit={(event) => void saveAccount(event)}>
        <div className="investment-form-heading"><div><strong>New investment account</strong><span>Add a place to track an investment and its contributions.</span></div><button type="button" className="text-link" onClick={() => setShowAccountForm(false)}>Cancel</button></div>
        <div className="investment-form-fields">
          <label className="field"><span>Account name</span><input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="e.g. Cetesdirecto" minLength={2} maxLength={60} required /></label>
          <label className="field"><span>Type</span><select value={accountType} onChange={(event) => setAccountType(event.target.value as InvestmentAccountType)}>{ACCOUNT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="field"><span>Provider <em>Optional</em></span><input value={provider} onChange={(event) => setProvider(event.target.value)} placeholder="e.g. Cetesdirecto or GBM" maxLength={60} /></label>
          <label className="field"><span>Notes <em>Optional</em></span><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Account details" maxLength={500} /></label>
        </div>
        <button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save account"}</button>
      </form>}

      {showHoldingForm && investmentAccounts.length > 0 && <form className="content-card investment-form" onSubmit={(event) => void saveHolding(event)}>
        <div className="investment-form-heading"><div><strong>Add a portfolio asset</strong><span>Track an individual bond, ETF, property, or other asset inside an account.</span></div><button type="button" className="text-link" onClick={() => setShowHoldingForm(false)}>Cancel</button></div>
        <div className="investment-form-fields">
          <label className="field"><span>Account</span><select value={holdingAccountId || investmentAccounts[0].id} onChange={(event) => setHoldingAccountId(event.target.value)}>{investmentAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          <label className="field"><span>Asset name</span><input value={holdingName} onChange={(event) => setHoldingName(event.target.value)} placeholder="e.g. Udibono 2031 or Lot 4" minLength={2} maxLength={80} required /></label>
          <label className="field"><span>Asset type</span><select value={holdingKind} onChange={(event) => { const kind = event.target.value as InvestmentHoldingKind; setHoldingKind(kind); setIncomeFrequency(kind === "udibono" ? "semiannual" : "none"); setHoldingCurrency(kind === "udibono" ? "MXN" : holdingCurrency); }}>{
            HOLDING_KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)
          }</select></label>
          <label className="field"><span>{holdingKind === "etf" ? "Ticker" : "Issue / identifier"} <em>Optional</em></span><input value={ticker} onChange={(event) => setTicker(event.target.value)} placeholder={holdingKind === "etf" ? "e.g. ticker symbol" : "Issue or identifier"} maxLength={15} /></label>
          <label className="field"><span>Asset currency</span><select value={holdingCurrency} onChange={(event) => setHoldingCurrency(event.target.value)}><option value="MXN">MXN — Mexican peso</option><option value="USD">USD — US dollar</option><option value="CAD">CAD — Canadian dollar</option><option value="EUR">EUR — Euro</option></select></label>
          <label className="field"><span>Amount invested</span><input inputMode="decimal" value={holdingInvested} onChange={(event) => setHoldingInvested(event.target.value)} placeholder="0.00" required /></label>
          <label className="field"><span>Current value before contributions</span><input inputMode="decimal" value={holdingCurrentValue} onChange={(event) => setHoldingCurrentValue(event.target.value)} placeholder="0.00" required /></label>
          <label className="field"><span>Value as of</span><input type="date" value={holdingValueDate} onChange={(event) => setHoldingValueDate(event.target.value)} required /></label>
          <label className="field"><span>Payment schedule</span><select value={holdingKind === "udibono" ? "semiannual" : incomeFrequency} disabled={holdingKind === "udibono"} onChange={(event) => setIncomeFrequency(event.target.value as InvestmentIncomeFrequency)}>{INCOME_FREQUENCIES.map((frequency) => <option key={frequency.value} value={frequency.value}>{frequency.label}</option>)}</select></label>
          {incomeFrequency !== "none" && <label className="field"><span>Next expected payment</span><input type="date" value={nextExpectedDate} onChange={(event) => setNextExpectedDate(event.target.value)} required /></label>}
          <label className="field"><span>Notes <em>Optional</em></span><input value={holdingNotes} onChange={(event) => setHoldingNotes(event.target.value)} placeholder="Details about this holding" maxLength={500} /></label>
        </div>
        {holdingKind === "udibono" && <p className="investment-form-note">Udibonos generally pay fixed-rate interest every six months. Set the actual next coupon date for this issue; dates and amounts are not fetched automatically.</p>}
        {holdingKind === "etf" && <p className="investment-form-note">ETF payouts depend on the fund. Set a reminder only if it matches the issuer’s schedule; accumulating ETFs can use “No cash distributions.”</p>}
        <button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save asset"}</button>
      </form>}

      {paymentHoldingId && <form className="content-card investment-form" onSubmit={(event) => void savePayment(event)}>
        <div className="investment-form-heading"><div><strong>Record received income</strong><span>{holdingById.get(paymentHoldingId)?.name} · this is income, not a new contribution.</span></div><button type="button" className="text-link" onClick={() => setPaymentHoldingId("")}>Cancel</button></div>
        <div className="investment-form-fields">
          <label className="field"><span>Payment type</span><select value={paymentType} onChange={(event) => setPaymentType(event.target.value as InvestmentIncomeType)}><option value="coupon">Bond coupon / interest</option><option value="dividend">Dividend</option><option value="distribution">Fund distribution</option><option value="other">Other income</option></select></label>
          <label className="field"><span>Amount received</span><input inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="0.00" required /></label>
          <label className="field"><span>Currency</span><select value={paymentCurrency} onChange={(event) => setPaymentCurrency(event.target.value)}><option value="MXN">MXN — Mexican peso</option><option value="USD">USD — US dollar</option><option value="CAD">CAD — Canadian dollar</option><option value="EUR">EUR — Euro</option></select></label>
          <label className="field"><span>Expected date</span><input type="date" value={paymentExpectedDate} onChange={(event) => setPaymentExpectedDate(event.target.value)} required /></label>
          <label className="field"><span>Received date</span><input type="date" value={paymentReceivedDate} onChange={(event) => setPaymentReceivedDate(event.target.value)} required /></label>
          <label className="field"><span>Notes <em>Optional</em></span><input value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} placeholder="Brokerage statement reference" maxLength={500} /></label>
        </div>
        <label className="investment-toggle"><input type="checkbox" checked={paymentReinvested} onChange={(event) => setPaymentReinvested(event.target.checked)} /><span>Reinvested instead of paid out as cash</span></label>
        <button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Record payment"}</button>
      </form>}

      {investmentAccounts.length === 0 ? (
        <div className="content-card empty-state investment-empty"><span className="empty-icon"><Building2 size={23} /></span><h3>Start with an investment account</h3><p>Create an account for Cetesdirecto, GBM, land, or another investment to track its value and contributions.</p><button className="button button-primary" onClick={() => setShowAccountForm(true)}><Plus size={16} /> Add your first account</button></div>
      ) : (
        <>
          <div className="investment-section-heading"><div><h2>Your accounts</h2><p>Values use the latest amount you recorded.</p></div><div className="investment-heading-actions"><button className="text-link" onClick={() => { setHoldingAccountId(investmentAccounts[0].id); setShowHoldingForm((open) => !open); }}><Plus size={14} /> Add holding</button><span>{investmentAccounts.length} {investmentAccounts.length === 1 ? "account" : "accounts"}</span></div></div>
          <div className="investment-account-grid">{investmentAccounts.map((account) => {
            const latest = totals.latest.get(account.id);
            const typeLabel = ACCOUNT_TYPES.find((type) => type.value === account.type)?.label ?? "Other";
            const accountValuations = investmentValuations
              .filter((valuation) => valuation.accountId === account.id)
              .sort((a, b) => b.valuationDate.localeCompare(a.valuationDate));
            const accountHasLinks = expenses.some((expense) => expense.investmentAccountId === account.id)
              || investmentHoldings.some((holding) => holding.accountId === account.id)
              || accountValuations.length > 0
              || investmentIncome.some((payment) => payment.accountId === account.id);
            return <article className="content-card investment-account-card" key={account.id}>
              <div className="investment-account-top"><span className="investment-account-icon"><Wallet size={18} /></span><span className="investment-type">{typeLabel}</span></div>
              <h3>{account.name}</h3><p>{account.provider || "No provider"}{account.notes ? ` · ${account.notes}` : ""}</p>
              <div className="investment-account-values"><div><span>Tracked MXN value</span><strong>{formatMoney(totals.currentValueByAccount.get(account.id) ?? 0)}</strong></div><div><span>Contributed</span><strong>{formatMoney(totals.contributionsByAccount.get(account.id) ?? 0)}</strong></div></div>
              <div className="investment-account-foot"><span>{latest ? `Updated ${new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${latest.valuationDate}T12:00:00`))}` : "No valuation recorded"}</span><button className="text-link" onClick={() => setValuationAccountId((id) => id === account.id ? "" : account.id)}>{valuationAccountId === account.id ? "Close" : "Update value"}</button></div>
              {valuationAccountId === account.id && <form className="valuation-form" onSubmit={(event) => void saveValuation(event)}><label className="field"><span>Recorded value (MXN, before contributions)</span><div className="input-wrap"><span>$</span><input inputMode="decimal" value={valuationValue} onChange={(event) => setValuationValue(event.target.value)} placeholder="0.00" required /></div></label><label className="field"><span>As of</span><input type="date" value={valuationDate} onChange={(event) => setValuationDate(event.target.value)} required /></label><button className="button button-primary compact" disabled={busy}>{busy ? "Saving…" : "Save value"}</button></form>}
              {accountValuations.length > 0 && <div className="investment-valuation-history"><strong>Recorded values</strong>{accountValuations.map((valuation) => <div className="investment-valuation-row" key={valuation.id}><span>{formatDate(valuation.valuationDate)}</span><strong>{formatMoney(valuation.valueMinor)}</strong><button className="icon-button danger-icon" aria-label={`Delete valuation from ${formatDate(valuation.valuationDate)}`} disabled={busy} onClick={() => deleteValuation(valuation)}><Trash2 size={14} /></button></div>)}</div>}
              <div className="investment-account-delete"><button className="text-link danger-text" disabled={busy || accountHasLinks} title={accountHasLinks ? "Delete linked contributions, assets, valuations, and income records first." : "Delete this empty account"} onClick={() => deleteAccount(account)}><Trash2 size={13} /> Delete account</button>{accountHasLinks && <small>Remove linked records before deleting this account.</small>}</div>
            </article>;
          })}</div>
          <div className="investment-section-heading"><div><h2>Contribution history</h2><p>Expenses assigned to an investment account.</p></div><button className="text-link" onClick={onAddExpense}>Add contribution <Plus size={14} /></button></div>
          <section className="content-card investment-history">
            {contributions.length === 0 ? <div className="investment-history-empty"><CalendarDays size={18} /><span>No contributions yet. Add an expense and link it to an account to see it here.</span></div> :
              contributions.map((expense) => <div className="investment-history-row" key={expense.id}><div className="investment-history-account">{accountNames.get(expense.investmentAccountId ?? "")}{expense.investmentHoldingId && holdingById.has(expense.investmentHoldingId) ? ` · ${holdingById.get(expense.investmentHoldingId)?.name}` : " · Account-only contribution"}</div><ExpenseRow expense={expense} categories={categories} canEdit={expense.createdBy === user.uid} onEdit={() => onEditExpense(expense)} onDelete={() => deleteContribution(expense)} /></div>)}
          </section>
          <div className="investment-section-heading"><div><h2>Portfolio assets</h2><p>Track each asset’s total value and optional income reminders.</p></div><span>{reminders.filter((reminder) => reminder.status === "overdue").length} overdue reminders</span></div>
          {investmentHoldings.length === 0 ? <div className="content-card investment-history-empty"><CalendarDays size={18} /><span>Add an asset such as a Udibono, ETF, land parcel, or property.</span></div> :
            <div className="investment-reminder-list">{investmentHoldings.map((holding) => {
              const status = reminderByHoldingId.get(holding.id) ?? "no schedule";
              const kindLabel = HOLDING_KINDS.find((kind) => kind.value === holding.kind)?.label ?? "Other";
              const linkedContributions = totals.contributionsByHolding.get(holding.id) ?? 0;
              const recordedValue = holding.currentValueMinor ?? holding.amountInvestedMinor;
              const totalValue = recordedValue === undefined
                ? linkedContributions > 0 && holding.currency === "MXN" ? linkedContributions : undefined
                : recordedValue + (holding.currency === "MXN" ? linkedContributions : 0);
              return (
              <article className={`content-card investment-reminder-card ${status === "overdue" ? "overdue" : ""}`} key={holding.id}>
                <div className="reminder-main"><span className="reminder-icon"><CalendarDays size={17} /></span><div><strong>{holding.name}{holding.ticker ? ` · ${holding.ticker}` : ""}</strong><span>{accountNames.get(holding.accountId) ?? "Investment account"} · {kindLabel}</span></div></div>
                <div className="investment-asset-values"><span>Total value: {totalValue === undefined ? "Not entered" : formatIncomeAmount(totalValue, holding.currency)}</span>{holding.currency !== "MXN" && linkedContributions > 0 && <small>MXN contributions are not converted into {holding.currency}.</small>}</div>
                <div className="reminder-date"><strong>{holding.nextPaymentDate ? formatDate(holding.nextPaymentDate) : "No date set"}</strong><span className={`reminder-status ${status.replace(" ", "-")}`}>{status}</span></div>
                <div className="reminder-actions"><button className="button button-secondary compact" aria-label={`Update value for ${holding.name}`} onClick={() => startHoldingValueUpdate(holding)}>Update value</button><button className="button button-secondary compact" onClick={() => startPayment(holding)}>Record income</button><button className="text-link" onClick={() => { setScheduleHoldingId(holding.id); setScheduleFrequency(holding.incomeFrequency); setScheduleDate(holding.nextPaymentDate ?? localDateString()); }}>Set reminder</button><button className="icon-button danger-icon" aria-label={`Delete asset ${holding.name}`} title={investmentIncome.some((payment) => payment.holdingId === holding.id) ? "Delete this asset's income records first." : "Delete asset"} disabled={busy || investmentIncome.some((payment) => payment.holdingId === holding.id)} onClick={() => deleteHolding(holding)}><Trash2 size={14} /></button></div>
                {investmentIncome.some((payment) => payment.holdingId === holding.id) && <small className="investment-delete-hint">Delete this asset’s income records before deleting it.</small>}
              </article>
              );
            })}</div>}
          {valueHoldingId && <form className="content-card investment-form schedule-form" onSubmit={(event) => void saveHoldingValue(event)}>
            <div className="investment-form-heading"><div><strong>Update asset value</strong><span>{holdingById.get(valueHoldingId)?.name} · {holdingById.get(valueHoldingId)?.currency}</span></div><button type="button" className="text-link" onClick={() => setValueHoldingId("")}>Cancel</button></div>
            <div className="investment-form-fields"><label className="field"><span>Current value before contributions</span><input inputMode="decimal" value={updatedHoldingValue} onChange={(event) => setUpdatedHoldingValue(event.target.value)} required /></label><label className="field"><span>Value as of</span><input type="date" value={updatedHoldingValueDate} onChange={(event) => setUpdatedHoldingValueDate(event.target.value)} required /></label></div>
            <button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save value"}</button>
          </form>}
          {scheduleHoldingId && <form className="content-card investment-form schedule-form" onSubmit={(event) => void saveSchedule(event)}>
            <div className="investment-form-heading"><div><strong>Update payment reminder</strong><span>{holdingById.get(scheduleHoldingId)?.name}</span></div><button type="button" className="text-link" onClick={() => setScheduleHoldingId("")}>Cancel</button></div>
            <div className="investment-form-fields"><label className="field"><span>Frequency</span><select value={holdingById.get(scheduleHoldingId)?.kind === "udibono" ? "semiannual" : scheduleFrequency} disabled={holdingById.get(scheduleHoldingId)?.kind === "udibono"} onChange={(event) => setScheduleFrequency(event.target.value as InvestmentIncomeFrequency)}>{INCOME_FREQUENCIES.map((frequency) => <option key={frequency.value} value={frequency.value}>{frequency.label}</option>)}</select></label>{scheduleFrequency !== "none" && <label className="field"><span>Next expected date</span><input type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} required /></label>}</div>
            <button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save reminder"}</button>
          </form>}
          <div className="investment-section-heading"><div><h2>Income received</h2><p>Recorded coupons and distributions, including reinvested payments.</p></div><span>{investmentIncome.length} payments</span></div>
          {recordedIncomeTotals.size > 0 && <div className="income-currency-totals">{[...recordedIncomeTotals].map(([currency, amount]) => <span key={currency}>{currency} total <strong>{formatIncomeAmount(amount, currency)}</strong></span>)}</div>}
          <section className="content-card income-history">
            {investmentIncome.length === 0 ? <div className="investment-history-empty"><CircleDollarSign size={18} /><span>No income recorded yet. Use a reminder to record the amount when a payment arrives.</span></div> :
              [...investmentIncome].sort((a, b) => b.receivedDate.localeCompare(a.receivedDate)).map((payment) => (
                <div className="income-history-row" key={payment.id}>
                  <div><strong>{holdingById.get(payment.holdingId)?.name ?? "Investment holding"}</strong><span>{payment.type === "coupon" ? "Coupon / interest" : payment.type === "dividend" ? "Dividend" : payment.type === "distribution" ? "Fund distribution" : "Other income"} · {formatDate(payment.receivedDate)}{payment.reinvested ? " · Reinvested" : ""}</span></div>
                  <strong>{formatIncomeAmount(payment.amountMinor, payment.currency)}</strong>
                  <button className="icon-button danger-icon" aria-label={`Delete income record for ${holdingById.get(payment.holdingId)?.name ?? "investment asset"}`} disabled={busy} onClick={() => deleteIncome(payment)}><Trash2 size={14} /></button>
                </div>
              ))}
          </section>
        </>
      )}
      <p className="investment-disclaimer">Account values are manually recorded estimates, not live balances or investment advice.</p>
    </section>
  );
}
