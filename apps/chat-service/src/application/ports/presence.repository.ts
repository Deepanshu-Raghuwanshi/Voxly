import { PresenceStatus } from "@kafka-events";

export interface PresenceRepository {
  touchSocket(userId: string, socketId: string): Promise<boolean>;
  removeSocket(userId: string, socketId: string): Promise<boolean>;
  getStatus(userId: string): Promise<PresenceStatus>;
  getStatuses(userIds: string[]): Promise<Map<string, PresenceStatus>>;
}
