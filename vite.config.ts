/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // vanilla/tests usa node:test (npm run test:vanilla), não o Vitest.
    exclude: [...configDefaults.exclude, 'vanilla/**'],
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'MarketingWebSamLanguageSwitcher',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
    cssCodeSplit: false,
    sourcemap: true,
  },
})
