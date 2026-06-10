const STORAGE_KEY = "floorplan_user_id";
const DEFAULT_TEST_USER = "test";

export function getUserId(): string {
  if (typeof window === "undefined") return DEFAULT_TEST_USER;

  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("userId")?.trim();
  if (fromQuery && /^[a-zA-Z0-9_-]{1,64}$/.test(fromQuery)) {
    localStorage.setItem(STORAGE_KEY, fromQuery);
    return fromQuery;
  }

  const stored = localStorage.getItem(STORAGE_KEY)?.trim();
  if (stored && /^[a-zA-Z0-9_-]{1,64}$/.test(stored)) {
    return stored;
  }

  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 12)
      : DEFAULT_TEST_USER;

  localStorage.setItem(STORAGE_KEY, id);
  return id;
}

export function setUserId(userId: string): void {
  if (/^[a-zA-Z0-9_-]{1,64}$/.test(userId)) {
    localStorage.setItem(STORAGE_KEY, userId);
  }
}

export function useTestUser(): void {
  setUserId(DEFAULT_TEST_USER);
}
