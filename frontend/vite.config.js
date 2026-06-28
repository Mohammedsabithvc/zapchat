import { defineConfig } from 'vite'
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true, secure: false },
      '/uploads': { target: 'http://localhost:3001', changeOrigin: true, secure: false },
      '/socket.io': { target: 'http://localhost:3001', changeOrigin: true, secure: false, ws: true }
    }
  }
})
