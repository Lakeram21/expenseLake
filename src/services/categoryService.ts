import { collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { CATEGORIES } from "../lib/categories";
import { db } from "../lib/firebase";
import type { Category } from "../types";

const CATEGORY_COLORS = ["#6f9f75", "#d58b66", "#7398c5", "#b292c4", "#d2a64f", "#cd7e87", "#7ea9a1", "#8984bd"];

function database() {
  if (!db) throw new Error("Firebase is not configured.");
  return db;
}

export async function listCategories(householdId: string): Promise<Category[]> {
  const snapshot = await getDocs(collection(database(), "households", householdId, "categories"));
  const customCategories = snapshot.docs.flatMap((item) => {
    const data = item.data();
    if (data.active !== true || typeof data.name !== "string" || typeof data.icon !== "string" || typeof data.sortOrder !== "number") return [];
    const color = typeof data.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(data.color)
      ? data.color
      : CATEGORY_COLORS[Math.abs(data.sortOrder) % CATEGORY_COLORS.length];
    return [{ id: item.id, name: data.name, icon: data.icon, color, sortOrder: data.sortOrder }];
  }).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .map((category) => ({ id: category.id, name: category.name, icon: category.icon, color: category.color }));
  return [...CATEGORIES, ...customCategories];
}

export async function createCategory(householdId: string, name: string, icon = "✳️"): Promise<void> {
  const normalizedName = name.trim().replace(/\s+/g, " ");
  if (normalizedName.length < 2 || normalizedName.length > 40) {
    throw new Error("Category names must be between 2 and 40 characters.");
  }
  const normalizedIcon = icon.trim() || "✳️";
  if ([...normalizedIcon].length > 4) throw new Error("Choose a shorter category icon.");

  const id = `custom_${crypto.randomUUID().replaceAll("-", "")}`;
  const current = await listCategories(householdId);
  if (current.some((category) => category.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) {
    throw new Error("A category with that name already exists.");
  }
  await setDoc(doc(database(), "households", householdId, "categories", id), {
    name: normalizedName,
    icon: normalizedIcon,
    color: CATEGORY_COLORS[current.length % CATEGORY_COLORS.length],
    active: true,
    sortOrder: current.length,
    createdAt: serverTimestamp(),
  });
}
