import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { authService } from '../services/auth.service';
import { useAuthStore } from '../store/useAuthStore';
import { UserProfile } from '@shared-types';

export const useProfile = (options: Partial<UseQueryOptions<UserProfile>> = {}) => {
  const setUser = useAuthStore((state) => state.setUser);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: ['profile'],
    queryFn: ({ signal }) => authService.getProfile(signal),
    enabled: isAuthenticated,
    meta: {
      onSuccess: (data: UserProfile) => {
        setUser(data);
      },
    },
    ...options,
  } as UseQueryOptions<UserProfile>);
};
