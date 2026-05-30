import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, RedisClientType } from "redis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  readonly client: RedisClientType;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>("REDIS_URL");
    const url = redisUrl ?? (() => {
      const host = this.configService.get<string>("REDIS_HOST");
      const port = this.configService.get<number>("REDIS_PORT");
      const password = this.configService.get<string>("REDIS_PASSWORD");
      return password
        ? `redis://:${password}@${host}:${port}`
        : `redis://${host}:${port}`;
    })();
    this.client = createClient({ url }) as RedisClientType;
  }

  async onModuleInit() {
    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.disconnect();
  }
}
