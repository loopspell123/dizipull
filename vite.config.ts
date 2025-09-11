import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc' // Use SWC instead of Babel

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    minify: 'esbuild'
  },
  server: {
    port: 5173,
    host: true
  }
})