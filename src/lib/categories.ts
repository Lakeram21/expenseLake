import type { Category } from "../types";

export const CATEGORIES: Category[] = [
  { id: "groceries", name: "Groceries", icon: "🛒", color: "#6f9f75" },
  { id: "dining", name: "Dining out", icon: "🍽️", color: "#d58b66" },
  { id: "transport", name: "Transport", icon: "🚙", color: "#7398c5" },
  { id: "home", name: "Home", icon: "🏠", color: "#b292c4" },
  { id: "utilities", name: "Utilities", icon: "💡", color: "#d2a64f" },
  { id: "health", name: "Health", icon: "💊", color: "#cd7e87" },
  { id: "shopping", name: "Shopping", icon: "🧺", color: "#7ea9a1" },
  { id: "entertainment", name: "Fun", icon: "🎟️", color: "#8984bd" },
  { id: "other", name: "Other", icon: "✳️", color: "#929b9a" },
];

export function getCategory(id: string, categories: Category[] = CATEGORIES): Category {
  return categories.find((category) => category.id === id) ?? categories.find((category) => category.id === "other") ?? CATEGORIES[CATEGORIES.length - 1];
}
