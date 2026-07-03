import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base must match the repo name for GitHub Pages project sites
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/personal-fin/',
})
