import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../frontend',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/auth': 'http://127.0.0.1:8000',
      '/items': 'http://127.0.0.1:8000',
      '/projects': 'http://127.0.0.1:8000',
      '/categories': 'http://127.0.0.1:8000',
      '/templates': 'http://127.0.0.1:8000',
      '/security': 'http://127.0.0.1:8000',
      '/clipboard': 'http://127.0.0.1:8000',
      '/import': 'http://127.0.0.1:8000',
      '/backup': 'http://127.0.0.1:8000',
      '/drive': 'http://127.0.0.1:8000',
      '/api': 'http://127.0.0.1:8000',
    }
  }
})
