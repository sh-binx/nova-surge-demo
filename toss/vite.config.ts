import { defineConfig } from 'vite'

// 입력 index.html 은 scripts/prepare.mjs 가 ../slice/index.html 에서 생성한다(직접 편집 금지).
export default defineConfig({
  base: './',
  build: { target: 'es2020', assetsInlineLimit: 0, outDir: 'dist', emptyOutDir: true, modulePreload: false },
  server: { host: '127.0.0.1', strictPort: true },
  preview: { host: '127.0.0.1', strictPort: true },
})
