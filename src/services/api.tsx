import axios from 'axios';
import config from '../config';

console.log('🔧 API Service initialized with:', config.API_BASE_URL);

const api = axios.create({
  baseURL: config.API_BASE_URL,
  timeout: 30000, // 30 second timeout
  withCredentials: true, // Important for CORS
  headers: {
    'Content-Type': 'application/json',
  }
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('whatsapp_auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  console.log('📤 API Request:', {
    method: config.method?.toUpperCase(),
    url: `${config.baseURL}${config.url}`,
    hasAuth: !!token
  });
  
  return config;
}, (error) => {
  console.error('❌ API Request Error:', error);
  return Promise.reject(error);
});

// Handle responses and errors
api.interceptors.response.use(
  (response) => {
    console.log('📥 API Response:', {
      status: response.status,
      url: response.config.url,
      success: response.data?.success
    });
    return response;
  },
  (error) => {
    console.error('❌ API Response Error:', {
      status: error.response?.status,
      message: error.message,
      url: error.config?.url,
      baseURL: error.config?.baseURL
    });

    // Handle specific errors
    if (error.response?.status === 401) {
      console.log('🔒 Unauthorized - clearing auth data');
      localStorage.removeItem('whatsapp_auth_token');
      localStorage.removeItem('whatsapp_user');
      window.location.href = '/';
    } else if (error.code === 'NETWORK_ERROR' || error.message.includes('Network Error')) {
      console.error('🌐 Network Error - Check if server is running');
      console.error('   API URL:', config.API_BASE_URL);
    } else if (error.response?.status === 403) {
      console.error('🔒 CORS or Forbidden Error');
      console.error('   Origin:', window.location.origin);
      console.error('   API URL:', config.API_BASE_URL);
    }
    
    return Promise.reject(error);
  }
);

export default api;