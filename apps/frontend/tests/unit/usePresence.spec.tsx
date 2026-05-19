import React from "react";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import {
  QueryClient,
  QueryClientProvider,
  InfiniteData,
} from "@tanstack/react-query";
import {
  usePresence,
  emitTypingStart,
  emitTypingStop,
} from "../../src/features/friends/hooks/usePresence";
import { Message, MessageListResponse } from "@shared-types";
import { chatService } from "../../src/features/chat/services/chat.service";
import { useChatStore } from "../../src/features/chat/store/useChatStore";

// Capture socket event handlers as they are registered so tests can trigger them
const socketHandlers: Record<string, (data: unknown) => void> = {};

const mockSocket = {
  on: vi.fn((event: string, handler: (data: unknown) => void) => {
    socketHandlers[event] = handler;
  }),
  emit: vi.fn(),
};

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => mockSocket),
}));

vi.mock("../../src/features/chat/services/chat.service", () => ({
  chatService: {
    markRead: vi
      .fn()
      .mockResolvedValue({ lastReadAt: new Date().toISOString() }),
  },
}));

vi.mock("../../src/features/chat/store/useChatStore", () => {
  const getState = vi.fn(() => ({
    activeConversationId: null as string | null,
    draftMessages: {} as Record<string, string>,
    typingUsers: {} as Record<string, string[]>,
    setActiveConversation: vi.fn(),
    setDraft: vi.fn(),
    setTyping: vi.fn(),
  }));
  return { useChatStore: Object.assign(vi.fn(), { getState }) };
});

// Shared QueryClient — the hook's useEffect closure captures it on first mount.
// All tests set/read data on this same instance.
let sharedQueryClient: QueryClient;

function makeMessage(overrides: Partial<Message>): Message {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    senderId: "user-a",
    content: "Hello",
    type: "TEXT",
    status: "SENT",
    isDeleted: false,
    isAI: false,
    reactions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function seedCache(messages: Message[], conversationId = "conv-1") {
  const data: InfiniteData<MessageListResponse> = {
    pages: [{ data: messages, hasMore: false, nextCursor: undefined }],
    pageParams: [undefined],
  };
  sharedQueryClient.setQueryData(["messages", conversationId], data);
}

function getCache(conversationId = "conv-1") {
  return sharedQueryClient.getQueryData<InfiniteData<MessageListResponse>>([
    "messages",
    conversationId,
  ]);
}

// Mount the hook once so the module-level socket singleton is created and all
// socket.on handlers are registered. Subsequent tests reuse the same handlers.
beforeAll(() => {
  sharedQueryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={sharedQueryClient}>
      {children}
    </QueryClientProvider>
  );
  renderHook(() => usePresence(), { wrapper: Wrapper });
});

beforeEach(() => {
  vi.clearAllMocks();
  sharedQueryClient.clear();
  // Reset useChatStore.getState to default (no active conversation) so tests
  // that don't override it get a clean baseline.
  vi.mocked(useChatStore.getState).mockReturnValue({
    activeConversationId: null,
    draftMessages: {},
    replyTargets: {},
    highlightedMessageId: null,
    typingUsers: {},
    setActiveConversation: vi.fn(),
    setDraft: vi.fn(),
    setReplyTarget: vi.fn(),
    setHighlightedMessageId: vi.fn(),
    setTyping: vi.fn(),
    composerFocusTokens: {},
    requestComposerFocus: vi.fn(),
  });
  vi.mocked(chatService.markRead).mockResolvedValue({
    lastReadAt: new Date().toISOString(),
  });
});

describe("usePresence — message.delivered", () => {
  it("updates SENT messages from senderId to DELIVERED in the messages cache", () => {
    seedCache([makeMessage({ senderId: "user-a", status: "SENT" })]);

    act(() => {
      socketHandlers["message.delivered"]?.({
        conversationId: "conv-1",
        senderId: "user-a",
        recipientId: "user-b",
        deliveredAt: new Date().toISOString(),
      });
    });

    expect(getCache()?.pages[0].data[0].status).toBe("DELIVERED");
  });

  it("does not update messages that are already DELIVERED or READ", () => {
    seedCache([
      makeMessage({ id: "msg-1", senderId: "user-a", status: "DELIVERED" }),
      makeMessage({ id: "msg-2", senderId: "user-a", status: "READ" }),
    ]);

    act(() => {
      socketHandlers["message.delivered"]?.({
        conversationId: "conv-1",
        senderId: "user-a",
        recipientId: "user-b",
        deliveredAt: new Date().toISOString(),
      });
    });

    const updated = getCache();
    expect(updated?.pages[0].data[0].status).toBe("DELIVERED");
    expect(updated?.pages[0].data[1].status).toBe("READ");
  });
});

describe("usePresence — message.read", () => {
  it("updates both SENT and DELIVERED messages from senderId to READ in the messages cache", () => {
    seedCache([
      makeMessage({ id: "msg-1", senderId: "user-a", status: "SENT" }),
      makeMessage({ id: "msg-2", senderId: "user-a", status: "DELIVERED" }),
    ]);

    act(() => {
      socketHandlers["message.read"]?.({
        conversationId: "conv-1",
        senderId: "user-a",
        lastReadAt: new Date().toISOString(),
      });
    });

    const updated = getCache();
    expect(updated?.pages[0].data[0].status).toBe("READ");
    expect(updated?.pages[0].data[1].status).toBe("READ");
  });
});

describe("usePresence — message.new auto-read", () => {
  const newMessagePayload = {
    messageId: "msg-new",
    conversationId: "conv-1",
    senderId: "user-b",
    receiverId: "user-a",
    content: "Hi",
    type: "TEXT",
    sentAt: new Date().toISOString(),
  };

  it("calls chatService.markRead when the message arrives for the active conversation", () => {
    vi.mocked(useChatStore.getState).mockReturnValue({
      activeConversationId: "conv-1",
      draftMessages: {},
      replyTargets: {},
      highlightedMessageId: null,
      typingUsers: {},
      setActiveConversation: vi.fn(),
      setDraft: vi.fn(),
      setReplyTarget: vi.fn(),
      setHighlightedMessageId: vi.fn(),
      setTyping: vi.fn(),
      composerFocusTokens: {},
      requestComposerFocus: vi.fn(),
    });

    act(() => {
      socketHandlers["message.new"]?.(newMessagePayload);
    });

    expect(chatService.markRead).toHaveBeenCalledWith("conv-1");
  });

  it("does not call chatService.markRead when the message arrives for an inactive conversation", () => {
    vi.mocked(useChatStore.getState).mockReturnValue({
      activeConversationId: "conv-2",
      draftMessages: {},
      replyTargets: {},
      highlightedMessageId: null,
      typingUsers: {},
      setActiveConversation: vi.fn(),
      setDraft: vi.fn(),
      setReplyTarget: vi.fn(),
      setHighlightedMessageId: vi.fn(),
      setTyping: vi.fn(),
      composerFocusTokens: {},
      requestComposerFocus: vi.fn(),
    });

    act(() => {
      socketHandlers["message.new"]?.(newMessagePayload);
    });

    expect(chatService.markRead).not.toHaveBeenCalled();
  });
});

describe("usePresence — typing.started / typing.stopped", () => {
  it("calls setTyping(conversationId, userId, true) when typing.started arrives", () => {
    const setTypingMock = vi.fn();
    vi.mocked(useChatStore.getState).mockReturnValue({
      activeConversationId: null,
      draftMessages: {},
      replyTargets: {},
      highlightedMessageId: null,
      typingUsers: {},
      setActiveConversation: vi.fn(),
      setDraft: vi.fn(),
      setReplyTarget: vi.fn(),
      setHighlightedMessageId: vi.fn(),
      setTyping: setTypingMock,
      composerFocusTokens: {},
      requestComposerFocus: vi.fn(),
    });

    act(() => {
      socketHandlers["typing.started"]?.({
        conversationId: "conv-1",
        userId: "user-a",
      });
    });

    expect(setTypingMock).toHaveBeenCalledWith("conv-1", "user-a", true);
  });

  it("calls setTyping(conversationId, userId, false) when typing.stopped arrives", () => {
    const setTypingMock = vi.fn();
    vi.mocked(useChatStore.getState).mockReturnValue({
      activeConversationId: null,
      draftMessages: {},
      replyTargets: {},
      highlightedMessageId: null,
      typingUsers: {},
      setActiveConversation: vi.fn(),
      setDraft: vi.fn(),
      setReplyTarget: vi.fn(),
      setHighlightedMessageId: vi.fn(),
      setTyping: setTypingMock,
      composerFocusTokens: {},
      requestComposerFocus: vi.fn(),
    });

    act(() => {
      socketHandlers["typing.stopped"]?.({
        conversationId: "conv-1",
        userId: "user-a",
      });
    });

    expect(setTypingMock).toHaveBeenCalledWith("conv-1", "user-a", false);
  });
});

describe("usePresence — ai.message.new", () => {
  const makeAiPayload = (overrides: Record<string, unknown> = {}) => ({
    id: "ai-msg-1",
    conversationId: "conv-1",
    senderId: "user-a",
    content: "It's 24°C in Tokyo",
    type: "TEXT",
    status: "SENT",
    isDeleted: false,
    isEdited: false,
    isAI: true,
    toolUsed: "get_weather",
    reactions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  it("prepends AI message to the messages cache when cache exists", () => {
    seedCache([makeMessage({ id: "msg-1" })]);

    act(() => {
      socketHandlers["ai.message.new"]?.(makeAiPayload());
    });

    const cache = getCache();
    expect(cache?.pages[0].data[0].id).toBe("ai-msg-1");
    expect(cache?.pages[0].data[0].isAI).toBe(true);
    expect(cache?.pages[0].data[0].toolUsed).toBe("get_weather");
    expect(cache?.pages[0].data).toHaveLength(2);
  });

  it("does not insert a duplicate AI message if already present in cache", () => {
    seedCache([makeMessage({ id: "ai-msg-1", isAI: true })]);

    act(() => {
      socketHandlers["ai.message.new"]?.(makeAiPayload());
    });

    expect(getCache()?.pages[0].data).toHaveLength(1);
  });

  it("seeds a new first page when the messages cache is empty", () => {
    act(() => {
      socketHandlers["ai.message.new"]?.(makeAiPayload());
    });

    const cache = getCache();
    expect(cache?.pages[0].data[0].id).toBe("ai-msg-1");
    expect(cache?.pages[0].data[0].isAI).toBe(true);
  });

  it("maps null toolUsed to undefined on the cached Message", () => {
    act(() => {
      socketHandlers["ai.message.new"]?.(makeAiPayload({ toolUsed: null }));
    });

    expect(getCache()?.pages[0].data[0].toolUsed).toBeUndefined();
  });
});

describe("usePresence — emitTypingStart / emitTypingStop", () => {
  it("emitTypingStart emits typing.start with conversationId via the socket", () => {
    emitTypingStart("conv-1");
    expect(mockSocket.emit).toHaveBeenCalledWith("typing.start", {
      conversationId: "conv-1",
    });
  });

  it("emitTypingStop emits typing.stop with conversationId via the socket", () => {
    emitTypingStop("conv-1");
    expect(mockSocket.emit).toHaveBeenCalledWith("typing.stop", {
      conversationId: "conv-1",
    });
  });
});
