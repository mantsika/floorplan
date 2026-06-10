export type UserType = "temp" | "permanent" | "test";

export interface UserSession {
  userId: string;
  type: UserType;
  r2Prefix: string;
  isTemp: boolean;
  displayName?: string;
}

const TEMP_ID_KEY = "floorplan_temp_id";
const PERM_ID_KEY = "floorplan_perm_id";
const USER_TYPE_KEY = "floorplan_user_type";
const DISPLAY_NAME_KEY = "floorplan_display_name";
const TEST_USER_ID = "test";

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

function createTempId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 12)
    : `guest_${Date.now().toString(36)}`;
}

function testSession(): UserSession {
  return { userId: TEST_USER_ID, type: "test", r2Prefix: TEST_USER_ID, isTemp: false };
}

export function getUserSession(): UserSession {
  if (typeof window === "undefined") return testSession();

  const params = new URLSearchParams(window.location.search);
  const queryUser = params.get("userId")?.trim();
  if (queryUser === TEST_USER_ID) {
    localStorage.setItem(USER_TYPE_KEY, "test");
    return testSession();
  }

  const storedType = (localStorage.getItem(USER_TYPE_KEY) as UserType) || "temp";

  if (storedType === "test") {
    return testSession();
  }

  if (storedType === "permanent") {
    const permId = localStorage.getItem(PERM_ID_KEY)?.trim();
    if (permId && ID_PATTERN.test(permId)) {
      return {
        userId: permId,
        type: "permanent",
        r2Prefix: permId,
        isTemp: false,
        displayName: localStorage.getItem(DISPLAY_NAME_KEY) || undefined,
      };
    }
  }

  let tempId = localStorage.getItem(TEMP_ID_KEY)?.trim();
  if (!tempId || !ID_PATTERN.test(tempId)) {
    tempId = createTempId();
    localStorage.setItem(TEMP_ID_KEY, tempId);
    localStorage.setItem(USER_TYPE_KEY, "temp");
  }

  return {
    userId: tempId,
    type: "temp",
    r2Prefix: `temp/${tempId}`,
    isTemp: true,
  };
}

export function useTestUser(): UserSession {
  localStorage.setItem(USER_TYPE_KEY, "test");
  localStorage.removeItem(TEMP_ID_KEY);
  return testSession();
}

export function completeSignup(permanentUserId: string, displayName?: string): UserSession {
  const id = permanentUserId.trim();
  if (!ID_PATTERN.test(id) || id === TEST_USER_ID || id.startsWith("temp")) {
    throw new Error("Username must be 1–64 alphanumeric characters (not 'test').");
  }

  localStorage.setItem(PERM_ID_KEY, id);
  localStorage.setItem(USER_TYPE_KEY, "permanent");
  if (displayName) localStorage.setItem(DISPLAY_NAME_KEY, displayName.slice(0, 100));

  return {
    userId: id,
    type: "permanent",
    r2Prefix: id,
    isTemp: false,
    displayName: displayName?.slice(0, 100),
  };
}

export function getTempUserIdForClaim(): string | null {
  const session = getUserSession();
  if (!session.isTemp) return null;
  return session.userId;
}

/** @deprecated use getUserSession().userId */
export function getUserId(): string {
  return getUserSession().userId;
}

/** @deprecated use completeSignup */
export function setUserId(userId: string): void {
  completeSignup(userId);
}
