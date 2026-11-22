import apiClient from '../../../shared/lib/apiClient';
import type { UserTypes } from '@shared-types';

export interface UserProfile {
  id: string;
  username: string;
  fullName?: string;
  avatarUrl?: string;
  bio?: string;
  isOnline?: boolean;
}

export type RelationshipStatus =
  | 'friend'
  | 'pending_incoming'
  | 'pending_outgoing'
  | 'none';

export interface UserSearchResult extends UserProfile {
  relationshipStatus: RelationshipStatus;
}

export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  createdAt: string;
  updatedAt: string;
  sender?: UserProfile;
  receiver?: UserProfile;
}

export interface Friendship {
  id: string;
  userId1: string;
  userId2: string;
  createdAt: string;
}

export const friendsService = {
  async getFriends(): Promise<UserProfile[]> {
    const response = await apiClient.get<UserProfile[]>('/friends');
    return response.data;
  },

  async getPresence(userIds: string[], signal: AbortSignal) {
    const response = await apiClient.get<
      UserTypes.components['schemas']['FriendPresence'][]
    >('/friends/presence', {
      params: { ids: userIds.join(',') },
      signal,
    });
    return response.data;
  },

  async sendFriendRequest(receiverId: string): Promise<FriendRequest> {
    const response = await apiClient.post<FriendRequest>('/friends/requests', {
      receiverId,
    });
    return response.data;
  },

  async getIncomingRequests(): Promise<FriendRequest[]> {
    const response = await apiClient.get<FriendRequest[]>('/friends/requests/incoming');
    return response.data;
  },

  async getRecommendations(): Promise<UserProfile[]> {
    const response = await apiClient.get<UserProfile[]>('/friends/recommendations');
    return response.data;
  },

  async removeFriend(friendId: string): Promise<void> {
    await apiClient.delete(`/friends/${friendId}`);
  },

  async searchUsers(query: string): Promise<UserSearchResult[]> {
    const response = await apiClient.get<UserSearchResult[]>('/friends/search', {
      params: { q: query },
    });
    return response.data;
  },

  async respondToRequest(requestId: string, action: 'ACCEPT' | 'REJECT'): Promise<FriendRequest | Friendship> {
    const response = await apiClient.post<FriendRequest | Friendship>(`/friends/requests/${requestId}/respond`, {
      action,
    });
    return response.data;
  },
};
