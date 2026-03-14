/**
 * 備份 API 請求 Schema
 */
import { z } from 'zod';

export const verifySshSchema = z.object({
  host: z.string().min(1),
  username: z.string().min(1),
  password: z.string(),
});

export const verifySudoSchema = z.object({
  sudoPassword: z.string(),
});

const DEFAULT_NAS_SHARE = 'KE20.4.軟硬體系統備份記錄';
const DEFAULT_NAS_PATH = '4.備份記錄/KE';

export const verifyNasSchema = z.object({
  host: z.string().min(1),
  username: z.string().min(1),
  password: z.string(),
  share: z.string().optional().transform((v) => (v?.trim() ? v.trim() : DEFAULT_NAS_SHARE)),
  path: z.string().optional().transform((v) => (v?.trim() ? v.trim() : DEFAULT_NAS_PATH)),
  domain: z.string().optional(),
});

export const verifyHumanSchema = z.object({
  action: z.enum(['get', 'verify']),
  code: z.string().min(4).max(4).optional(),
});

export const discoverRemoteSchema = z.object({
  basePath: z.string().optional(),
});

export const remoteBrowseSchema = z.object({
  path: z.string().optional().default('/'),
});

export const createNasDirSchema = z.object({
  path: z.string().optional().default(''),
  dirName: z.string().min(1, '請輸入目錄名稱'),
});

export const addSourceSchema = z.object({
  label: z.string().min(1),
  sourcePath: z.string().min(1),
  destPath: z.string().min(1),
  isAbsoluteSource: z.boolean().optional(),
});
