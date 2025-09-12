// src/config.ts
interface Config {
  API_BASE_URL: string;
  SOCKET_URL: string;
  NODE_ENV: string;
}

const config: Config = {
  API_BASE_URL: import.meta.env.VITE_API_URL || 
    (import.meta.env.VITE_NODE_ENV === 'production' 
      ? "https://digihub-new.onrender.com" 
      : "http://localhost:3001"),
  
  SOCKET_URL: import.meta.env.VITE_WS_URL || 
    (import.meta.env.VITE_NODE_ENV === 'production' 
      ? "wss://digihub-new.onrender.com" 
      : "ws://localhost:3001"),
      
  NODE_ENV: import.meta.env.VITE_NODE_ENV || 'development'
};

// Debug log for development
if (config.NODE_ENV === 'development') {
  console.log('🔧 Config loaded:', config);
}

export default config;
