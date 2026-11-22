import { Friendship } from '@prisma/client-user';

export interface FriendshipRepository {
  create(userId1: string, userId2: string): Promise<Friendship>;

  findByUsers(userId1: string, userId2: string): Promise<Friendship | null>;

  findByUserId(userId: string, otherUserIds?: string[]): Promise<Friendship[]>;

  delete(id: string): Promise<void>;

  deleteByUsers(userId1: string, userId2: string): Promise<void>;
}
