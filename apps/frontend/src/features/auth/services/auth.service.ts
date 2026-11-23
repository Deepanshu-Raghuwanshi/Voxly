import apiClient from '../../../shared/lib/apiClient';
import { UserProfile } from '@shared-types';

// Tabs share the API cookies, so serialize the requests that replace them.
async function withSessionLock<T>(request: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return await navigator.locks.request('voxly-auth-session', request);
  }
  return request();
}

export const authService = {
  async login(credentials: Record<string, string>): Promise<UserProfile> {
    const response = await withSessionLock(() =>
      apiClient.post<UserProfile>('/auth/login', credentials),
    );
    return response.data;
  },

  async register(data: Record<string, string>): Promise<UserProfile> {
    const response = await apiClient.post<UserProfile>('/auth/register', data);
    return response.data;
  },

  async logout() {
    const response = await withSessionLock(() => apiClient.post('/auth/logout'));
    return response.data;
  },

  async refresh() {
    const response = await withSessionLock(() => apiClient.post<UserProfile>('/auth/refresh', undefined, {
      timeout: 10_000,
    }));
    return response.data;
  },

  async verifyEmail(token: string) {
    const response = await apiClient.get(`/auth/verify-email?token=${token}`);
    return response.data;
  },

  async setPassword(data: Record<string, string>) {
    const response = await apiClient.post('/auth/set-password', data);
    return response.data;
  },

  async resendVerificationEmail(email: string) {
    const response = await apiClient.post('/auth/resend-verification', { email });
    return response.data;
  },

  async forgotPassword(email: string) {
    const response = await apiClient.post('/auth/forgot-password', { email });
    return response.data;
  },

  async resetPassword(data: Record<string, string>) {
    const response = await apiClient.post('/auth/reset-password', data);
    return response.data;
  },

  async getProfile(signal?: AbortSignal) {
    const response = await apiClient.get<UserProfile>('/profile', { signal, timeout: 10_000 });
    return response.data;
  },
};

export default apiClient;
