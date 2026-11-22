import { expect } from "chai";
import * as sinon from "sinon";
import { JwtService } from "@nestjs/jwt";
import { ClientKafka } from "@nestjs/microservices";
import { Socket, Namespace } from "socket.io";
import { PresenceGateway } from "../../src/interfaces/gateways/presence.gateway";
import { PresenceRepository } from "../../src/application/ports/presence.repository";

function makeGateway(): PresenceGateway {
  const presenceRepoMock = {
    touchSocket: sinon.stub().resolves(false),
    removeSocket: sinon.stub().resolves(false),
  };
  const kafkaClientMock = { emit: sinon.stub() };
  const jwtServiceMock = { verify: sinon.stub() };
  return new PresenceGateway(
    presenceRepoMock as unknown as PresenceRepository,
    kafkaClientMock as unknown as ClientKafka,
    jwtServiceMock as unknown as JwtService,
  );
}

function makeClient(userId: string | null) {
  const emitStub = sinon.stub();
  const toStub = sinon.stub().returns({ emit: emitStub });
  const client = {
    handshake: {
      auth: {},
      // When userId is null, query has no userId key → directUserId is undefined (falsy)
      // → getUserId continues past the dev bypass and returns null (no token present).
      query: userId ? { userId } : {},
      headers: {},
    },
    to: toStub,
  };
  return { client, toStub, emitStub };
}

describe("PresenceGateway — typing handlers (Unit)", () => {
  let gateway: PresenceGateway;
  beforeEach(() => {
    gateway = makeGateway();
    // directUserId override in getUserId is active for any non-production env
    sinon.stub(process, "env").value({ ...process.env, NODE_ENV: "test" });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("handleTypingStart", () => {
    it("should broadcast typing.started to the conversation room, excluding the sender", () => {
      const { client, toStub, emitStub } = makeClient("user-a");

      gateway.handleTypingStart(client as unknown as Socket, {
        conversationId: "conv-1",
      });

      expect(toStub.calledOnceWith("conversation:conv-1")).to.equal(true);
      expect(
        emitStub.calledOnceWith("typing.started", {
          conversationId: "conv-1",
          userId: "user-a",
        }),
      ).to.equal(true);
    });

    it("should return early and not emit when getUserId returns null", () => {
      const { client, toStub } = makeClient(null);

      gateway.handleTypingStart(client as unknown as Socket, {
        conversationId: "conv-1",
      });

      expect(toStub.called).to.equal(false);
    });

    it("should return early and not emit when conversationId is an empty string", () => {
      const { client, toStub } = makeClient("user-a");

      gateway.handleTypingStart(client as unknown as Socket, {
        conversationId: "",
      });

      expect(toStub.called).to.equal(false);
    });

    it("should return early and not emit when conversationId is undefined", () => {
      const { client, toStub } = makeClient("user-a");

      gateway.handleTypingStart(client as unknown as Socket, {
        conversationId: undefined as unknown as string,
      });

      expect(toStub.called).to.equal(false);
    });

    it("should return early and not emit when data is null", () => {
      const { client, toStub } = makeClient("user-a");

      gateway.handleTypingStart(
        client as unknown as Socket,
        null as unknown as { conversationId: string },
      );

      expect(toStub.called).to.equal(false);
    });

    it("should NOT call this.server.to() — broadcast must exclude the sender via client.to()", () => {
      const { client } = makeClient("user-a");
      const serverToSpy = sinon.spy();
      gateway.server = { to: serverToSpy } as unknown as Namespace;

      gateway.handleTypingStart(client as unknown as Socket, {
        conversationId: "conv-1",
      });

      expect(serverToSpy.called).to.equal(false);
    });
  });

  describe("handleTypingStop", () => {
    it("should broadcast typing.stopped to the conversation room, excluding the sender", () => {
      const { client, toStub, emitStub } = makeClient("user-a");

      gateway.handleTypingStop(client as unknown as Socket, {
        conversationId: "conv-1",
      });

      expect(toStub.calledOnceWith("conversation:conv-1")).to.equal(true);
      expect(
        emitStub.calledOnceWith("typing.stopped", {
          conversationId: "conv-1",
          userId: "user-a",
        }),
      ).to.equal(true);
    });

    it("should return early and not emit when getUserId returns null", () => {
      const { client, toStub } = makeClient(null);

      gateway.handleTypingStop(client as unknown as Socket, {
        conversationId: "conv-1",
      });

      expect(toStub.called).to.equal(false);
    });

    it("should return early and not emit when conversationId is an empty string", () => {
      const { client, toStub } = makeClient("user-a");

      gateway.handleTypingStop(client as unknown as Socket, {
        conversationId: "",
      });

      expect(toStub.called).to.equal(false);
    });

    it("should return early and not emit when conversationId is undefined", () => {
      const { client, toStub } = makeClient("user-a");

      gateway.handleTypingStop(client as unknown as Socket, {
        conversationId: undefined as unknown as string,
      });

      expect(toStub.called).to.equal(false);
    });

    it("should return early and not emit when data is null", () => {
      const { client, toStub } = makeClient("user-a");

      gateway.handleTypingStop(
        client as unknown as Socket,
        null as unknown as { conversationId: string },
      );

      expect(toStub.called).to.equal(false);
    });

    it("should NOT call this.server.to() — broadcast must exclude the sender via client.to()", () => {
      const { client } = makeClient("user-a");
      const serverToSpy = sinon.spy();
      gateway.server = { to: serverToSpy } as unknown as Namespace;

      gateway.handleTypingStop(client as unknown as Socket, {
        conversationId: "conv-1",
      });

      expect(serverToSpy.called).to.equal(false);
    });
  });
});
