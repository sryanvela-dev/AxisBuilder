import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }
import { markupEnabledFor, reportEnabledFor } from './src/featureFlags.ts'

// pdf.js decodes scanned PDF layers (CCITT fax and JBIG2 masks), JPEG 2000 pictures and ICC colors with these WebAssembly
// files, fetched from `wasmUrl` by their own names (ui/report/pdfPages.ts). Served as they are in dev, copied unhashed into
// the build (and precached) under /pdfjs-wasm/. Without them pdf.js leaves those layers out: a scanned form shows its table
// lines but none of its text.
const PDFJS_WASM_FILES = ['jbig2.wasm', 'openjpeg.wasm', 'qcms_bg.wasm']

function pdfjsWasm(): Plugin {
  const source = (name: string) => readFileSync(new URL(`./node_modules/pdfjs-dist/wasm/${name}`, import.meta.url))
  return {
    name: 'axisbuilder-pdfjs-wasm',
    configureServer(server) {
      server.middlewares.use('/pdfjs-wasm/', (req, res, next) => {
        const name = (req.url ?? '').replace(/^\//, '').split('?')[0]
        if (!PDFJS_WASM_FILES.includes(name)) return next()
        res.setHeader('Content-Type', 'application/wasm')
        res.end(source(name))
      })
    },
    generateBundle() {
      for (const name of PDFJS_WASM_FILES) this.emitFile({ type: 'asset', fileName: `pdfjs-wasm/${name}`, source: source(name) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  define: {
    // App version for error reports (ui/errorDetails.ts).
    __APP_VERSION__: JSON.stringify(pkg.version),
    // The AUT report (src/featureFlags.ts): on in dev, tests and Pages previews; off in the production build of main.
    __REPORT_ENABLED__: JSON.stringify(
      reportEnabledFor({ command, test: process.env.VITEST !== undefined, pagesBranch: process.env.CF_PAGES_BRANCH, override: process.env.VITE_REPORT }),
    ),
    // The report pictures' markup editor (R5): the same rule; VITE_MARKUP overrides it.
    __MARKUP_ENABLED__: JSON.stringify(
      markupEnabledFor({ command, test: process.env.VITEST !== undefined, pagesBranch: process.env.CF_PAGES_BRANCH, override: process.env.VITE_MARKUP }),
    ),
  },
  // The PDF writer (pdf-lib + fontkit, about 1.1 MB) is its own chunk, loaded only when a PDF is made.
  build: { chunkSizeWarningLimit: 1200 },
  plugins: [
    react(),
    pdfjsWasm(),
    VitePWA({
      // New versions install and take over as soon as they are downloaded.
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'AxisBuilder',
        short_name: 'AxisBuilder',
        description: 'AUT scan coverage drawings for pressure vessels and tanks',
        theme_color: '#1d2733',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the whole build so the app runs offline after the first visit.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,jpg,ico,webmanifest,ttf,wasm}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
}))
