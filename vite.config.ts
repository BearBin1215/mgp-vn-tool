import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import checker from 'vite-plugin-checker';
import path from 'path';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    checker({ typescript: true }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  css: {
    devSourcemap: true,
  },

  build: {
    chunkSizeWarningLimit: 4096,
  },
  // 防止 Vite 遮挡 Rust 错误信息
  clearScreen: false,
  // Tauri 要求固定端口，端口不可用时构建失败
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // Vite 忽略监听 `src-tauri` 目录
      ignored: ['**/src-tauri/**'],
    },
  },
});
