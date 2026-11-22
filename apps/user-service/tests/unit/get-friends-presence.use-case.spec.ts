import { expect } from "chai";
import * as sinon from "sinon";
import { PresenceStatus } from "@kafka-events";
import { FriendshipRepository } from "../../src/application/ports/friendship.repository";
import { PresenceRepository } from "../../src/application/ports/presence.repository";
import { GetFriendsPresenceUseCase } from "../../src/application/use-cases/get-friends-presence.use-case";

describe("GetFriendsPresenceUseCase", () => {
  it("looks up presence only for requested friendships in either direction", async () => {
    const findByUserId = sinon.stub().resolves([
      { userId1: "viewer", userId2: "online-friend" },
      { userId1: "offline-friend", userId2: "viewer" },
    ]);
    const getStatuses = sinon.stub().resolves(
      new Map([
        ["online-friend", PresenceStatus.ONLINE],
        ["offline-friend", PresenceStatus.OFFLINE],
      ]),
    );
    const useCase = new GetFriendsPresenceUseCase(
      { findByUserId } as unknown as FriendshipRepository,
      { getStatuses } as unknown as PresenceRepository,
    );

    const requestedIds = ["online-friend", "offline-friend", "unrelated-user"];
    const statuses = await useCase.execute("viewer", requestedIds);

    sinon.assert.calledOnceWithExactly(findByUserId, "viewer", requestedIds);
    sinon.assert.calledOnceWithExactly(getStatuses, [
      "online-friend",
      "offline-friend",
    ]);
    expect(statuses).to.deep.equal([
      { id: "online-friend", isOnline: true },
      { id: "offline-friend", isOnline: false },
    ]);
  });
});
