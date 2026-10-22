import { useState, type FormEvent } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { ArrowRight, Eye, EyeOff, Leaf, LockKeyhole, Mail, UserRound } from "lucide-react";
import { auth, firebaseConfigured } from "../lib/firebase";

export default function AuthScreen() {
  const [creating, setCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!auth) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    setBusy(true);
    try {
      if (creating) {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(credential.user, { displayName: String(form.get("name")).trim() });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't sign you in. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-story">
        <div className="brand brand-light"><span className="brand-mark"><Leaf size={19} /></span> expenselake</div>
        <div className="story-copy">
          <span className="eyebrow">A little more clarity, together</span>
          <h1>Make room for<br />what matters.</h1>
          <p>A calmer way to understand your household spending, one receipt at a time.</p>
          <div className="story-note"><span className="story-dot" /> Built for real life in Mexico</div>
        </div>
        <div className="story-visual" aria-hidden="true">
          <span className="visual-leaf leaf-one">✳</span><span className="visual-leaf leaf-two">✳</span>
          <span className="visual-orbit orbit-one" /><span className="visual-orbit orbit-two" />
        </div>
        <span className="auth-footnote">Your household finances, with a little more breathing room.</span>
      </section>
      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="mobile-brand brand"><span className="brand-mark"><Leaf size={19} /></span> expenselake</div>
          {!firebaseConfigured ? (
            <div className="config-state">
              <div className="icon-tile"><LockKeyhole size={21} /></div>
              <span className="eyebrow">One small setup step</span>
              <h2>Connect your Firebase project</h2>
              <p>Authentication and household data are protected by Firebase. Add your project values to <code>.env.local</code> to get started.</p>
              <div className="config-list"><span>01</span><p>Copy <code>.env.example</code> to <code>.env.local</code></p><span>02</span><p>Fill in Firebase Web App settings</p><span>03</span><p>Enable Email/Password sign-in</p></div>
              <a className="text-link" href="https://console.firebase.google.com/" target="_blank" rel="noreferrer">Open Firebase Console <ArrowRight size={15} /></a>
            </div>
          ) : (
            <>
              <span className="eyebrow">{creating ? "A fresh start" : "Welcome back"}</span>
              <h2>{creating ? "Create your account" : "Sign in to your home"}</h2>
              <p className="auth-intro">{creating ? "Start building a clearer picture of your household spending." : "Your household budget is right where you left it."}</p>
              <form className="auth-form" onSubmit={submit}>
                {creating && <label className="field"><span>Your name</span><div className="input-wrap"><UserRound size={17} /><input name="name" autoComplete="name" placeholder="e.g. Alex Rivera" required /></div></label>}
                <label className="field"><span>Email address</span><div className="input-wrap"><Mail size={17} /><input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></div></label>
                <label className="field"><span>Password</span><div className="input-wrap"><LockKeyhole size={17} /><input name="password" type={showPassword ? "text" : "password"} autoComplete={creating ? "new-password" : "current-password"} placeholder="At least 6 characters" minLength={6} required /><button type="button" className="input-action" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="button button-primary button-wide" type="submit" disabled={busy}>{busy ? "Please wait…" : creating ? "Create account" : "Sign in"} <ArrowRight size={17} /></button>
              </form>
              <p className="auth-switch">{creating ? "Already have an account?" : "New to Expenselake?"} <button type="button" onClick={() => { setCreating(!creating); setError(""); }}>{creating ? "Sign in" : "Create an account"}</button></p>
              <p className="privacy-note"><LockKeyhole size={13} /> Private by design. Only your household can see your finances.</p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
