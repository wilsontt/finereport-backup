/**
 * Session 儲存（記憶體，key 為 sessionId）
 */

export interface SessionData {
  ssh?: {
    host: string;
    username: string;
    password: string;
  };
  sudoPassword?: string;
  nas?: {
    host: string;
    username: string;
    password: string;
    share: string;
    path: string;
    domain?: string;
  };
  humanCode?: string;
  humanExpiresAt?: number;
  humanVerified?: boolean;
}

const store = new Map<string, SessionData>();
const HUMAN_CODE_TTL_MS = 5 * 60 * 1000; // 5 分鐘

export function getSession(sessionId: string): SessionData | undefined {
  return store.get(sessionId);
}

export function getOrCreateSession(sessionId: string): SessionData {
  let s = store.get(sessionId);
  if (!s) {
    s = {};
    store.set(sessionId, s);
  }
  return s;
}

export function setSession(sessionId: string, data: Partial<SessionData>): void {
  const s = getOrCreateSession(sessionId);
  Object.assign(s, data);
}

export function setHumanCode(sessionId: string, code: string): void {
  const s = getOrCreateSession(sessionId);
  s.humanCode = code;
  s.humanExpiresAt = Date.now() + HUMAN_CODE_TTL_MS;
}

export function verifyHumanCode(sessionId: string, input: string): boolean {
  const s = store.get(sessionId);
  if (!s?.humanCode || !s.humanExpiresAt) return false;
  if (Date.now() > s.humanExpiresAt) return false;
  if (s.humanCode !== input) return false;
  s.humanVerified = true;
  return true;
}

export function isHumanVerified(sessionId: string): boolean {
  return store.get(sessionId)?.humanVerified === true;
}

export function hasSshCredentials(sessionId: string): boolean {
  return !!store.get(sessionId)?.ssh;
}

export function hasNasCredentials(sessionId: string): boolean {
  return !!store.get(sessionId)?.nas;
}

export function clearSession(sessionId: string): void {
  store.delete(sessionId);
}
