import type { ReactElement } from 'react';
import { CrownBrand } from '@shared-ui/crown-brand';
import { NavCalendarCluster, PortalTopNav } from '@shared-ui/portal-nav';
import logoUrl from '@shared-ui/crown-brand/assets/CROWN_logo.png';
import { APP_VERSION } from '../constants/appVersion';

/**
 * FineReport 備份工具 — 頂部導覽列
 * 左：企業品牌識別，中：系統名稱與版號，右：即時日期時間。
 */
export function TopTitleNav(): ReactElement {
  return (
    <PortalTopNav
      rowClassName="max-w-5xl mx-auto"
      left={<CrownBrand logoSrc={logoUrl} title="海灣國際" subtitle="" />}
      center={
        <div className="flex flex-col items-center justify-center gap-0.5 text-center min-w-0 px-2">
          <span className="font-black text-base sm:text-lg text-gray-800 tracking-tight leading-tight">
            FineReport 備份工具
          </span>
          <span className="text-xs font-bold text-blue-600 tabular-nums">v{APP_VERSION}</span>
        </div>
      }
      right={<NavCalendarCluster />}
    />
  );
}
