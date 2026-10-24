import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  setDoc,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { FirebaseError } from "firebase/app";
import { db } from "../lib/firebase";
import type { Household, HouseholdMember } from "../types";

function database() {
  if (!db) throw new Error("Firebase is not configured.");
  return db;
}

export async function getUserHousehold(uid: string): Promise<Household | null> {
  const userSnapshot = await getDoc(doc(database(), "users", uid));
  const householdId = userSnapshot.data()?.defaultHouseholdId as string | undefined;
  if (!householdId) return null;
  const householdSnapshot = await getDoc(doc(database(), "households", householdId));
  if (!householdSnapshot.exists()) return null;
  return { id: householdSnapshot.id, ...householdSnapshot.data() } as Household;
}

export async function createHousehold(name: string, user: {
  uid: string;
  email: string;
  displayName: string;
}): Promise<void> {
  const id = doc(collection(database(), "households")).id;
  const householdRef = doc(database(), "households", id);
  await setDoc(householdRef, {
    name: name.trim(),
    ownerUid: user.uid,
    memberCount: 1,
    currency: "MXN",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(householdRef, "members", user.uid), {
    role: "owner",
    active: true,
    joinedAt: serverTimestamp(),
  });
  await setDoc(doc(database(), "users", user.uid), {
    displayName: user.displayName,
    email: user.email,
    defaultHouseholdId: id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function listMembers(householdId: string): Promise<HouseholdMember[]> {
  const snapshot = await getDocs(collection(database(), "households", householdId, "members"));
  return Promise.all(snapshot.docs.map(async (member) => {
    const profile = await getDoc(doc(database(), "users", member.id));
    const data = profile.data();
    return {
      uid: member.id,
      displayName: data?.displayName ?? "Household member",
      email: data?.email ?? "",
      role: member.data().role,
    } as HouseholdMember;
  }));
}

export async function inviteMember(householdId: string, email: string, ownerUid: string): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
    throw new Error("Enter a valid email address.");
  }
  const code = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const invitationRef = doc(database(), "householdInvitations", code);
  await setDoc(invitationRef, {
    householdId,
    email: normalizedEmail,
    createdBy: ownerUid,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
    status: "pending",
  });
  return code;
}

export async function acceptInvitation(
  code: string,
  user: { uid: string; email: string; displayName: string },
): Promise<void> {
  const normalizedCode = code.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedCode)) throw new Error("Enter a valid invitation code.");
  const invitationRef = doc(database(), "householdInvitations", normalizedCode);
  try {
    await runTransaction(database(), async (transaction) => {
      const invitation = await transaction.get(invitationRef);
      const inviteData = invitation.data();
      if (!invitation.exists() || inviteData?.status !== "pending" || !(inviteData.expiresAt instanceof Timestamp) || inviteData.expiresAt.toMillis() <= Date.now()) {
        throw new Error("This invitation has expired or was already used.");
      }
      if (inviteData.email !== user.email.trim().toLowerCase()) {
        throw new Error("This invitation was created for a different email address.");
      }
      if (typeof inviteData.householdId !== "string") throw new Error("This invitation is invalid.");
      const householdRef = doc(database(), "households", inviteData.householdId);
      const memberRef = doc(householdRef, "members", user.uid);
      const userRef = doc(database(), "users", user.uid);
      const profile = await transaction.get(userRef);
      const now = serverTimestamp();
      transaction.set(memberRef, {
        role: "member",
        active: true,
        joinedAt: now,
        invitationId: normalizedCode,
      });
      transaction.update(householdRef, { memberCount: 2, updatedAt: now });
      transaction.update(invitationRef, {
        status: "accepted",
        acceptedBy: user.uid,
        acceptedAt: now,
      });
      transaction.set(userRef, {
        displayName: user.displayName,
        email: user.email.trim().toLowerCase(),
        defaultHouseholdId: inviteData.householdId,
        ...(profile.exists() ? {} : { createdAt: now }),
        updatedAt: now,
      }, { merge: true });
    });
  } catch (caught) {
    if (caught instanceof FirebaseError && caught.code === "permission-denied") {
      throw new Error(
        "Couldn't access this invitation. Make sure you're signed in with the invited email and ask the household owner for a new invitation if the problem continues.",
      );
    }
    throw caught;
  }
}

export async function updateDefaultHousehold(uid: string, householdId: string): Promise<void> {
  await updateDoc(doc(database(), "users", uid), {
    defaultHouseholdId: householdId,
    updatedAt: serverTimestamp(),
  });
}
