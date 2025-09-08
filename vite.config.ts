import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:3001',
          changeOrigin: true,
          secure: true,
          ws: true,
        }
      }
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            socket: ['socket.io-client'],
            router: ['react-router-dom'],
            icons: ['lucide-react']
          }
        }
      }
    },
    define: {
      __DEV__: mode === 'development'
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'socket.io-client']
    }
  }
});