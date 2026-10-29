/**
 * Session 儲存（記憶體，key 為 sessionId）
 */
import type { BackupJobManifest } from './backupJobManifest.js';
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
    lastJob?: BackupJobManifest;
}
export declare function getSession(sessionId: string): SessionData | undefined;
export declare function getOrCreateSession(sessionId: string): SessionData;
export declare function setSession(sessionId: string, data: Partial<SessionData>): void;
export declare function setHumanCode(sessionId: string, code: string): void;
export declare function verifyHumanCode(sessionId: string, input: string): boolean;
export declare function isHumanVerified(sessionId: string): boolean;
export declare function hasSshCredentials(sessionId: string): boolean;
export declare function hasNasCredentials(sessionId: string): boolean;
export declare function setLastJob(sessionId: string, job: BackupJobManifest): void;
export declare function getLastJob(sessionId: string): BackupJobManifest | undefined;
export declare function clearSession(sessionId: string): void;
//# sourceMappingURL=sessionStore.d.ts.map