import { create } from 'zustand';
import type { User } from '@/types';
import { authService } from '@/services/auth.service';

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email: string, password: string) => {
    const response = await authService.login({ email, password });
    localStorage.setItem('binny_token', response.accessToken);
    localStorage.setItem('binny_user', JSON.stringify(response.user));
    set({
      user: response.user,
      token: response.accessToken,
      isAuthenticated: true,
    });
  },

  logout: async () => {
    try {
      await authService.logout();
    } catch {
      // Proceed with local cleanup even if API call fails
    } finally {
      localStorage.removeItem('binny_token');
      localStorage.removeItem('binny_user');
      set({
        user: null,
        token: null,
        isAuthenticated: false,
      });
      window.location.href = '/login';
    }
  },

  checkAuth: async () => {
    try {
      const token = localStorage.getItem('binny_token');
      const userStr = localStorage.getItem('binny_user');

      if (!token || !userStr) {
        set({ isLoading: false, isAuthenticated: false });
        return;
      }

      set({ token, isLoading: true });

      const user = await authService.getProfile();
      localStorage.setItem('binny_user', JSON.stringify(user));
      set({
        user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      localStorage.removeItem('binny_token');
      localStorage.removeItem('binny_user');
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  setUser: (user: User) => {
    localStorage.setItem('binny_user', JSON.stringify(user));
    set({ user });
  },
}));
