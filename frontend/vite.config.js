import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
    base: '/finereport-backup/',
    plugins: [
        tailwindcss(),
        react()
    ],
    server: {
        host: '0.0.0.0', // 監聽所有網路介面
        port: 5174, // 可自訂埠號
        strictPort: false, // 如果埠號被占用，自動嘗試下一個
        proxy: {
            // 本地開發：/finereport-backup/api 轉發至後端 FastAPI
            '/finereport-backup/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                rewrite: function (path) { return path.replace(/^\/finereport-backup/, ''); },
            },
        },
    },
});
