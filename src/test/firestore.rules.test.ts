import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp, Timestamp } from "firebase/firestore";

const emulatorConfigured = import.meta.env.VITE_RULES_TEST === "true";
const projectId = "expenselake-rules-test";
let environment: RulesTestEnvironment;

describe.skipIf(!emulatorConfigured)("Firestore household security rules", () => {
  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId,
      firestore: {
        host: "127.0.0.1",
        port: 8080,
        rules: readFileSync("firestore.rules", "utf8"),
      },
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async (context) => {
      const firestore = context.firestore();
      await setDoc(doc(firestore, "households/home"), { name: "Casa", ownerUid: "owner", memberCount: 2, currency: "MXN" });
      await setDoc(doc(firestore, "households/home/members/owner"), { role: "owner", active: true });
      await setDoc(doc(firestore, "households/home/members/member"), { role: "member", active: true });
      await setDoc(doc(firestore, "households/other"), { name: "Other", ownerUid: "stranger", memberCount: 1, currency: "MXN" });
      await setDoc(doc(firestore, "households/other/members/stranger"), { role: "owner", active: true });
      await setDoc(doc(firestore, "households/home/expenses/member-expense"), {
        amountMinor: 1000, currency: "MXN", merchant: "Market", categoryId: "groceries",
        expenseDate: "2026-10-22", paymentMethod: null, source: "manual", receiptPath: null,
        notes: "", createdBy: "member", createdByName: "Member",
        createdAt: new Date(), updatedAt: new Date(),
      });
    });
  });

  afterAll(async () => environment.cleanup());

  it("blocks unauthenticated and cross-household reads", async () => {
    const anonymous = environment.unauthenticatedContext().firestore();
    const stranger = environment.authenticatedContext("stranger").firestore();
    await assertFails(getDoc(doc(anonymous, "households/home")));
    await assertFails(getDoc(doc(stranger, "households/home")));
  });

  it("allows a member to create, edit, and delete their own valid expense", async () => {
    const firestore = environment.authenticatedContext("member").firestore();
    const expense = doc(firestore, "households/home/expenses/new-expense");
    await assertSucceeds(setDoc(expense, {
      amountMinor: 12345, currency: "MXN", merchant: "Cafe", categoryId: "dining",
      expenseDate: "2026-10-22", paymentMethod: "cash", source: "manual", receiptPath: null,
      notes: "", createdBy: "member", createdByName: "Member",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(expense, { amountMinor: 15000, updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(expense));
  });

  it("allows linked investment contributions only to an account in the household", async () => {
    const firestore = environment.authenticatedContext("member").firestore();
    await assertSucceeds(setDoc(doc(firestore, "households/home/investmentAccounts/cetes"), {
      name: "Cetesdirecto",
      type: "government_bonds",
      provider: "Cetesdirecto",
      notes: "",
      createdAt: serverTimestamp(),
    }));
    await assertSucceeds(setDoc(doc(firestore, "households/home/expenses/investment"), {
      amountMinor: 10000, currency: "MXN", merchant: "CETES", categoryId: "investments",
      investmentAccountId: "cetes", expenseDate: "2026-10-22", paymentMethod: "bank_transfer",
      source: "manual", receiptPath: null, notes: "", createdBy: "member", createdByName: "Member",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(setDoc(doc(firestore, "households/home/investmentValuations/value"), {
      accountId: "cetes", valueMinor: 10500, valuationDate: "2026-10-22", createdAt: serverTimestamp(),
    }));
    const holdingRef = doc(firestore, "households/home/investmentHoldings/udibono-2031");
    await assertSucceeds(setDoc(holdingRef, {
      accountId: "cetes", name: "Udibono 2031", kind: "udibono", ticker: "",
      currency: "MXN", incomeFrequency: "semiannual", nextPaymentDate: "2026-10-23",
      amountInvestedMinor: 10000, currentValueMinor: 10500, currentValueDate: "2026-10-22",
      notes: "", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(setDoc(doc(firestore, "households/home/expenses/asset-contribution"), {
      amountMinor: 2500, currency: "MXN", merchant: "ETF buy", categoryId: "investments",
      investmentAccountId: "cetes", investmentHoldingId: "udibono-2031",
      expenseDate: "2026-10-22", paymentMethod: "bank_transfer",
      source: "manual", receiptPath: null, notes: "", createdBy: "member", createdByName: "Member",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(firestore, "households/home/expenses/mismatched-asset-contribution"), {
      amountMinor: 2500, currency: "MXN", merchant: "ETF buy", categoryId: "investments",
      investmentAccountId: "cetes", investmentHoldingId: "missing",
      expenseDate: "2026-10-22", paymentMethod: "bank_transfer",
      source: "manual", receiptPath: null, notes: "", createdBy: "member", createdByName: "Member",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(holdingRef, {
      currentValueMinor: 11000, currentValueDate: "2026-10-23", updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(setDoc(doc(firestore, "households/home/investmentHoldings/land-1"), {
      accountId: "cetes", name: "Parcel 1", kind: "land", ticker: "",
      currency: "MXN", incomeFrequency: "none", nextPaymentDate: null,
      amountInvestedMinor: 100000, currentValueMinor: 120000, currentValueDate: "2026-10-22",
      notes: "", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(firestore, "households/home/investmentHoldings/invalid-udibono"), {
      accountId: "cetes", name: "Udibono invalid cadence", kind: "udibono", ticker: "",
      currency: "MXN", incomeFrequency: "monthly", nextPaymentDate: "2026-11-23",
      amountInvestedMinor: 10000, currentValueMinor: 10000, currentValueDate: "2026-10-22",
      notes: "", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(setDoc(doc(firestore, "households/home/investmentIncome/coupon"), {
      accountId: "cetes", holdingId: "udibono-2031", type: "coupon", amountMinor: 12000,
      currency: "MXN", expectedDate: "2026-10-23", receivedDate: "2026-10-23",
      reinvested: false, notes: "", createdAt: serverTimestamp(),
    }));
    await assertSucceeds(updateDoc(holdingRef, {
      nextPaymentDate: "2027-04-23",
      updatedAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(firestore, "households/other/investmentIncome/foreign"), {
      accountId: "cetes", holdingId: "udibono-2031", type: "coupon", amountMinor: 1,
      currency: "MXN", expectedDate: "2026-10-23", receivedDate: "2026-10-23",
      reinvested: false, notes: "", createdAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(firestore, "households/home/investmentIncome/invalid"), {
      accountId: "cetes", holdingId: "missing", type: "coupon", amountMinor: 1,
      currency: "MXN", expectedDate: "2026-10-23", receivedDate: "2026-10-23",
      reinvested: false, notes: "", createdAt: serverTimestamp(),
    }));
    await assertSucceeds(setDoc(doc(firestore, "households/home/expenses/marked-investment"), {
      amountMinor: 10000, currency: "MXN", merchant: "Transfer", categoryId: "other",
      investmentAccountId: "cetes", expenseDate: "2026-10-22", paymentMethod: null,
      source: "manual", receiptPath: null, notes: "", createdBy: "member", createdByName: "Member",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(firestore, "households/home/expenses/unlinked-investment"), {
      amountMinor: 10000, currency: "MXN", merchant: "CETES", categoryId: "investments",
      investmentAccountId: null, expenseDate: "2026-10-22", paymentMethod: null,
      source: "manual", receiptPath: null, notes: "", createdBy: "member", createdByName: "Member",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(firestore, "households/home/expenses/unknown-account"), {
      amountMinor: 10000, currency: "MXN", merchant: "Transfer", categoryId: "other",
      investmentAccountId: "missing", expenseDate: "2026-10-22", paymentMethod: null,
      source: "manual", receiptPath: null, notes: "", createdBy: "member", createdByName: "Member",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(firestore, "households/other/investmentAccounts/foreign"), {
      name: "Foreign", type: "other", provider: "", notes: "", createdAt: serverTimestamp(),
    }));
    const strangerFirestore = environment.authenticatedContext("stranger").firestore();
    await assertFails(deleteDoc(doc(strangerFirestore, "households/home/investmentAccounts/cetes")));

    await assertSucceeds(deleteDoc(doc(firestore, "households/home/investmentIncome/coupon")));
    await assertSucceeds(deleteDoc(holdingRef));
    await assertSucceeds(deleteDoc(doc(firestore, "households/home/investmentHoldings/land-1")));
    await assertSucceeds(deleteDoc(doc(firestore, "households/home/investmentValuations/value")));
    await assertSucceeds(deleteDoc(doc(firestore, "households/home/expenses/investment")));
    await assertSucceeds(deleteDoc(doc(firestore, "households/home/expenses/asset-contribution")));
    await assertSucceeds(deleteDoc(doc(firestore, "households/home/expenses/marked-investment")));
    await assertSucceeds(deleteDoc(doc(firestore, "households/home/investmentAccounts/cetes")));
  });

  it("allows a confirmed receipt expense without storing an image path", async () => {
    const firestore = environment.authenticatedContext("member").firestore();
    await assertSucceeds(setDoc(doc(firestore, "households/home/expenses/receipt-expense"), {
      amountMinor: 12345, currency: "MXN", merchant: "Cafe", categoryId: "dining",
      expenseDate: "2026-10-22", paymentMethod: null, source: "receipt", receiptPath: null,
      notes: "", createdBy: "member", createdByName: "Member",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
  });

  it("allows household members to create and use custom categories", async () => {
    const firestore = environment.authenticatedContext("member").firestore();
    await assertSucceeds(setDoc(doc(firestore, "households/home/categories/custom_pets"), {
      name: "Pets",
      icon: "🐾",
      color: "#6f9f75",
      active: true,
      sortOrder: 9,
      createdAt: serverTimestamp(),
    }));
    await assertSucceeds(setDoc(doc(firestore, "households/home/expenses/pet-expense"), {
      amountMinor: 12345, currency: "MXN", merchant: "Vet", categoryId: "custom_pets",
      expenseDate: "2026-10-22", paymentMethod: "cash", source: "manual", receiptPath: null,
      notes: "", createdBy: "member", createdByName: "Member",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(setDoc(doc(firestore, "households/home/budgets/2026-10_custom_pets"), {
      month: "2026-10", categoryId: "custom_pets", limitMinor: 50000,
      currency: "MXN", updatedAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(firestore, "households/other/expenses/invalid-category"), {
      amountMinor: 12345, currency: "MXN", merchant: "Vet", categoryId: "custom_pets",
      expenseDate: "2026-10-22", paymentMethod: "cash", source: "manual", receiptPath: null,
      notes: "", createdBy: "member", createdByName: "Member",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await assertFails(setDoc(doc(firestore, "households/home/expenses/missing-category"), {
      amountMinor: 12345, currency: "MXN", merchant: "Vet", categoryId: "custom_missing",
      expenseDate: "2026-10-22", paymentMethod: "cash", source: "manual", receiptPath: null,
      notes: "", createdBy: "member", createdByName: "Member",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await assertFails(deleteDoc(doc(firestore, "households/home/categories/custom_pets")));
  });

  it("allows each signed-in user to hold only their own short-lived receipt lock", async () => {
    const firestore = environment.authenticatedContext("member").firestore();
    const lock = doc(firestore, "users/member/receiptProcessing/current");
    await assertSucceeds(setDoc(lock, {
      lockId: "scan-1",
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000),
    }));
    await assertFails(setDoc(doc(firestore, "users/owner/receiptProcessing/current"), {
      lockId: "scan-2",
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000),
    }));
  });

  it("lets an owner issue and the invited email atomically accept a one-time invitation", async () => {
    const owner = environment.authenticatedContext("stranger").firestore();
    const invitationId = "a".repeat(64);
    const invitation = doc(owner, `householdInvitations/${invitationId}`);
    await assertSucceeds(setDoc(invitation, {
      householdId: "other",
      email: "visitor@example.com",
      createdBy: "stranger",
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: "pending",
    }));

    const visitor = environment.authenticatedContext("visitor", { email: "VISITOR@EXAMPLE.COM" }).firestore();
    await assertSucceeds(runTransaction(visitor, async (transaction) => {
      const currentInvite = await transaction.get(doc(visitor, `householdInvitations/${invitationId}`));
      const profile = doc(visitor, "users/visitor");
      await transaction.get(profile);
      if (!currentInvite.exists()) throw new Error("Invitation was not found.");

      transaction.set(doc(visitor, "households/other/members/visitor"), {
        role: "member",
        active: true,
        joinedAt: serverTimestamp(),
        invitationId,
      });
      transaction.update(doc(visitor, "households/other"), {
        memberCount: 2,
        updatedAt: serverTimestamp(),
      });
      transaction.update(doc(visitor, `householdInvitations/${invitationId}`), {
        status: "accepted",
        acceptedBy: "visitor",
        acceptedAt: serverTimestamp(),
      });
      transaction.set(profile, {
        displayName: "Visitor",
        email: "visitor@example.com",
        defaultHouseholdId: "other",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }));
  });

  it("lets only the invited email inspect expired or already-used invitations", async () => {
    const invitationIds = ["b".repeat(64), "c".repeat(64)];
    await environment.withSecurityRulesDisabled(async (context) => {
      const firestore = context.firestore();
      await setDoc(doc(firestore, `householdInvitations/${invitationIds[0]}`), {
        email: "visitor@example.com",
        status: "pending",
        expiresAt: Timestamp.fromMillis(Date.now() - 1000),
      });
      await setDoc(doc(firestore, `householdInvitations/${invitationIds[1]}`), {
        email: "visitor@example.com",
        status: "accepted",
        expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
      });
    });

    const visitor = environment.authenticatedContext("visitor", { email: "VISITOR@EXAMPLE.COM" }).firestore();
    const otherUser = environment.authenticatedContext("other-user", { email: "other@example.com" }).firestore();
    for (const invitationId of invitationIds) {
      await assertSucceeds(getDoc(doc(visitor, `householdInvitations/${invitationId}`)));
      await assertFails(getDoc(doc(otherUser, `householdInvitations/${invitationId}`)));
    }
  });

  it("rejects invalid amounts and changes to a protected creator field", async () => {
    const firestore = environment.authenticatedContext("member").firestore();
    const invalid = doc(firestore, "households/home/expenses/invalid");
    await assertFails(setDoc(invalid, {
      amountMinor: -20, currency: "MXN", merchant: "Market", categoryId: "groceries",
      expenseDate: "2026-10-22", paymentMethod: null, source: "manual", receiptPath: null,
      notes: "", createdBy: "member", createdByName: "Member",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(firestore, "households/home/expenses/member-expense"), { createdBy: "owner" }));
  });

  it("does not allow a household member to grant themselves owner privileges", async () => {
    const firestore = environment.authenticatedContext("member").firestore();
    await assertFails(setDoc(doc(firestore, "households/home/members/attacker"), { role: "owner", active: true }));
    await assertFails(updateDoc(doc(firestore, "households/home/members/member"), { role: "owner" }));
    await assertFails(setDoc(doc(firestore, "householdInvitations/fake"), { email: "attacker@example.com" }));
  });
});
