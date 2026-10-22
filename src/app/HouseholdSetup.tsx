import { useState, type FormEvent } from "react";
import { signOut, type User } from "firebase/auth";
import { ArrowRight, Home, LogOut, Users } from "lucide-react";
import { auth } from "../lib/firebase";
import { acceptInvitation, createHousehold } from "../services/householdService";

export default function HouseholdSetup({ user, onComplete }: { user: User; onComplete: () => void }) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      if (mode === "create") {
        await createHousehold(String(data.get("householdName")), {
          uid: user.uid,
          email: user.email ?? "",
          displayName: user.displayName ?? "Household member",
        });
      } else {
        await acceptInvitation(String(data.get("inviteCode")), {
          uid: user.uid,
          email: user.email ?? "",
          displayName: user.displayName ?? "Household member",
        });
      }
      onComplete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't complete that action.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="setup-page">
      <header className="setup-header"><a className="brand" href="#"><span className="brand-mark"><Home size={18} /></span> expenselake</a><button className="button button-quiet" onClick={() => auth && signOut(auth)}><LogOut size={16} /> Sign out</button></header>
      <section className="setup-card">
        <span className="eyebrow">Your money, your household</span>
        <h1>Let’s make this a shared space.</h1>
        <p className="muted">Create a household budget or join one with an invitation from its owner.</p>
        <div className="setup-tabs"><button className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}><Home size={16} /> Create household</button><button className={mode === "join" ? "active" : ""} onClick={() => setMode("join")}><Users size={16} /> Join with invite</button></div>
        <form className="stack-form" onSubmit={submit}>
          {mode === "create" ? <label className="field"><span>Household name</span><input name="householdName" placeholder="e.g. Casa Rivera" maxLength={80} required /></label> : <label className="field"><span>Invitation code</span><input name="inviteCode" placeholder="Paste your invitation code" required /></label>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary button-wide" disabled={busy}>{busy ? "Please wait…" : mode === "create" ? "Create my household" : "Join household"} <ArrowRight size={17} /></button>
        </form>
        <div className="setup-note"><span className="status-dot" /> Your household is private and only accessible to invited members.</div>
      </section>
    </main>
  );
}
