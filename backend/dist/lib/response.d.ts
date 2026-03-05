/**
 * 統一回應格式
 */
import { Response } from 'express';
export declare function success(res: Response, data: unknown, status?: number): void;
export declare function error(res: Response, code: string, message: string, status?: number): void;
//# sourceMappingURL=response.d.ts.map