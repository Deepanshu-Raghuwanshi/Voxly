import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  QueryClient,
  QueryClientProvider,
  InfiniteData,
} from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../messages/en.json";
import { chatService } from "../../src/features/chat/services/chat.service";
import {
  useConversations,
  useSendMessage,
  useMarkRead,
  useSearchConversations,
  useToggleReaction,
  useRewriteMessage,
  useSmartReplies,
  useSummarizeConversation,
  useAiAgent,
} from "../../src/features/chat/hooks/useChat";
import { showToast } from "../../src/shared/utils/toast";
import {
  Conversation,
  ConversationListResponse,
  Message,
  MessageListResponse,
} from "@shared-types";
import { useChatStore } from "../../src/features/chat/store/useChatStore";

vi.mock("../../src/features/chat/services/chat.service", () => ({
  chatService: {
    listConversations: vi.fn(),
    createOrGetConversation: vi.fn(),
    getConversation: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
    editMessage: vi.fn(),
    deleteMessage: vi.fn(),
    markRead: vi.fn(),
    searchConversations: vi.fn(),
    toggleReaction: vi.fn(),
    rewriteMessage: vi.fn(),
    getSmartReplies: vi.fn(),
    summarizeConversation: vi.fn(),
    triggerAiAgent: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: vi.fn(),
}));

vi.mock("../../src/shared/utils/toast", () => ({
  showToast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("../../src/features/auth/store/useAuthStore", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useAuthStore: vi.fn((selector: any) => selector({ user: { id: "user-1" } })),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  })),
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  );
  return { queryClient, Wrapper };
}

const mockConversation: Conversation = {
  id: "conv-1",
  participants: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockMessage: Message = {
  id: "msg-1",
  conversationId: "conv-1",
  senderId: "user-2",
  content: "Hello",
  type: "TEXT",
  status: "SENT",
  isDeleted: false,
  isAI: false,
  reactions: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const emptyMessagesCache: InfiniteData<MessageListResponse> = {
  pages: [{ data: [], hasMore: false, nextCursor: undefined }],
  pageParams: [undefined],
};

const populatedMessagesCache: InfiniteData<MessageListResponse> = {
  pages: [{ data: [mockMessage], hasMore: false, nextCursor: undefined }],
  pageParams: [undefined],
};

describe("useConversations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns paginated list and exposes fetchNextPage", async () => {
    vi.mocked(chatService.listConversations).mockResolvedValue({
      data: [mockConversation],
      hasMore: true,
      nextCursor: "cursor-123",
    });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useConversations(), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.pages[0].data).toHaveLength(1);
    expect(result.current.data?.pages[0].data[0].id).toBe("conv-1");
    expect(typeof result.current.fetchNextPage).toBe("function");
  });
});

describe("useSendMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({ replyTargets: {} });
  });

  it("optimistically appends message before request resolves", async () => {
    let resolveMessage!: (msg: Message) => void;
    vi.mocked(chatService.sendMessage).mockReturnValue(
      new Promise<Message>((resolve) => {
        resolveMessage = resolve;
      }),
    );

    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData<InfiniteData<MessageListResponse>>(
      ["messages", "conv-1"],
      emptyMessagesCache,
    );

    const { result } = renderHook(() => useSendMessage("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ content: "hello optimistic" });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<
        InfiniteData<MessageListResponse>
      >(["messages", "conv-1"]);
      expect(cached?.pages[0].data).toHaveLength(1);
    });

    const cached = queryClient.getQueryData<InfiniteData<MessageListResponse>>([
      "messages",
      "conv-1",
    ]);
    expect(cached?.pages[0].data[0].content).toBe("hello optimistic");
    expect(cached?.pages[0].data[0].id).toMatch(/^optimistic-/);

    resolveMessage(mockMessage);
  });

  it("rolls back optimistic update on request failure", async () => {
    vi.mocked(chatService.sendMessage).mockRejectedValue(
      new Error("Network error"),
    );

    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData<InfiniteData<MessageListResponse>>(
      ["messages", "conv-1"],
      populatedMessagesCache,
    );

    const { result } = renderHook(() => useSendMessage("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ content: "this will fail" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = queryClient.getQueryData<InfiniteData<MessageListResponse>>([
      "messages",
      "conv-1",
    ]);
    expect(cached?.pages[0].data).toHaveLength(1);
    expect(cached?.pages[0].data[0].id).toBe("msg-1");
  });

  it("invalidates conversations on success", async () => {
    vi.mocked(chatService.sendMessage).mockResolvedValue(mockMessage);

    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData<InfiniteData<MessageListResponse>>(
      ["messages", "conv-1"],
      emptyMessagesCache,
    );

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSendMessage("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ content: "hello" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["conversations"] });
  });

  it("optimistic message includes replyTo snapshot when store has a reply target", async () => {
    const replyMessage: Message = {
      id: "reply-msg-1",
      conversationId: "conv-1",
      senderId: "user-3",
      content: "Original message content",
      type: "TEXT",
      status: "SENT",
      isDeleted: false,
      isAI: false,
      reactions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    useChatStore.setState({ replyTargets: { "conv-1": replyMessage } });

    let resolveMessage!: (msg: Message) => void;
    vi.mocked(chatService.sendMessage).mockReturnValue(
      new Promise<Message>((resolve) => {
        resolveMessage = resolve;
      }),
    );

    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData<InfiniteData<MessageListResponse>>(
      ["messages", "conv-1"],
      emptyMessagesCache,
    );

    const { result } = renderHook(() => useSendMessage("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ content: "quoting you" });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<
        InfiniteData<MessageListResponse>
      >(["messages", "conv-1"]);
      expect(cached?.pages[0].data).toHaveLength(1);
    });

    const cached = queryClient.getQueryData<InfiniteData<MessageListResponse>>([
      "messages",
      "conv-1",
    ]);
    const optimistic = cached?.pages[0].data[0];
    expect(optimistic?.replyTo?.messageId).toBe("reply-msg-1");
    expect(optimistic?.replyTo?.senderId).toBe("user-3");
    expect(optimistic?.replyTo?.content).toBe("Original message content");

    resolveMessage(mockMessage);
  });

  it("optimistic message has no replyTo when store has no reply target", async () => {
    let resolveMessage!: (msg: Message) => void;
    vi.mocked(chatService.sendMessage).mockReturnValue(
      new Promise<Message>((resolve) => {
        resolveMessage = resolve;
      }),
    );

    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData<InfiniteData<MessageListResponse>>(
      ["messages", "conv-1"],
      emptyMessagesCache,
    );

    const { result } = renderHook(() => useSendMessage("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ content: "plain message" });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<
        InfiniteData<MessageListResponse>
      >(["messages", "conv-1"]);
      expect(cached?.pages[0].data).toHaveLength(1);
    });

    const cached = queryClient.getQueryData<InfiniteData<MessageListResponse>>([
      "messages",
      "conv-1",
    ]);
    expect(cached?.pages[0].data[0].replyTo).toBeUndefined();

    resolveMessage(mockMessage);
  });

  it("passes quotedMessageId to chatService.sendMessage", async () => {
    vi.mocked(chatService.sendMessage).mockResolvedValue(mockMessage);

    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData<InfiniteData<MessageListResponse>>(
      ["messages", "conv-1"],
      emptyMessagesCache,
    );

    const { result } = renderHook(() => useSendMessage("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({
        content: "reply content",
        quotedMessageId: "quoted-msg-1",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(chatService.sendMessage).toHaveBeenCalledWith(
      "conv-1",
      "reply content",
      "quoted-msg-1",
    );
  });

  it("clears replyTarget in store on successful send", async () => {
    const replyMessage: Message = {
      id: "reply-msg-2",
      conversationId: "conv-1",
      senderId: "user-3",
      content: "A message to reply to",
      type: "TEXT",
      status: "SENT",
      isDeleted: false,
      isAI: false,
      reactions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    useChatStore.setState({ replyTargets: { "conv-1": replyMessage } });
    vi.mocked(chatService.sendMessage).mockResolvedValue(mockMessage);

    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData<InfiniteData<MessageListResponse>>(
      ["messages", "conv-1"],
      emptyMessagesCache,
    );

    const { result } = renderHook(() => useSendMessage("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ content: "reply sent" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(useChatStore.getState().replyTargets["conv-1"]).toBeNull();
  });
});

describe("useMarkRead", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invalidates conversation and conversations on success", async () => {
    vi.mocked(chatService.markRead).mockResolvedValue({
      lastReadAt: new Date().toISOString(),
    });

    const { queryClient, Wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useMarkRead("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["conversation", "conv-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["conversations"] });
  });
});

describe("useSearchConversations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not call searchConversations when query is empty string", async () => {
    const { Wrapper } = makeWrapper();
    renderHook(() => useSearchConversations(""), { wrapper: Wrapper });

    await new Promise((r) => setTimeout(r, 50));
    expect(chatService.searchConversations).not.toHaveBeenCalled();
  });

  it("debounces — API is called only after 300ms of idle, not on every keystroke", async () => {
    vi.useFakeTimers();
    vi.mocked(chatService.searchConversations).mockResolvedValue({
      data: [],
      hasMore: false,
    } as ConversationListResponse);

    const { Wrapper } = makeWrapper();
    const { rerender } = renderHook(
      ({ q }: { q: string }) => useSearchConversations(q),
      { wrapper: Wrapper, initialProps: { q: "" } },
    );

    rerender({ q: "j" });
    expect(chatService.searchConversations).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(chatService.searchConversations).toHaveBeenCalledWith("j");
    });
  });

  it("calls chatService.searchConversations with the debounced query value", async () => {
    vi.mocked(chatService.searchConversations).mockResolvedValue({
      data: [],
      hasMore: false,
    } as ConversationListResponse);

    const { Wrapper } = makeWrapper();
    renderHook(() => useSearchConversations("alice"), { wrapper: Wrapper });

    await waitFor(() => {
      expect(chatService.searchConversations).toHaveBeenCalledWith("alice");
    });
  });

  it("returns empty data array when API returns { data: [], hasMore: false }", async () => {
    vi.mocked(chatService.searchConversations).mockResolvedValue({
      data: [],
      hasMore: false,
    } as ConversationListResponse);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSearchConversations("alice"), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(0);
    expect(result.current.data?.hasMore).toBe(false);
  });
});

describe("useToggleReaction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("optimistically adds reaction when emoji is not yet in message reactions", async () => {
    let resolveToggle!: (msg: Message) => void;
    vi.mocked(chatService.toggleReaction).mockReturnValue(
      new Promise<Message>((resolve) => {
        resolveToggle = resolve;
      }),
    );

    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData<InfiniteData<MessageListResponse>>(
      ["messages", "conv-1"],
      populatedMessagesCache,
    );

    const { result } = renderHook(() => useToggleReaction("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ messageId: "msg-1", emoji: "👍" });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<
        InfiniteData<MessageListResponse>
      >(["messages", "conv-1"]);
      const msg = cached?.pages[0].data[0];
      expect(msg?.reactions?.some((r) => r.emoji === "👍")).toBe(true);
    });

    resolveToggle({
      ...mockMessage,
      reactions: [
        { emoji: "👍", userId: "user-1", createdAt: new Date().toISOString() },
      ],
    });
  });

  it("optimistically removes reaction when emoji is already present for current user", async () => {
    const messageWithReaction: Message = {
      ...mockMessage,
      reactions: [
        { emoji: "👍", userId: "user-1", createdAt: new Date().toISOString() },
      ],
    };
    const cacheWithReaction: InfiniteData<MessageListResponse> = {
      pages: [
        { data: [messageWithReaction], hasMore: false, nextCursor: undefined },
      ],
      pageParams: [undefined],
    };

    let resolveToggle!: (msg: Message) => void;
    vi.mocked(chatService.toggleReaction).mockReturnValue(
      new Promise<Message>((resolve) => {
        resolveToggle = resolve;
      }),
    );

    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData<InfiniteData<MessageListResponse>>(
      ["messages", "conv-1"],
      cacheWithReaction,
    );

    const { result } = renderHook(() => useToggleReaction("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ messageId: "msg-1", emoji: "👍" });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<
        InfiniteData<MessageListResponse>
      >(["messages", "conv-1"]);
      const msg = cached?.pages[0].data[0];
      expect(
        msg?.reactions?.some((r) => r.emoji === "👍" && r.userId === "user-1"),
      ).toBe(false);
    });

    resolveToggle(mockMessage);
  });

  it("rolls back optimistic update and restores original cache on request failure", async () => {
    vi.mocked(chatService.toggleReaction).mockRejectedValue(
      new Error("Network error"),
    );

    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData<InfiniteData<MessageListResponse>>(
      ["messages", "conv-1"],
      populatedMessagesCache,
    );

    const { result } = renderHook(() => useToggleReaction("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ messageId: "msg-1", emoji: "👍" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = queryClient.getQueryData<InfiniteData<MessageListResponse>>([
      "messages",
      "conv-1",
    ]);
    expect(cached?.pages[0].data[0].reactions).toHaveLength(0);
    expect(cached?.pages[0].data[0].id).toBe("msg-1");
  });

  it("replaces message in cache with server response on success", async () => {
    const serverResponse: Message = {
      ...mockMessage,
      reactions: [
        { emoji: "👍", userId: "user-1", createdAt: new Date().toISOString() },
      ],
    };
    vi.mocked(chatService.toggleReaction).mockResolvedValue(serverResponse);

    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData<InfiniteData<MessageListResponse>>(
      ["messages", "conv-1"],
      populatedMessagesCache,
    );

    const { result } = renderHook(() => useToggleReaction("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ messageId: "msg-1", emoji: "👍" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const cached = queryClient.getQueryData<InfiniteData<MessageListResponse>>([
      "messages",
      "conv-1",
    ]);
    expect(cached?.pages[0].data[0].reactions).toHaveLength(1);
    expect(cached?.pages[0].data[0].reactions[0].emoji).toBe("👍");
  });
});

describe("useRewriteMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({ draftMessages: {} });
  });

  it("calls setDraft with rewrittenText on success", async () => {
    vi.mocked(chatService.rewriteMessage).mockResolvedValue({
      rewrittenText: "Improved text",
    });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useRewriteMessage("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ text: "hello", tone: "professional" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(useChatStore.getState().draftMessages["conv-1"]).toBe(
      "Improved text",
    );
  });

  it("calls showToast.error with rewrite_failed message on error", async () => {
    vi.mocked(chatService.rewriteMessage).mockRejectedValue(
      new Error("AI failed"),
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useRewriteMessage("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ text: "hello", tone: "casual" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(vi.mocked(showToast.error)).toHaveBeenCalledWith(
      "AI rewrite failed. Please try again.",
    );
  });

  it("does not modify draft when the request fails", async () => {
    useChatStore.setState({
      draftMessages: { "conv-1": "original draft" },
    });
    vi.mocked(chatService.rewriteMessage).mockRejectedValue(
      new Error("AI failed"),
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useRewriteMessage("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ text: "original draft", tone: "shorter" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(useChatStore.getState().draftMessages["conv-1"]).toBe(
      "original draft",
    );
  });
});

describe("useSmartReplies", () => {
  beforeEach(() => vi.clearAllMocks());

  const context = [{ role: "them" as const, content: "Are you free?" }];

  it("does not fire when enabled is false", async () => {
    const { Wrapper } = makeWrapper();
    renderHook(
      () =>
        useSmartReplies({
          lastMessageId: "msg-1",
          context,
          enabled: false,
        }),
      { wrapper: Wrapper },
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(chatService.getSmartReplies).not.toHaveBeenCalled();
  });

  it("does not fire when lastMessageId is empty string", async () => {
    const { Wrapper } = makeWrapper();
    renderHook(
      () =>
        useSmartReplies({
          lastMessageId: "",
          context,
          enabled: true,
        }),
      { wrapper: Wrapper },
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(chatService.getSmartReplies).not.toHaveBeenCalled();
  });

  it("fires when enabled is true and lastMessageId is non-empty", async () => {
    vi.mocked(chatService.getSmartReplies).mockResolvedValue({
      suggestions: ["s1", "s2", "s3"],
    });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () =>
        useSmartReplies({
          lastMessageId: "msg-1",
          context,
          enabled: true,
        }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(chatService.getSmartReplies).toHaveBeenCalledTimes(1);
  });

  it("caches result under ['smart-replies', lastMessageId]", async () => {
    vi.mocked(chatService.getSmartReplies).mockResolvedValue({
      suggestions: ["s1", "s2", "s3"],
    });

    const { queryClient, Wrapper } = makeWrapper();
    const { result } = renderHook(
      () =>
        useSmartReplies({
          lastMessageId: "msg-42",
          context,
          enabled: true,
        }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const cached = queryClient.getQueryData(["smart-replies", "msg-42"]);
    expect(cached).toEqual({ suggestions: ["s1", "s2", "s3"] });
  });

  it("returns suggestions on success", async () => {
    vi.mocked(chatService.getSmartReplies).mockResolvedValue({
      suggestions: ["Yes!", "No thanks", "Maybe later"],
    });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () =>
        useSmartReplies({
          lastMessageId: "msg-1",
          context,
          enabled: true,
        }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      suggestions: ["Yes!", "No thanks", "Maybe later"],
    });
  });

  it("does not retry on error — service called exactly once", async () => {
    vi.mocked(chatService.getSmartReplies).mockRejectedValue(
      new Error("503 Service Unavailable"),
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () =>
        useSmartReplies({
          lastMessageId: "msg-1",
          context,
          enabled: true,
        }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(chatService.getSmartReplies).toHaveBeenCalledTimes(1);
  });
});

describe("useSummarizeConversation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves with data.summary from the service on success", async () => {
    vi.mocked(chatService.summarizeConversation).mockResolvedValue({
      summary: "• They discussed plans.",
    });

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSummarizeConversation("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate(50);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.summary).toBe("• They discussed plans.");
  });

  it("calls showToast.error with summarize_rate_limited on 429 error", async () => {
    const error = Object.assign(new Error("Rate limited"), {
      isAxiosError: true,
      response: { status: 429 },
    });
    vi.mocked(chatService.summarizeConversation).mockRejectedValue(error);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSummarizeConversation("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate(50);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(vi.mocked(showToast.error)).toHaveBeenCalledWith(
      "Summarize is limited to 15 times per minute. Please wait.",
    );
  });

  it("does not call showToast.error on a non-429 error (error shown in modal instead)", async () => {
    const error = Object.assign(new Error("Service unavailable"), {
      isAxiosError: true,
      response: { status: 503 },
    });
    vi.mocked(chatService.summarizeConversation).mockRejectedValue(error);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSummarizeConversation("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate(50);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(vi.mocked(showToast.error)).not.toHaveBeenCalled();
  });
});

describe("useAiAgent", () => {
  const aiMessage: Message = {
    id: "ai-msg-1",
    conversationId: "conv-1",
    senderId: "user-1",
    content: "In Tokyo it's 24°C",
    type: "TEXT",
    status: "SENT",
    isDeleted: false,
    isEdited: false,
    isAI: true,
    toolUsed: "get_weather",
    reactions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({
      draftMessages: { "conv-1": "@AI weather in Tokyo" },
    });
  });

  it("clears draft and inserts message into query cache on success", async () => {
    vi.mocked(chatService.triggerAiAgent).mockResolvedValue({
      message: aiMessage,
    });

    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData<InfiniteData<MessageListResponse>>(
      ["messages", "conv-1"],
      emptyMessagesCache,
    );

    const { result } = renderHook(() => useAiAgent("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate("@AI weather in Tokyo");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(useChatStore.getState().draftMessages["conv-1"]).toBe("");

    const cached = queryClient.getQueryData<InfiniteData<MessageListResponse>>([
      "messages",
      "conv-1",
    ]);
    expect(cached?.pages[0].data[0].id).toBe("ai-msg-1");
    expect(cached?.pages[0].data[0].isAI).toBe(true);
  });

  it("does not insert duplicate message into cache on success", async () => {
    vi.mocked(chatService.triggerAiAgent).mockResolvedValue({
      message: aiMessage,
    });

    const alreadyCached: InfiniteData<MessageListResponse> = {
      pages: [{ data: [aiMessage], hasMore: false, nextCursor: undefined }],
      pageParams: [undefined],
    };

    const { queryClient, Wrapper } = makeWrapper();
    queryClient.setQueryData<InfiniteData<MessageListResponse>>(
      ["messages", "conv-1"],
      alreadyCached,
    );

    const { result } = renderHook(() => useAiAgent("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate("@AI weather in Tokyo");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const cached = queryClient.getQueryData<InfiniteData<MessageListResponse>>([
      "messages",
      "conv-1",
    ]);
    expect(cached?.pages[0].data).toHaveLength(1);
  });

  it("shows bottom-center amber toast and does NOT clear draft on rateLimited error", async () => {
    const { toast } = await import("sonner");
    const error = Object.assign(new Error("Rate limited"), {
      isAxiosError: true,
      response: {
        status: 429,
        data: {
          rateLimited: true,
          secondsRemaining: 7,
          message: "Slow down! Try again in 7 seconds ⏳",
        },
      },
    });
    vi.mocked(chatService.triggerAiAgent).mockRejectedValue(error);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAiAgent("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate("@AI weather in Tokyo");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      "Slow down! Try again in 7 seconds ⏳",
      expect.objectContaining({ position: "bottom-center" }),
    );
    expect(useChatStore.getState().draftMessages["conv-1"]).toBe(
      "@AI weather in Tokyo",
    );
  });

  it("shows bottom-center red toast on blocked injection error", async () => {
    const { toast } = await import("sonner");
    const error = Object.assign(new Error("Blocked"), {
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          blocked: true,
          category: "injection",
          message: "⚠️ That kind of instruction isn't something I can follow.",
        },
      },
    });
    vi.mocked(chatService.triggerAiAgent).mockRejectedValue(error);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAiAgent("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate("@AI act as a hacker");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      "⚠️ That kind of instruction isn't something I can follow.",
      expect.objectContaining({
        position: "bottom-center",
        style: expect.objectContaining({ background: "#ef4444" }),
      }),
    );
  });

  it("shows bottom-center amber toast on blocked codeGen error", async () => {
    const { toast } = await import("sonner");
    const error = Object.assign(new Error("Blocked"), {
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          blocked: true,
          category: "codeGen",
          message: "🛠️ I can't write code.",
        },
      },
    });
    vi.mocked(chatService.triggerAiAgent).mockRejectedValue(error);

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAiAgent("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate("@AI write code for me");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      "🛠️ I can't write code.",
      expect.objectContaining({
        position: "bottom-center",
        style: expect.objectContaining({ background: "#f59e0b" }),
      }),
    );
  });

  it("calls showToast.error on a generic (non-axios) error", async () => {
    vi.mocked(chatService.triggerAiAgent).mockRejectedValue(
      new Error("Network failure"),
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useAiAgent("conv-1"), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate("@AI weather in Tokyo");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(vi.mocked(showToast.error)).toHaveBeenCalledWith(
      "AI is unavailable right now, try again shortly.",
    );
  });
});
