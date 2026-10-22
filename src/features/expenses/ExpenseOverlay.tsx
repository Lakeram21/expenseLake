import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Camera, Check, ChevronLeft, CircleAlert, FileImage, LoaderCircle, Plus, Upload, X } from "lucide-react";
import { CATEGORIES } from "../../lib/categories";
import { isValidExpenseDate, localDateString } from "../../lib/dates";
import { formatMoneyInput, parseAmountToMinor } from "../../lib/money";
import { createExpense, updateExpense, type ExpenseInput } from "../../services/expenseService";
import { validateReceiptFile } from "../../services/receiptService";
import { extractReceiptFromImage } from "../../services/receiptOcr";
import type { Category, Expense, Household } from "../../types";
import type { User } from "firebase/auth";

type Mode = "manual" | "receipt";
type ReceiptStage = "choose" | "processing" | "review" | "failed";

export default function ExpenseOverlay({
  household,
  user,
  categories = CATEGORIES,
  receiptMode,
  expense,
  onClose,
  onSaved,
}: {
  household: Household;
  user: User;
  categories?: Category[];
  receiptMode: boolean;
  expense: Expense | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<Mode>(receiptMode && !expense ? "receipt" : "manual");
  const [amount, setAmount] = useState(expense ? formatMoneyInput(expense.amountMinor) : "");
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? "groceries");
  const [date, setDate] = useState(expense?.expenseDate ?? localDateString());
  const [merchant, setMerchant] = useState(expense?.merchant ?? "");
  const [paymentMethod, setPaymentMethod] = useState(expense?.paymentMethod ?? "");
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [receiptStage, setReceiptStage] = useState<ReceiptStage>("choose");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const subtitle = useMemo(() => expense ? "Make a change to this household expense." : "Keep it simple. You can add the details later.", [expense]);

  function discardReceipt() {
    if (fileInput.current) fileInput.current.value = "";
    setFile(null);
    setReceiptStage("choose");
    setError("");
  }

  async function saveManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const input: ExpenseInput = {
        amountMinor: parseAmountToMinor(amount),
        merchant: merchant.trim() || null,
        categoryId,
        expenseDate: date,
        paymentMethod: paymentMethod ? paymentMethod as ExpenseInput["paymentMethod"] : null,
        source: expense?.source ?? "manual",
        receiptPath: expense?.receiptPath ?? null,
        notes,
      };
      if (!isValidExpenseDate(input.expenseDate)) throw new Error("Choose a valid expense date.");
      if (expense) await updateExpense(household.id, expense.id, input);
      else await createExpense(household.id, input, { uid: user.uid, displayName: user.displayName ?? user.email ?? "Member" });
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save the expense.");
    } finally {
      setBusy(false);
    }
  }

  async function readReceipt(image: File) {
    setReceiptStage("processing");
    const extraction = await extractReceiptFromImage(image, user.uid);
    if (extraction.amountMinor !== null) setAmount(formatMoneyInput(extraction.amountMinor));
    if (extraction.merchant) setMerchant(extraction.merchant);
    if (extraction.expenseDate) setDate(extraction.expenseDate);
    setCategoryId(extraction.categoryId);
    setError(extraction.warnings.join(" "));
    if (fileInput.current) fileInput.current.value = "";
    setFile(null);
    setReceiptStage("review");
  }

  async function selectFile(selected: File | undefined) {
    if (!selected) return;
    setError("");
    try {
      validateReceiptFile(selected);
      setFile(selected);
      await readReceipt(selected);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't process the receipt.");
      setReceiptStage("failed");
    }
  }

  async function retryExtraction() {
    if (!file) return;
    setError("");
    try {
      await readReceipt(file);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't process the receipt.");
      setReceiptStage("failed");
    }
  }

  async function confirmExtracted(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const amountMinor = parseAmountToMinor(amount);
      await createExpense(household.id, {
        amountMinor,
        merchant: merchant.trim() || null,
        categoryId,
        expenseDate: date,
        paymentMethod: paymentMethod ? paymentMethod as ExpenseInput["paymentMethod"] : null,
        notes,
        source: "receipt",
        receiptPath: null,
      }, { uid: user.uid, displayName: user.displayName ?? user.email ?? "Member" });
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save the receipt expense.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="expense-modal" role="dialog" aria-modal="true" aria-labelledby="expense-title">
        <header className="modal-header"><div><span className="eyebrow">{expense ? "EDIT TRANSACTION" : "NEW TRANSACTION"}</span><h2 id="expense-title">{expense ? "Edit expense" : "Add an expense"}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button></header>
        {!expense && <div className="entry-tabs"><button className={mode === "manual" ? "active" : ""} onClick={() => { if (mode === "receipt") discardReceipt(); setMode("manual"); setError(""); }}><Plus size={16} /> Quick entry</button><button className={mode === "receipt" ? "active" : ""} onClick={() => { setMode("receipt"); setError(""); }}><Camera size={16} /> Scan receipt</button></div>}
        {mode === "manual" ? (
          <form className="expense-form" onSubmit={saveManual}>
            <label className="field amount-field"><span>Amount</span><div className="money-input"><span>$</span><input autoFocus={!expense} inputMode="decimal" aria-label="Amount in pesos" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div><small>MXN · Mexican pesos</small></label>
            <label className="field"><span>Category</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>{categories.map((category) => <option key={category.id} value={category.id}>{category.icon} &nbsp; {category.name}</option>)}</select></label>
            <div className="form-grid"><label className="field"><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label className="field"><span>Merchant <em>Optional</em></span><input value={merchant} onChange={(event) => setMerchant(event.target.value)} placeholder="Where did you spend?" maxLength={120} /></label></div>
            <details className="optional-details"><summary>Payment & notes <span>Optional</span></summary><div className="form-grid optional-fields"><label className="field"><span>Payment method</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="">Not specified</option><option value="cash">Cash</option><option value="debit_card">Debit card</option><option value="credit_card">Credit card</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label><label className="field"><span>Notes</span><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add a note…" maxLength={500} /></label></div></details>
            {error && <p className="form-error" role="alert">{error}</p>}
            <footer className="modal-footer"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={16} /> Saving…</> : <>{expense ? "Save changes" : "Save expense"} <Check size={16} /></>}</button></footer>
          </form>
        ) : (
          <div className="receipt-flow">
            {receiptStage === "choose" && <><button type="button" className="upload-dropzone" onClick={() => fileInput.current?.click()}><span className="upload-icon"><Upload size={22} /></span><strong>Choose a receipt photo</strong><span>Take a photo or upload JPEG, PNG, WebP · up to 8 MB</span><span className="button button-primary upload-cta"><Camera size={16} /> Choose image</span></button><input ref={fileInput} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => void selectFile(event.target.files?.[0])} /></>}
            {file && <div className="receipt-preview"><img src={preview} alt="Receipt selected for review" /><div className="receipt-file"><FileImage size={16} /><span>{file.name}</span><button className="icon-button" aria-label="Choose a different receipt" onClick={discardReceipt}><X size={15} /></button></div></div>}
            {receiptStage === "processing" && <div className="processing-state"><LoaderCircle className="spin" size={20} /><div><strong>Reading on this device</strong><span>The image stays in this browser and is not uploaded.</span></div></div>}
            {receiptStage === "failed" && <div className="receipt-error"><CircleAlert size={18} /><div><strong>We couldn’t finish reading this receipt</strong><span>{error}</span></div>{file && <button className="button button-secondary" onClick={() => void retryExtraction()}>Try again</button>}<button className="text-link" onClick={discardReceipt}>Choose another image</button><button className="text-link" onClick={() => { discardReceipt(); setMode("manual"); }}>Enter manually instead</button></div>}
            {receiptStage === "review" && <form className="expense-form review-form" onSubmit={confirmExtracted}>
              <div className="review-banner"><CircleAlert size={16} /><span>Check the details before saving. OCR runs on this device; the image was discarded after reading.</span></div>
              <label className="field amount-field"><span>Final payable total</span><div className="money-input"><span>$</span><input inputMode="decimal" aria-label="Extracted total in pesos" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div><small>MXN · Review this amount against the receipt</small></label>
              <label className="field"><span>Merchant <em>Optional</em></span><input value={merchant} onChange={(event) => setMerchant(event.target.value)} placeholder="Merchant name" maxLength={120} /></label>
              <div className="form-grid"><label className="field"><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label className="field"><span>Suggested category</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{categories.map((category) => <option key={category.id} value={category.id}>{category.icon} &nbsp; {category.name}</option>)}</select></label></div>
              <details className="optional-details"><summary>Payment & notes <span>Optional</span></summary><div className="form-grid optional-fields"><label className="field"><span>Payment method</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="">Not specified</option><option value="cash">Cash</option><option value="debit_card">Debit card</option><option value="credit_card">Credit card</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label><label className="field"><span>Notes</span><input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add a note…" maxLength={500} /></label></div></details>
              {error && <p className="review-warning">{error}</p>}
              <footer className="modal-footer"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={16} /> Saving…</> : <>Confirm expense <Check size={16} /></>}</button></footer>
            </form>}
            {receiptStage !== "review" && receiptStage !== "failed" && <footer className="modal-footer"><button className="button button-quiet" onClick={onClose}>Cancel</button><button className="text-link" onClick={() => { discardReceipt(); setMode("manual"); }}><ChevronLeft size={14} /> Enter manually</button></footer>}
          </div>
        )}
      </section>
    </div>
  );
}
