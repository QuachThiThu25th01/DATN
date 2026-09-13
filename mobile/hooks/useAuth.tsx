import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import apiClient from '@/constants/api';

interface User {
  id: number;
  username: string;
  role: string;
  name?: string;
  code?: string;
  email?: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await apiClient.post('/login', { username, password });
      if (response.data.status === 'ok') {
        setUser(response.data.user);
      } else {
        throw new Error(response.data.error || 'Đăng nhập thất bại');
      }
    } catch (err: any) {
      const serverMsg = err.response?.data?.error || err.response?.data?.message || err.message;
      throw new Error(serverMsg || 'Sai tên đăng nhập hoặc mật khẩu!');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await apiClient.get('/logout');
    } catch (e) {
      console.error('Logout error:', e);
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    console.warn('useAuth must be used within an AuthProvider (bypassed for Fast Refresh)');
    return { user: null, login: async () => {}, logout: () => {}, isLoading: false };
  }
  return context;
}
