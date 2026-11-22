import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';
import { PresenceRepository } from '../../application/ports/presence.repository';
import { PresenceStatus } from '@kafka-events';
import { presenceKey } from '@shared-utils/presence';

@Injectable()
export class RedisPresenceRepository implements PresenceRepository, OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;

  constructor(private configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    const url = redisUrl ?? (() => {
      const host = this.configService.get<string>('REDIS_HOST');
      const port = this.configService.get<number>('REDIS_PORT');
      const password = this.configService.get<string>('REDIS_PASSWORD');
      return password
        ? `redis://:${password}@${host}:${port}`
        : `redis://${host}:${port}`;
    })();
    this.client = createClient({ url });
  }

  async onModuleInit() {
    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.disconnect();
  }

  async getStatus(userId: string): Promise<PresenceStatus> {
    return (await this.client.exists(presenceKey(userId)))
      ? PresenceStatus.ONLINE
      : PresenceStatus.OFFLINE;
  }

  async getStatuses(userIds: string[]): Promise<Map<string, PresenceStatus>> {
    return new Map(
      await Promise.all(
        userIds.map(async (id) => [id, await this.getStatus(id)] as const),
      ),
    );
  }
}
