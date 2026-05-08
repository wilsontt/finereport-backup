var _a;
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// 自動判斷 shared-ui 位置（本機 / 容器都可用）
var frontendRoot = path.dirname(fileURLToPath(import.meta.url));
var sharedUiCandidates = [
    path.resolve(frontendRoot, '0.shared-ui'),
    path.resolve(frontendRoot, '../0.shared-ui'),
    path.resolve(frontendRoot, '../../0.shared-ui'),
];
var sharedUiRoot = (_a = sharedUiCandidates.find(function (p) { return existsSync(p); })) !== null && _a !== void 0 ? _a : sharedUiCandidates[0];
// 讀取 package.json 取得應用程式版號
var pkgPath = path.join(frontendRoot, 'package.json');
var pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
export default defineConfig({
    base: '/finereport-backup/',
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
        alias: {
            '@shared-ui': sharedUiRoot,
        },
        dedupe: ['react', 'react-dom'],
    },
    plugins: [react(), tailwindcss()],
    server: {
        fs: {
            allow: [frontendRoot, sharedUiRoot],
        },
        host: '0.0.0.0',
        port: 5174,
        strictPort: false,
        proxy: {
            '/finereport-backup/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                rewrite: function (path) { return path.replace(/^\/finereport-backup/, ''); },
            },
        },
    },
});
