import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// Sürüm package.json'dan derleme anında gömülür (giriş ekranında gösterilir)
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// Backend hazır olduğunda: VITE_API_TARGET=http://localhost:8000 npm run dev
export default defineConfig({
  plugins: [react(), {
    // ikon adreslerine sürüm eklenir: yeni sürümde tarayıcı eski favicon'u önbellekten göstermez
    name: 'yaver-icon-version',
    transformIndexHtml: (html: string) => html.replace(/(href="\/(?:favicon\.svg|favicon\.ico|apple-touch-icon\.png|site\.webmanifest))"/g, `$1?v=${pkg.version}"`),
  }],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_API_TARGET ?? 'http://localhost:8000', changeOrigin: true },
    },
  },
})
