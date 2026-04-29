/**
 * 備份 API 客戶端
 */
const BASE = '/finereport-backup/api/backup';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // 回退：非 Secure Context（HTTP + IP）下手動生成 UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getSessionId(): string {
  let id = sessionStorage.getItem('finereport-session-id');
  if (!id) {
    id = generateUUID();
    sessionStorage.setItem('finereport-session-id', id);
  }
  return id;
}

const REQUEST_TIMEOUT_MS = 25000;

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ error: boolean; data?: T; code?: string; message?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': getSessionId(),
        ...options.headers,
      },
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      return { error: true, code: 'ERR_TIMEOUT', message: '請求逾時，請檢查網路連線' };
    }
    throw err;
  }
  clearTimeout(timeoutId);
  let json: { error?: boolean; data?: T; code?: string; message?: string };
  try {
    const text = await res.text();
    json = text ? JSON.parse(text) : {};
  } catch {
    return { error: true, code: 'ERR_PARSE', message: `伺服器回應異常 (${res.status})` };
  }
  if (!res.ok) {
    return { error: true, code: json.code ?? 'ERR_SERVER', message: json.message ?? `請求失敗 (${res.status})` };
  }
  return { ...json, error: json.error ?? false };
}

export const backupApi = {
  async verifySsh(body: { host: string; username: string; password: string }) {
    return request<{ ok: boolean }>('/verify-ssh', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  async verifySudo(body: { sudoPassword: string }) {
    return request<{ ok: boolean }>('/verify-sudo', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  async verifyNas(body: {
    host: string;
    username: string;
    password: string;
    share?: string;
    path?: string;
    domain?: string;
  }) {
    return request<{ ok: boolean; fullPath: string }>('/verify-nas', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  async getHumanCode() {
    return request<{ code: string; expiresIn: number }>('/verify-human', {
      method: 'POST',
      body: JSON.stringify({ action: 'get' }),
    });
  },
  async verifyHumanCode(code: string) {
    return request<{ ok: boolean }>('/verify-human', {
      method: 'POST',
      body: JSON.stringify({ action: 'verify', code }),
    });
  },
  async getNasDefaultPath() {
    return request<{ path: string }>('/nas-default-path');
  },
  async browseNas(path?: string) {
    return request<{ entries: { name: string; isDir: boolean }[] }>('/nas-browse', {
      method: 'POST',
      body: JSON.stringify({ path: path ?? '' }),
    });
  },
  async createNasDirectory(path: string, dirName: string) {
    return request<{ ok: boolean }>('/nas-mkdir', {
      method: 'POST',
      body: JSON.stringify({ path: path ?? '', dirName }),
    });
  },
  async browseRemote(path?: string) {
    return request<{ entries: { name: string; isDir: boolean }[] }>('/remote-browse', {
      method: 'POST',
      body: JSON.stringify({ path: path ?? '/' }),
    });
  },
  async discoverRemote(basePath?: string) {
    return request<{ sources: unknown[] }>('/discover-remote', {
      method: 'POST',
      body: JSON.stringify({ basePath }),
    });
  },
  async getSources() {
    return request<{ sources: unknown[] }>('/sources');
  },
  async addSource(body: { label: string; sourcePath: string; destPath: string; isAbsoluteSource?: boolean }) {
    return request<{ id: string; label: string; sourcePath: string; destPath: string }>('/sources', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  async getStagingDefaultPath() {
    return request<{ path: string }>('/staging-default-path');
  },
  async createStagingDir(body: { stagingPath: string }) {
    return request<{ ok: boolean; path: string; backupMonth: string }>('/create-staging-dir', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  async startBackup(body: {
    stagingPath: string;
    sources: unknown[];
    nasPath: string;
    deleteOldBackup: boolean;
    retentionMonths: number;
  }) {
    return request<{ backupId: string; status: string }>('/start', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  getProgressStream(backupId: string): EventSource {
    const url = `${BASE}/progress/${backupId}?sessionId=${encodeURIComponent(getSessionId())}`;
    return new EventSource(url);
  },
  async getReport(backupId: string) {
    return request<{ content: string; format: string }>(
      `/report/${backupId}`
    );
  },
};
