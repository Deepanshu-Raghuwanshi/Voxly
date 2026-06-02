import apiClient from '../../../shared/lib/apiClient';
import { UserProfile } from '@shared-types';

export const authService = {
  async login(credentials: Record<string, string>): Promise<UserProfile> {
    const response = await apiClient.post<UserProfile>('/auth/login', credentials);
    return response.data;
  },

  async register(data: Record<string, string>): Promise<UserProfile> {
    const response = await apiClient.post<UserProfile>('/auth/register', data);
    return response.data;
  },

  async logout() {
    const response = await apiClient.post('/auth/logout');
    return response.data;
  },

  async refresh() {
    const response = await apiClient.post('/auth/refresh');
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

  async getProfile() {
    const response = await apiClient.get('/profile');
    return response.data;
  },
};

export default apiClient;
