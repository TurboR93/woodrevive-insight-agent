import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  build: {
    // jsPDF entra solo nel chunk dei documenti (import dinamico in documents/*)
    chunkSizeWarningLimit: 800,
  },
})
