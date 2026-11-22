import { Injectable } from '@nestjs/common';
import { Friendship } from '@prisma/client-user';
import { FriendshipRepository } from '../../application/ports/friendship.repository';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaFriendshipRepository implements FriendshipRepository {
  constructor(private readonly prisma: PrismaService) {}

  private getOrderedUserIds(id1: string, id2: string) {
    return id1 < id2 ? [id1, id2] : [id2, id1];
  }

  async create(userId1: string, userId2: string): Promise<Friendship> {
    const [u1, u2] = this.getOrderedUserIds(userId1, userId2);
    return this.prisma.friendship.create({
      data: {
        userId1: u1,
        userId2: u2,
      },
    });
  }

  async findByUsers(userId1: string, userId2: string): Promise<Friendship | null> {
    const [u1, u2] = this.getOrderedUserIds(userId1, userId2);
    return this.prisma.friendship.findUnique({
      where: {
        userId1_userId2: {
          userId1: u1,
          userId2: u2,
        },
      },
    });
  }

  async findByUserId(userId: string, otherUserIds?: string[]): Promise<Friendship[]> {
    const otherUsers = otherUserIds && { in: otherUserIds };
    return this.prisma.friendship.findMany({
      where: {
        OR: [
          { userId1: userId, userId2: otherUsers },
          { userId1: otherUsers, userId2: userId },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.friendship.delete({
      where: { id },
    });
  }

  async deleteByUsers(userId1: string, userId2: string): Promise<void> {
    const [u1, u2] = this.getOrderedUserIds(userId1, userId2);
    await this.prisma.friendship.delete({
      where: {
        userId1_userId2: {
          userId1: u1,
          userId2: u2,
        },
      },
    });
  }
}
