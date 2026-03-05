/**
 * Session 儲存（記憶體，key 為 sessionId）
 */
const store = new Map();
const HUMAN_CODE_TTL_MS = 5 * 60 * 1000; // 5 分鐘
export function getSession(sessionId) {
    return store.get(sessionId);
}
export function getOrCreateSession(sessionId) {
    let s = store.get(sessionId);
    if (!s) {
        s = {};
        store.set(sessionId, s);
    }
    return s;
}
export function setSession(sessionId, data) {
    const s = getOrCreateSession(sessionId);
    Object.assign(s, data);
}
export function setHumanCode(sessionId, code) {
    const s = getOrCreateSession(sessionId);
    s.humanCode = code;
    s.humanExpiresAt = Date.now() + HUMAN_CODE_TTL_MS;
}
export function verifyHumanCode(sessionId, input) {
    const s = store.get(sessionId);
    if (!s?.humanCode || !s.humanExpiresAt)
        return false;
    if (Date.now() > s.humanExpiresAt)
        return false;
    if (s.humanCode !== input)
        return false;
    s.humanVerified = true;
    return true;
}
export function isHumanVerified(sessionId) {
    return store.get(sessionId)?.humanVerified === true;
}
export function hasSshCredentials(sessionId) {
    return !!store.get(sessionId)?.ssh;
}
export function hasNasCredentials(sessionId) {
    return !!store.get(sessionId)?.nas;
}
export function clearSession(sessionId) {
    store.delete(sessionId);
}
//# sourceMappingURL=sessionStore.js.map