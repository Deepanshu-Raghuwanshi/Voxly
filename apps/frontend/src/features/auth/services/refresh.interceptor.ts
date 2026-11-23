import { isAxiosError } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import apiClient from '../../../shared/lib/apiClient';
import { authService } from './auth.service';
import { useAuthStore } from '../store/useAuthStore';

let installed = false;
let refreshing: Promise<unknown> | undefined;

export const setupInterceptors = () => {
  if (installed) return;
  installed = true;

  apiClient.interceptors.response.use(undefined, async (error: unknown) => {
    if (!isAxiosError(error) || error.response?.status !== 401) throw error;

    const request = error.config as (InternalAxiosRequestConfig & {
      sessionRetry?: boolean;
    }) | undefined;
    if (!request || request.signal?.aborted || request.url?.startsWith('/auth/')) {
      throw error;
    }

    const session = useAuthStore.getState();
    const clearExpiredSession = () => {
      const current = useAuthStore.getState();
      if (current.user?.id === session.user?.id) current.logout();
    };

    if (request.sessionRetry) {
      clearExpiredSession();
      throw error;
    }
    request.sessionRetry = true;
    refreshing ??= authService.refresh().finally(() => {
      refreshing = undefined;
    });

    try {
      await refreshing;
    } catch (refreshError) {
      if (!request.signal?.aborted && isAxiosError(refreshError) && refreshError.response?.status === 401) {
        clearExpiredSession();
      }
      throw refreshError;
    }

    return apiClient(request);
  });
};
