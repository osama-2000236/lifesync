import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // The voice-assistant surface is the QA contract — gated at 100% per file.
      include: [
        'src/hooks/useDictation.js',
        'src/components/assistant/**/*.jsx',
        'src/pages/AssistantPage.jsx',
      ],
      exclude: ['**/*.test.{js,jsx}'],
      thresholds: { perFile: true, statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
})
