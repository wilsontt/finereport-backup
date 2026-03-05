/**
 * 預設備份來源常數
 */

export interface BackupSourceItem {
  id: string;
  label: string;
  sourcePath: string;
  destPath: string;
  isAbsoluteSource?: boolean;
}

export const DEFAULT_BACKUP_SOURCES: BackupSourceItem[] = [
  {
    id: 'config',
    label: '平台設定',
    sourcePath: 'config/auto/{latest}',
    destPath: 'webroot/config',
    isAbsoluteSource: false,
  },
  {
    id: 'jar',
    label: 'Java套件',
    sourcePath: 'jar/auto/{latest}',
    destPath: 'webroot/jar',
    isAbsoluteSource: false,
  },
  {
    id: 'plugins',
    label: 'Plugin套件',
    sourcePath: 'plugins/auto/{latest}',
    destPath: 'webroot/plugins',
    isAbsoluteSource: false,
  },
  {
    id: 'reportlets',
    label: '報表範本',
    sourcePath: 'reportlets/auto/{latest}',
    destPath: 'webroot/reportlets',
    isAbsoluteSource: false,
  },
  {
    id: 'schedule',
    label: '自動定時執行',
    sourcePath: '/opt/tomcat/webapps/webroot/WEB-INF/schedule',
    destPath: 'WEB-INF/schedule',
    isAbsoluteSource: true,
  },
  {
    id: 'embed',
    label: 'embed',
    sourcePath: '/opt/tomcat/webapps/webroot/WEB-INF/embed',
    destPath: 'WEB-INF/embed',
    isAbsoluteSource: true,
  },
  {
    id: 'tomcat-conf',
    label: 'Tomcat設定',
    sourcePath: '/opt/tomcat/conf',
    destPath: 'tomcat/conf',
    isAbsoluteSource: true,
  },
  {
    id: 'finedb',
    label: 'MySQL finedb',
    sourcePath: '/opt/mysql/mysqldata/finedb',
    destPath: 'mysqldata',
    isAbsoluteSource: true,
  },
  {
    id: 'mysql',
    label: 'MySQL mysql',
    sourcePath: '/opt/mysql/mysqldata/mysql',
    destPath: 'mysqldata',
    isAbsoluteSource: true,
  },
];
