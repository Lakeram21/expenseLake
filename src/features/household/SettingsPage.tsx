import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LockKeyhole, Mail, ShieldCheck, UserPlus, Users, CheckCircle2, Copy } from "lucide-react";
import type { User } from "firebase/auth";
import type { Household, HouseholdMember } from "../../types";
import { inviteMember, listMembers } from "../../services/householdService";

export default function SettingsPage({ household, user }: { household: Household; user: User }) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const isOwner = members.some((member) => member.uid === user.uid && member.role === "owner");
  const needsMemberCountMigration = isOwner && members.length < 2 && household.memberCount !== members.length;

  const refreshMembers = useCallback(async () => {
    setMembers(await listMembers(household.id));
  }, [household.id]);
  useEffect(() => { void refreshMembers().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Couldn't load members.")); }, [refreshMembers]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const code = await inviteMember(household.id, email, user.uid);
      setInviteCode(code);
      setMessage(`Invitation created for ${email}. Share the secure code below; the recipient must sign in with that email.`);
      setEmail("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't send the invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function copyInviteCode() {
    try {
      await navigator.clipboard.writeText(inviteCode);
    } catch {
      setError("Couldn't copy the invitation code. Select and copy it manually.");
    }
  }

  return (
    <section className="feature-page settings-page">
      <div className="page-heading"><div><span className="eyebrow">YOUR HOME, YOUR WAY</span><h1>Settings</h1><p>Manage household access and account details.</p></div></div>
      {error && <div className="page-alert" role="alert">{error}</div>}
      {needsMemberCountMigration && <div className="page-alert" role="alert">Before creating an invitation, update this existing household’s <code>memberCount</code> in Firestore to {members.length} (the current number of active members).</div>}
      <article className="content-card settings-card"><div className="settings-card-title"><span className="settings-icon"><Users size={19} /></span><div><h2>Household members</h2><p>Shared access for the people you trust.</p></div><span className="member-count">{members.length} / 2</span></div>
        <div className="member-list">{members.map((member) => <div className="member-item" key={member.uid}><span className="member-avatar">{member.displayName.charAt(0).toUpperCase()}</span><div><strong>{member.displayName}{member.uid === user.uid && <span className="you-tag">You</span>}</strong><span>{member.email}</span></div><span className={`role-tag ${member.role}`}>{member.role}</span></div>)}</div>
        {isOwner && members.length < 2 && <form className="invite-form" onSubmit={(event) => void submit(event)}><div><strong>Invite someone to your household</strong><span>They’ll get secure shared access to your expenses and budgets.</span></div><label className="field"><span className="sr-only">Email to invite</span><div className="input-wrap"><Mail size={16} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Their email address" required /></div></label><button className="button button-primary" disabled={busy}><UserPlus size={16} /> {busy ? "Creating…" : "Create invite"}</button></form>}
        {message && <div className="invite-result" role="status"><p className="success-message"><CheckCircle2 size={16} /> {message}</p>{inviteCode && <div className="invite-code"><code>{inviteCode}</code><button className="button button-secondary compact" onClick={() => void copyInviteCode()}><Copy size={13} /> Copy code</button></div>}</div>}
        <div className="security-note"><LockKeyhole size={15} /><span>Only the household owner can create invitations. Codes expire after 7 days and are tied to the invited email. Share the code privately.</span></div>
      </article>
      <article className="content-card profile-settings-card"><div className="settings-card-title"><span className="settings-icon soft"><ShieldCheck size={19} /></span><div><h2>Account & privacy</h2><p>Personal profile details for this device.</p></div></div><div className="profile-detail"><span>Signed in as</span><strong>{user.displayName ?? "Household member"}</strong></div><div className="profile-detail"><span>Email address</span><strong>{user.email}</strong></div><div className="profile-detail"><span>Household currency</span><strong>MXN · Mexican peso</strong></div><div className="settings-footnote">Financial records are scoped to <strong>{household.name}</strong> and protected by Firebase Authentication and household membership rules.</div></article>
    </section>
  );
}
