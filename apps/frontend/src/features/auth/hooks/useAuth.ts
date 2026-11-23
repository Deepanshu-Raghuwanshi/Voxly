import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authService } from '../services/auth.service';
import { profileService } from '../../profile/services/profile.service';
import { useAuthStore } from '../store/useAuthStore';
import { UserProfile } from '@shared-types';
import { useRouter } from 'next/navigation';
import { getLoginDestination } from '../utils/session-routes';

export const useLogin = () => {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);
  const router = useRouter();

  return useMutation({
    mutationFn: (credentials: Record<string, string>) => authService.login(credentials),
    onSuccess: (userData: UserProfile) => {
      setUser(userData);
      // Navigate immediately, then pre-fetch the full profile in the background
      // so the auth store has username/fullName before the user visits /profile
      router.replace(getLoginDestination(window.location.search));
      profileService.getProfile().then((fullProfile) => {
        if (useAuthStore.getState().user?.id !== fullProfile.id) return;
        setUser(fullProfile);
        queryClient.setQueryData(['profile', fullProfile.id], fullProfile);
      }).catch(() => { /* profile page will re-fetch on demand */ });
    },
  });
};

export const useSignup = () => {
  return useMutation({
    mutationFn: (data: Record<string, string>) => authService.register(data),
  });
};

export const useLogout = () => {
  const logoutStore = useAuthStore((state) => state.logout);
  const router = useRouter();

  return useMutation({
    mutationFn: () => authService.logout(),
    onSuccess: () => {
      logoutStore();
      router.replace('/login');
    },
  });
};

export const useRefresh = () => {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);
  const router = useRouter();

  return useMutation({
    mutationFn: () => authService.refresh(),
    onSuccess: (userData: UserProfile) => {
      setUser(userData);
      router.push('/friends');
      profileService.getProfile().then((fullProfile) => {
        if (useAuthStore.getState().user?.id !== fullProfile.id) return;
        setUser(fullProfile);
        queryClient.setQueryData(['profile', fullProfile.id], fullProfile);
      }).catch(() => { /* profile page will re-fetch on demand */ });
    },
    onError: () => {
      router.push('/login');
    },
  });
};

export const useSetPassword = () => {
  return useMutation({
    mutationFn: (data: Record<string, string>) => authService.setPassword(data),
  });
};

export const useResendVerification = () => {
  return useMutation({
    mutationFn: (email: string) => authService.resendVerificationEmail(email),
  });
};

export const useForgotPassword = () => {
  return useMutation({
    mutationFn: (email: string) => authService.forgotPassword(email),
  });
};

export const useResetPassword = () => {
  return useMutation({
    mutationFn: (data: Record<string, string>) => authService.resetPassword(data),
  });
};
