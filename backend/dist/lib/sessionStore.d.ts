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
export declare function getSession(sessionId: string): SessionData | undefined;
export declare function getOrCreateSession(sessionId: string): SessionData;
export declare function setSession(sessionId: string, data: Partial<SessionData>): void;
export declare function setHumanCode(sessionId: string, code: string): void;
export declare function verifyHumanCode(sessionId: string, input: string): boolean;
export declare function isHumanVerified(sessionId: string): boolean;
export declare function hasSshCredentials(sessionId: string): boolean;
export declare function hasNasCredentials(sessionId: string): boolean;
export declare function clearSession(sessionId: string): void;
//# sourceMappingURL=sessionStore.d.ts.map