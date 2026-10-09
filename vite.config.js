import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => {
  // Reads .env.local too. Used below for the optional VITE_API_PROXY setting.
  const env = loadEnv(mode, '.', 'VITE_')

  return {
    plugins: [tailwindcss(), react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      // `npm run dev` only serves the React app. The functions in api/ (the
      // ImageKit upload signer) run on Vercel, so without this the browser asks
      // localhost for /api/auth, gets index.html back, and every media upload
      // fails with "Unexpected token <". In development we forward /api to the
      // deployed app instead. Set VITE_API_PROXY to point at a preview URL, or
      // use `vercel dev` and this proxy is simply never reached.
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY || 'https://quizlike.vercel.app',
          changeOrigin: true,
          secure: true,
        },
      },
    },
  }
})
