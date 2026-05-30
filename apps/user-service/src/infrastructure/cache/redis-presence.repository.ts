import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';
import { PresenceRepository } from '../../application/ports/presence.repository';
import { PresenceStatus } from '@kafka-events';

@Injectable()
export class RedisPresenceRepository implements PresenceRepository, OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;
  private readonly PRESENCE_PREFIX = 'presence:';

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
    const status = await this.client.get(`${this.PRESENCE_PREFIX}${userId}`);
    return (status as PresenceStatus) || PresenceStatus.OFFLINE;
  }

  async getStatuses(userIds: string[]): Promise<Map<string, PresenceStatus>> {
    const result = new Map<string, PresenceStatus>();
    if (userIds.length === 0) return result;

    const keys = userIds.map(id => `${this.PRESENCE_PREFIX}${id}`);
    const statuses = await this.client.mGet(keys);

    userIds.forEach((id, index) => {
      result.set(id, (statuses[index] as PresenceStatus) || PresenceStatus.OFFLINE);
    });

    return result;
  }
}
