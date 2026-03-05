export interface BackupSource {
  id: string;
  label: string;
  sourcePath: string;
  destPath: string;
  isAbsoluteSource?: boolean;
  resolved?: boolean;
}
