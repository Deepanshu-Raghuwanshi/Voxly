import React from "react";
import { screen, waitFor, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MessageComposer } from "../../src/features/chat/components/MessageComposer";
import { renderWithIntl } from "../utils/render";
import { simulate } from "../utils/simulate";
import {
  useSendMessage,
  useRewriteMessage,
  useAiAgent,
} from "../../src/features/chat/hooks/useChat";
import { useChatStore } from "../../src/features/chat/store/useChatStore";
import {
  emitTypingStart,
  emitTypingStop,
} from "../../src/features/friends/hooks/usePresence";

vi.mock("../../src/features/chat/hooks/useChat", () => ({
  useSendMessage: vi.fn(),
  useRewriteMessage: vi.fn(),
  useAiAgent: vi.fn(),
}));

vi.mock("../../src/features/chat/components/AiTonePicker", () => ({
  AiTonePicker: ({ onSelect }: { onSelect: (tone: string) => void }) => (
    <div data-testid="mock-ai-tone-picker">
      <button type="button" onClick={() => onSelect("professional")}>
        Professional
      </button>
    </div>
  ),
}));

vi.mock("../../src/features/friends/hooks/usePresence", () => ({
  emitTypingStart: vi.fn(),
  emitTypingStop: vi.fn(),
}));

vi.mock("../../src/features/chat/components/EmojiPickerPopover", () => ({
  EmojiPickerPopover: ({
    onEmojiSelect,
  }: {
    onEmojiSelect: (emoji: string) => void;
  }) => (
    <button data-testid="mock-emoji-picker" onClick={() => onEmojiSelect("👍")}>
      Mock Picker
    </button>
  ),
}));

describe("MessageComposer", () => {
  const mockSendMessage = vi.fn();
  const mockRewriteMessage = vi.fn();
  const mockTriggerAiAgent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({
      draftMessages: {},
      activeConversationId: null,
      replyTargets: {},
      typingUsers: {},
    });
    vi.mocked(useSendMessage).mockReturnValue({
      mutate: mockSendMessage,
      isPending: false,
    } as unknown as ReturnType<typeof useSendMessage>);
    vi.mocked(useRewriteMessage).mockReturnValue({
      mutate: mockRewriteMessage,
      isPending: false,
    } as unknown as ReturnType<typeof useRewriteMessage>);
    vi.mocked(useAiAgent).mockReturnValue({
      mutate: mockTriggerAiAgent,
      isPending: false,
    } as unknown as ReturnType<typeof useAiAgent>);
  });

  it("send button is disabled when textarea is empty", () => {
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-1" />,
    );
    const sendButton = screen.getByRole("button", { name: /send/i });
    expect((sendButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls useSendMessage with trimmed content on submit", async () => {
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-2" />,
    );
    const textarea = screen.getByPlaceholderText("Type a message...");
    await simulate.type(textarea, "hello world");
    const sendButton = screen.getByRole("button", { name: /send/i });
    await simulate.click(sendButton);
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: "hello world" }),
      expect.any(Object),
    );
  });

  it("clears input after successful send", async () => {
    let capturedOnSuccess: (() => void) | undefined;
    mockSendMessage.mockImplementation(
      (
        _vars: { content: string; quotedMessageId?: string },
        options?: { onSuccess?: () => void },
      ) => {
        capturedOnSuccess = options?.onSuccess;
      },
    );

    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-3" />,
    );
    const textarea = screen.getByPlaceholderText("Type a message...");
    await simulate.type(textarea, "hello");

    const sendButton = screen.getByRole("button", { name: /send/i });
    await simulate.click(sendButton);

    expect(mockSendMessage).toHaveBeenCalled();

    act(() => {
      capturedOnSuccess?.();
    });

    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe("");
    });
  });

  it("emoji button renders and is accessible via aria-label", () => {
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-1" />,
    );
    expect(
      screen.queryByRole("button", { name: /open emoji picker/i }),
    ).toBeTruthy();
  });

  it("clicking the emoji button opens the picker", async () => {
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-1" />,
    );
    const emojiButton = screen.getByRole("button", {
      name: /open emoji picker/i,
    });
    await simulate.click(emojiButton);
    expect(screen.queryByTestId("mock-emoji-picker")).toBeTruthy();
  });

  it("clicking the emoji button again closes the picker", async () => {
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-1" />,
    );
    const emojiButton = screen.getByRole("button", {
      name: /open emoji picker/i,
    });
    await simulate.click(emojiButton);
    expect(screen.queryByTestId("mock-emoji-picker")).toBeTruthy();
    await simulate.click(emojiButton);
    expect(screen.queryByTestId("mock-emoji-picker")).toBeNull();
  });

  it("selecting an emoji appends it to the draft when the composer is empty", async () => {
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-emoji" />,
    );
    const emojiButton = screen.getByRole("button", {
      name: /open emoji picker/i,
    });
    await simulate.click(emojiButton);
    await simulate.click(screen.getByTestId("mock-emoji-picker"));

    const draft = useChatStore.getState().draftMessages["conv-emoji"];
    expect(draft).toBe("👍");
  });

  it("selecting an emoji inserts it at the cursor position when cursor is mid-text", async () => {
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-cursor" />,
    );
    const textarea = screen.getByPlaceholderText("Type a message...");

    await simulate.type(textarea, "helloworld");

    act(() => {
      (textarea as HTMLTextAreaElement).setSelectionRange(5, 5);
    });

    const emojiButton = screen.getByRole("button", {
      name: /open emoji picker/i,
    });
    await simulate.click(emojiButton);
    await simulate.click(screen.getByTestId("mock-emoji-picker"));

    const draft = useChatStore.getState().draftMessages["conv-cursor"];
    expect(draft).toBe("hello👍world");
  });

  it("closes the emoji picker when clicking outside the emoji area", async () => {
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-1" />,
    );
    const emojiButton = screen.getByRole("button", {
      name: /open emoji picker/i,
    });
    await simulate.click(emojiButton);
    expect(screen.queryByTestId("mock-emoji-picker")).toBeTruthy();

    await simulate.click(document.body);
    expect(screen.queryByTestId("mock-emoji-picker")).toBeNull();
  });
});

describe("MessageComposer — AI rewrite", () => {
  const mockSendMessage = vi.fn();
  const mockRewriteMessage = vi.fn();
  const mockTriggerAiAgent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({
      draftMessages: {},
      activeConversationId: null,
      replyTargets: {},
      typingUsers: {},
    });
    vi.mocked(useSendMessage).mockReturnValue({
      mutate: mockSendMessage,
      isPending: false,
    } as unknown as ReturnType<typeof useSendMessage>);
    vi.mocked(useRewriteMessage).mockReturnValue({
      mutate: mockRewriteMessage,
      isPending: false,
    } as unknown as ReturnType<typeof useRewriteMessage>);
    vi.mocked(useAiAgent).mockReturnValue({
      mutate: mockTriggerAiAgent,
      isPending: false,
    } as unknown as ReturnType<typeof useAiAgent>);
  });

  it("sparkle button is not rendered when draft is empty", () => {
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-ai" />,
    );
    expect(
      screen.queryByRole("button", { name: /rewrite with ai/i }),
    ).toBeNull();
  });

  it("sparkle button is rendered when draft is non-empty", () => {
    useChatStore.setState({ draftMessages: { "conv-ai": "hello" } });
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-ai" />,
    );
    expect(
      screen.getByRole("button", { name: /rewrite with ai/i }),
    ).toBeTruthy();
  });

  it("clicking the sparkle button opens AiTonePicker", async () => {
    useChatStore.setState({ draftMessages: { "conv-ai": "hello" } });
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-ai" />,
    );
    await simulate.click(
      screen.getByRole("button", { name: /rewrite with ai/i }),
    );
    expect(screen.getByTestId("mock-ai-tone-picker")).toBeTruthy();
  });

  it("selecting a tone calls rewriteMessage with trimmed draft and closes picker", async () => {
    useChatStore.setState({ draftMessages: { "conv-ai": " hello " } });
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-ai" />,
    );
    await simulate.click(
      screen.getByRole("button", { name: /rewrite with ai/i }),
    );
    await simulate.click(screen.getByText("Professional"));
    expect(mockRewriteMessage).toHaveBeenCalledWith({
      text: "hello",
      tone: "professional",
    });
    expect(screen.queryByTestId("mock-ai-tone-picker")).toBeNull();
  });

  it("sparkle button is disabled and has animate-pulse class while isRewriting", () => {
    useChatStore.setState({ draftMessages: { "conv-ai": "hello" } });
    vi.mocked(useRewriteMessage).mockReturnValue({
      mutate: mockRewriteMessage,
      isPending: true,
    } as unknown as ReturnType<typeof useRewriteMessage>);
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-ai" />,
    );
    const sparkleButton = screen.getByRole("button", {
      name: /rewrite with ai/i,
    });
    expect((sparkleButton as HTMLButtonElement).disabled).toBe(true);
    expect(sparkleButton.className).toContain("cursor-wait");
  });

  it("clicking outside the AI picker closes it", async () => {
    useChatStore.setState({ draftMessages: { "conv-ai": "hello" } });
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-ai" />,
    );
    await simulate.click(
      screen.getByRole("button", { name: /rewrite with ai/i }),
    );
    expect(screen.getByTestId("mock-ai-tone-picker")).toBeTruthy();
    await simulate.click(document.body);
    expect(screen.queryByTestId("mock-ai-tone-picker")).toBeNull();
  });
});

describe("MessageComposer reply strip", () => {
  const mockReplyTarget = {
    id: "msg-quoted-1",
    conversationId: "conv-1",
    senderId: "user-2",
    content: "The message being quoted",
    type: "TEXT" as const,
    status: "SENT" as const,
    isDeleted: false,
    isEdited: false,
    isAI: false,
    reactions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockSendMessage = vi.fn();
  const mockRewriteMessage = vi.fn();
  const mockTriggerAiAgent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({
      draftMessages: {},
      activeConversationId: null,
      replyTargets: {},
      typingUsers: {},
    });
    vi.mocked(useSendMessage).mockReturnValue({
      mutate: mockSendMessage,
      isPending: false,
    } as unknown as ReturnType<typeof useSendMessage>);
    vi.mocked(useRewriteMessage).mockReturnValue({
      mutate: mockRewriteMessage,
      isPending: false,
    } as unknown as ReturnType<typeof useRewriteMessage>);
    vi.mocked(useAiAgent).mockReturnValue({
      mutate: mockTriggerAiAgent,
      isPending: false,
    } as unknown as ReturnType<typeof useAiAgent>);
  });

  it("shows reply strip when replyTarget is set in store", () => {
    useChatStore.setState({ replyTargets: { "conv-strip": mockReplyTarget } });
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-strip" />,
    );
    expect(screen.getByText("The message being quoted")).toBeTruthy();
    expect(screen.getByRole("button", { name: /cancel reply/i })).toBeTruthy();
  });

  it("does not show reply strip when replyTarget is null", () => {
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-no-strip" />,
    );
    expect(screen.queryByRole("button", { name: /cancel reply/i })).toBeNull();
  });

  it("cancel button clears replyTarget in store", async () => {
    useChatStore.setState({ replyTargets: { "conv-cancel": mockReplyTarget } });
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-cancel" />,
    );
    const cancelButton = screen.getByRole("button", { name: /cancel reply/i });
    await simulate.click(cancelButton);
    expect(useChatStore.getState().replyTargets["conv-cancel"]).toBeNull();
  });

  it("send includes quotedMessageId when replyTarget is set", async () => {
    useChatStore.setState({ replyTargets: { "conv-qid": mockReplyTarget } });
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-qid" />,
    );
    const textarea = screen.getByPlaceholderText("Type a message...");
    await simulate.type(textarea, "my reply");
    const sendButton = screen.getByRole("button", { name: /send/i });
    await simulate.click(sendButton);
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "my reply",
        quotedMessageId: "msg-quoted-1",
      }),
      expect.any(Object),
    );
  });
});

describe("MessageComposer — typing events", () => {
  const mockSendMessage = vi.fn();
  const mockRewriteMessage = vi.fn();
  const mockTriggerAiAgent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({
      draftMessages: {},
      activeConversationId: null,
      replyTargets: {},
      typingUsers: {},
    });
    vi.mocked(useSendMessage).mockReturnValue({
      mutate: mockSendMessage,
      isPending: false,
    } as unknown as ReturnType<typeof useSendMessage>);
    vi.mocked(useRewriteMessage).mockReturnValue({
      mutate: mockRewriteMessage,
      isPending: false,
    } as unknown as ReturnType<typeof useRewriteMessage>);
    vi.mocked(useAiAgent).mockReturnValue({
      mutate: mockTriggerAiAgent,
      isPending: false,
    } as unknown as ReturnType<typeof useAiAgent>);
  });

  it("emits typing.start once on the first non-empty keystroke", () => {
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-typing" />,
    );
    const textarea = screen.getByPlaceholderText("Type a message...");

    act(() => {
      fireEvent.change(textarea, { target: { value: "h" } });
    });

    expect(emitTypingStart).toHaveBeenCalledOnce();
    expect(emitTypingStart).toHaveBeenCalledWith("conv-typing");
  });

  it("does not re-emit typing.start on subsequent keystrokes (burst suppression)", () => {
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-burst" />,
    );
    const textarea = screen.getByPlaceholderText("Type a message...");

    act(() => {
      fireEvent.change(textarea, { target: { value: "h" } });
      fireEvent.change(textarea, { target: { value: "he" } });
      fireEvent.change(textarea, { target: { value: "hel" } });
    });

    expect(emitTypingStart).toHaveBeenCalledOnce();
  });

  it("emits typing.stop immediately when the draft is cleared", () => {
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-clear" />,
    );
    const textarea = screen.getByPlaceholderText("Type a message...");

    act(() => {
      fireEvent.change(textarea, { target: { value: "hello" } });
    });
    act(() => {
      fireEvent.change(textarea, { target: { value: "" } });
    });

    expect(emitTypingStop).toHaveBeenCalledOnce();
    expect(emitTypingStop).toHaveBeenCalledWith("conv-clear");
  });

  it("emits typing.stop before the send mutation fires", async () => {
    const callOrder: string[] = [];
    vi.mocked(emitTypingStop).mockImplementation(() => {
      callOrder.push("stop");
    });
    mockSendMessage.mockImplementation(() => {
      callOrder.push("send");
    });

    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-send" />,
    );
    const textarea = screen.getByPlaceholderText("Type a message...");

    act(() => {
      fireEvent.change(textarea, { target: { value: "hello" } });
    });
    const sendButton = screen.getByRole("button", { name: /send/i });
    await simulate.click(sendButton);

    expect(callOrder).toEqual(["stop", "send"]);
  });

  it("emits typing.stop after 3 000 ms idle timer fires", () => {
    vi.useFakeTimers();
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-timer" />,
    );
    const textarea = screen.getByPlaceholderText("Type a message...");

    act(() => {
      fireEvent.change(textarea, { target: { value: "hello" } });
    });

    expect(emitTypingStop).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(emitTypingStop).toHaveBeenCalledOnce();
    expect(emitTypingStop).toHaveBeenCalledWith("conv-timer");
    vi.useRealTimers();
  });
});

describe("MessageComposer — @AI agent", () => {
  const mockSendMessage = vi.fn();
  const mockRewriteMessage = vi.fn();
  const mockTriggerAiAgent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({
      draftMessages: {},
      activeConversationId: null,
      replyTargets: {},
      typingUsers: {},
    });
    vi.mocked(useSendMessage).mockReturnValue({
      mutate: mockSendMessage,
      isPending: false,
    } as unknown as ReturnType<typeof useSendMessage>);
    vi.mocked(useRewriteMessage).mockReturnValue({
      mutate: mockRewriteMessage,
      isPending: false,
    } as unknown as ReturnType<typeof useRewriteMessage>);
    vi.mocked(useAiAgent).mockReturnValue({
      mutate: mockTriggerAiAgent,
      isPending: false,
    } as unknown as ReturnType<typeof useAiAgent>);
  });

  it("calls triggerAiAgent (not sendMessage) when draft starts with @AI", async () => {
    useChatStore.setState({
      draftMessages: { "conv-ai": "@AI weather in Tokyo" },
    });
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-ai" />,
    );
    const sendButton = screen.getByRole("button", { name: /send/i });
    await simulate.click(sendButton);
    expect(mockTriggerAiAgent).toHaveBeenCalledWith("@AI weather in Tokyo");
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("calls sendMessage (not triggerAiAgent) when draft does not start with @AI", async () => {
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-ai" />,
    );
    const textarea = screen.getByPlaceholderText("Type a message...");
    await simulate.type(textarea, "hello there");
    const sendButton = screen.getByRole("button", { name: /send/i });
    await simulate.click(sendButton);
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: "hello there" }),
      expect.any(Object),
    );
    expect(mockTriggerAiAgent).not.toHaveBeenCalled();
  });

  it("textarea is disabled when isAgentPending is true", () => {
    vi.mocked(useAiAgent).mockReturnValue({
      mutate: mockTriggerAiAgent,
      isPending: true,
    } as unknown as ReturnType<typeof useAiAgent>);
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-ai" />,
    );
    const textarea = screen.getByPlaceholderText("Type a message...");
    expect((textarea as HTMLTextAreaElement).disabled).toBe(true);
  });

  it("send button is disabled when isAgentPending is true", () => {
    useChatStore.setState({
      draftMessages: { "conv-ai-pend": "@AI some query" },
    });
    vi.mocked(useAiAgent).mockReturnValue({
      mutate: mockTriggerAiAgent,
      isPending: true,
    } as unknown as ReturnType<typeof useAiAgent>);
    renderWithIntl(
      <MessageComposer participants={[]} conversationId="conv-ai-pend" />,
    );
    const sendButton = screen.getByRole("button", { name: /send/i });
    expect((sendButton as HTMLButtonElement).disabled).toBe(true);
  });
});
