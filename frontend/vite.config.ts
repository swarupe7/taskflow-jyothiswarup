import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite dev server — only proxy paths starting with /api to the Go backend.
// All other paths (e.g. /projects, /login) are handled by React Router.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      // Single rule: anything under /api/* → Go backend
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3000,
    host: true,
  },
})
