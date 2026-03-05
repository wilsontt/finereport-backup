declare module 'ssh2-sftp-client' {
  interface ConnectOptions {
    host: string;
    port?: number;
    username: string;
    password?: string;
    privateKey?: string;
  }

  interface DownloadDirOptions {
    filter?: (path: string, isDir: boolean) => boolean;
    useFastget?: boolean;
  }

  class SftpClient {
    connect(config: ConnectOptions): Promise<void>;
    downloadDir(srcDir: string, dstDir: string, options?: DownloadDirOptions): Promise<string>;
    end(): Promise<void>;
  }

  export default SftpClient;
}
