import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('blockly')) return 'vendor-blockly'
          if (id.includes('react') || id.includes('scheduler')) return 'vendor-react'
          if (id.includes('axios')) return 'vendor-http'
          return undefined
        },
      },
    },
  },
})
