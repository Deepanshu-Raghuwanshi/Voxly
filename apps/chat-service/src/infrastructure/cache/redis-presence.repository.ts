import { Injectable } from "@nestjs/common";
import { PresenceRepository } from "../../application/ports/presence.repository";
import { PresenceStatus } from "@kafka-events";
import { presenceKey } from "@shared-utils/presence";
import { RedisService } from "./redis.service";

const SOCKET_LEASE_MS = 90_000;

// Keep the key's expiry equal to its latest live member's expiry. Readers
// can check the key's existence without loading or counting its members.
const UPDATE_SOCKET = `
  local key = KEYS[1]
  local socketId = ARGV[1]
  local leaseMs = tonumber(ARGV[2])
  local clock = redis.call('TIME')
  local now = clock[1] * 1000 + math.floor(clock[2] / 1000)
  redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
  local wasOnline = redis.call('EXISTS', key)

  if leaseMs == 0 then
    redis.call('ZREM', key, socketId)
  else
    redis.call('ZADD', key, now + leaseMs, socketId)
  end

  local latest = redis.call('ZREVRANGE', key, 0, 0, 'WITHSCORES')
  if #latest > 0 then
    redis.call('PEXPIREAT', key, latest[2])
    return 1 - wasOnline
  end

  return wasOnline
`;

@Injectable()
export class RedisPresenceRepository implements PresenceRepository {
  constructor(private readonly redisService: RedisService) {}

  touchSocket(userId: string, socketId: string): Promise<boolean> {
    return this.updateSocket(userId, socketId, SOCKET_LEASE_MS);
  }

  removeSocket(userId: string, socketId: string): Promise<boolean> {
    return this.updateSocket(userId, socketId, 0);
  }

  private async updateSocket(
    userId: string,
    socketId: string,
    leaseMs: number,
  ): Promise<boolean> {
    const client = this.redisService.client;
    if (!client.isReady)
      throw new Error("Presence Redis connection is unavailable");

    const changed = await client.eval(UPDATE_SOCKET, {
      keys: [presenceKey(userId)],
      arguments: [socketId, String(leaseMs)],
    });
    return changed === 1;
  }

  async getStatus(userId: string): Promise<PresenceStatus> {
    return (await this.redisService.client.exists(presenceKey(userId)))
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
