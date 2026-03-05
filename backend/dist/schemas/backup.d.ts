/**
 * 備份 API 請求 Schema
 */
import { z } from 'zod';
export declare const verifySshSchema: z.ZodObject<{
    host: z.ZodString;
    username: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    password: string;
    host: string;
    username: string;
}, {
    password: string;
    host: string;
    username: string;
}>;
export declare const verifySudoSchema: z.ZodObject<{
    sudoPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    sudoPassword: string;
}, {
    sudoPassword: string;
}>;
export declare const verifyNasSchema: z.ZodObject<{
    host: z.ZodString;
    username: z.ZodString;
    password: z.ZodString;
    share: z.ZodEffects<z.ZodOptional<z.ZodString>, string, string | undefined>;
    path: z.ZodEffects<z.ZodOptional<z.ZodString>, string, string | undefined>;
    domain: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    password: string;
    path: string;
    host: string;
    username: string;
    share: string;
    domain?: string | undefined;
}, {
    password: string;
    host: string;
    username: string;
    path?: string | undefined;
    share?: string | undefined;
    domain?: string | undefined;
}>;
export declare const verifyHumanSchema: z.ZodObject<{
    action: z.ZodEnum<["get", "verify"]>;
    code: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    action: "get" | "verify";
    code?: string | undefined;
}, {
    action: "get" | "verify";
    code?: string | undefined;
}>;
export declare const discoverRemoteSchema: z.ZodObject<{
    basePath: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    basePath?: string | undefined;
}, {
    basePath?: string | undefined;
}>;
export declare const remoteBrowseSchema: z.ZodObject<{
    path: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    path: string;
}, {
    path?: string | undefined;
}>;
export declare const createNasDirSchema: z.ZodObject<{
    path: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    dirName: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
    dirName: string;
}, {
    dirName: string;
    path?: string | undefined;
}>;
export declare const addSourceSchema: z.ZodObject<{
    label: z.ZodString;
    sourcePath: z.ZodString;
    destPath: z.ZodString;
    isAbsoluteSource: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    label: string;
    sourcePath: string;
    destPath: string;
    isAbsoluteSource?: boolean | undefined;
}, {
    label: string;
    sourcePath: string;
    destPath: string;
    isAbsoluteSource?: boolean | undefined;
}>;
//# sourceMappingURL=backup.d.ts.map