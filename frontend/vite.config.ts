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
    host: '0.0.0.0',
    port: 5174,
    strictPort: false,
    proxy: {
      '/finereport-backup/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/finereport-backup/, ''),
      },
    },
  },
});
