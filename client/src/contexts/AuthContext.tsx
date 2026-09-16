import React, { createContext, useContext, useState, useEffect } from 'react';
import type { AuthTeacher } from '../types';
import {
  getAuthToken,
  setAuthToken,
  loginTeacher,
  registerTeacher,
  getMe,
} from '../services/api';

interface AuthContextType {
  teacher: AuthTeacher | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  register: (data: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [teacher, setTeacher] = useState<AuthTeacher | null>(null);
  const [token, setTokenState] = useState<string | null>(getAuthToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function initAuth() {
      const savedToken = getAuthToken();
      if (!savedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const { teacher: currentTeacher } = await getMe();
        setTeacher(currentTeacher);
        setTokenState(savedToken);
      } catch (err) {
        console.warn('Sessão expirada ou inválida:', err);
        setAuthToken(null);
        setTeacher(null);
        setTokenState(null);
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();
  }, []);

  const login = async (credentials: { email: string; password: string }) => {
    const res = await loginTeacher(credentials);
    setTeacher(res.teacher);
    setTokenState(res.token);
  };

  const register = async (data: { name: string; email: string; password: string }) => {
    const res = await registerTeacher(data);
    setTeacher(res.teacher);
    setTokenState(res.token);
  };

  const logout = () => {
    setAuthToken(null);
    setTeacher(null);
    setTokenState(null);
  };

  return (
    <AuthContext.Provider
      value={{
        teacher,
        token,
        isAuthenticated: !!teacher,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
}
