import { Inject, Injectable } from "@nestjs/common";
import { PresenceStatus } from "@kafka-events";
import { FriendshipRepository } from "../ports/friendship.repository";
import { PresenceRepository } from "../ports/presence.repository";

@Injectable()
export class GetFriendsPresenceUseCase {
  constructor(
    @Inject("FriendshipRepository")
    private readonly friendshipRepository: FriendshipRepository,
    @Inject("PresenceRepository")
    private readonly presenceRepository: PresenceRepository,
  ) {}

  async execute(userId: string, requestedIds: string[]) {
    const friendships = await this.friendshipRepository.findByUserId(
      userId,
      requestedIds,
    );
    const friendIds = friendships.map(({ userId1, userId2 }) =>
      userId === userId1 ? userId2 : userId1,
    );
    const statuses = await this.presenceRepository.getStatuses(friendIds);

    return friendIds.map((id) => ({
      id,
      isOnline: statuses.get(id) === PresenceStatus.ONLINE,
    }));
  }
}
