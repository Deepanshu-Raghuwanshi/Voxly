import { create } from 'zustand';
import { UserProfile } from '@shared-types';

interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  hasCheckedSession: boolean;
  setUser: (user: UserProfile | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  hasCheckedSession: false,
  setUser: (user) => set({ user, isAuthenticated: !!user, hasCheckedSession: true }),
  logout: () => set({ user: null, isAuthenticated: false, hasCheckedSession: true }),
}));
