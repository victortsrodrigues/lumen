import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useGetMe, getCsrfToken, logout, UserProfile } from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  checkSession: () => void;
  clearSession: () => void;
  getValidCsrfToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const WARNING_TIMEOUT = 25 * 60 * 1000; // 25 minutes

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: user, isLoading, refetch, error } = useGetMe({
    query: {
      retry: false,
      refetchOnWindowFocus: true,
    }
  });

  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const [warningShown, setWarningShown] = useState(false);

  const clearSession = useCallback(async () => {
    try {
      await logout();
    } catch (e) {
      // ignore
    }
    setLocation('/login');
  }, [setLocation]);

  const getValidCsrfToken = async () => {
    try {
      const response = await getCsrfToken();
      return response.csrfToken;
    } catch (error) {
      console.error("Failed to fetch CSRF token", error);
      throw new Error("Não foi possível obter o token de segurança.");
    }
  };

  // Activity tracking for timeout
  useEffect(() => {
    if (!user) return;

    const updateActivity = () => {
      setLastActivity(Date.now());
      if (warningShown) setWarningShown(false);
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => document.addEventListener(event, updateActivity));

    const interval = setInterval(() => {
      const now = Date.now();
      const inactiveTime = now - lastActivity;

      if (inactiveTime > INACTIVITY_TIMEOUT) {
        clearSession();
        toast({
          title: "Sessão expirada",
          description: "Você foi desconectado por inatividade.",
          variant: "destructive"
        });
      } else if (inactiveTime > WARNING_TIMEOUT && !warningShown) {
        setWarningShown(true);
        toast({
          title: "Aviso de Inatividade",
          description: "Sua sessão expirará em 5 minutos. Interaja com a página para continuar.",
        });
      }
    }, 10000);

    return () => {
      events.forEach(event => document.removeEventListener(event, updateActivity));
      clearInterval(interval);
    };
  }, [user, lastActivity, warningShown, clearSession, toast]);

  // Handle unauthenticated state from API
  useEffect(() => {
    if (error && (error as any)?.status === 401) {
      // Don't redirect immediately if they are on auth pages
      const isAuthPage = ['/login', '/register', '/forgot-password', '/reset-password', '/site', '/donate'].some(p => window.location.pathname.startsWith(p));
      if (!isAuthPage) {
        setLocation('/login');
      }
    }
  }, [error, setLocation]);

  const value = {
    user: user || null,
    isLoading,
    isAuthenticated: !!user,
    checkSession: refetch,
    clearSession,
    getValidCsrfToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
