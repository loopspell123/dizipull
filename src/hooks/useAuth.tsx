import { useState, useEffect } from 'react';
import axios from 'axios';
import config from '../config';

interface User {
  id: string;
  username: string;
  email: string;
}

interface UseAuthReturn {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
  error: string | null;
}

export const useAuth = (): UseAuthReturn => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(
    localStorage.getItem('whatsapp_auth_token')
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async (username: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.post(`${config.API_BASE_URL}/api/auth/login`, {
        username,
        password
      });

      const { token: newToken, user: userData } = response.data;
      
      localStorage.setItem('whatsapp_auth_token', newToken);
      setToken(newToken);
      setUser(userData);
      
      return true;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('whatsapp_auth_token');
    setToken(null);
    setUser(null);
  };

  useEffect(() => {
    if (token) {
      // Verify token on app load
      axios.get(`${config.API_BASE_URL}/api/auth/verify`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(response => {
        setUser(response.data.user);
      })
      .catch(() => {
        logout();
      });
    }
  }, [token]);

  return { user, token, login, logout, isLoading, error };
};