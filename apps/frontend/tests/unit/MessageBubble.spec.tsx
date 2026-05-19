import React from "react";
import { screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MessageBubble } from "../../src/features/chat/components/MessageBubble";
import { ConversationParticipant, Message } from "@shared-types";
import { renderWithIntl } from "../utils/render";
import { simulate } from "../utils/simulate";
import {
  useEditMessage,
  useDeleteMessage,
  useToggleReaction,
} from "../../src/features/chat/hooks/useChat";
import { useChatStore } from "../../src/features/chat/store/useChatStore";

vi.mock("../../src/features/chat/hooks/useChat", () => ({
  useEditMessage: vi.fn(),
  useDeleteMessage: vi.fn(),
  useToggleReaction: vi.fn(),
}));

const mockMessage: Message = {
  id: "msg-1",
  conversationId: "conv-1",
  senderId: "user-1",
  content: "Hello world",
  type: "TEXT",
  status: "SENT",
  isDeleted: false,
  isEdited: false,
  isAI: false,
  reactions: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function setupMocks() {
  vi.mocked(useEditMessage).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useEditMessage>);
  vi.mocked(useDeleteMessage).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useDeleteMessage>);
}

describe("MessageBubble", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
    vi.mocked(useEditMessage).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useEditMessage>);
    vi.mocked(useDeleteMessage).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useDeleteMessage>);
    vi.mocked(useToggleReaction).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useToggleReaction>);
  });

  it("shows edit/delete menu only when isMine is true", async () => {
    const { unmount } = renderWithIntl(
      <MessageBubble
        message={mockMessage}
        isMine={false}
        conversationId="conv-1"
        participants={[]}
      />,
    );
    expect(screen.queryByText("Edit")).toBeNull();
    expect(screen.queryByText("Delete")).toBeNull();
    unmount();

    renderWithIntl(
      <MessageBubble
        message={mockMessage}
        isMine={true}
        conversationId="conv-1"
        participants={[]}
      />,
    );
    const menuTrigger = screen.getByRole("button", {
      name: /message options/i,
    });
    await simulate.click(menuTrigger);
    expect(screen.getByText("Edit")).toBeTruthy();
    expect(screen.getByText("Delete")).toBeTruthy();
  });

  it("renders [deleted] tombstone when isDeleted is true and hides edit/delete", () => {
    const deletedMessage = { ...mockMessage, isDeleted: true };
    renderWithIntl(
      <MessageBubble
        message={deletedMessage}
        isMine={true}
        conversationId="conv-1"
        participants={[]}
      />,
    );
    expect(screen.getByText("[deleted]")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows (edited) label when isEdited is true", () => {
    const editedMessage = {
      ...mockMessage,
      isEdited: true,
      reactions: [
        { emoji: "👍", userId: "user-2", createdAt: new Date().toISOString() },
      ],
    };
    renderWithIntl(
      <MessageBubble
        message={editedMessage}
        isMine={false}
        conversationId="conv-1"
        participants={[]}
      />,
    );
    expect(screen.getByText("(edited)")).toBeTruthy();
  });
});

describe("MessageBubble status indicator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it("renders single Check icon when isMine is true and status is SENT", () => {
    const { container } = renderWithIntl(
      <MessageBubble
        message={{ ...mockMessage, status: "SENT" }}
        isMine={true}
        conversationId="conv-1"
        participants={[]}
      />,
    );
    // CheckCheck must be absent; Check must be present
    expect(container.querySelector("svg.lucide-check-check")).toBeNull();
    expect(container.querySelector("svg.lucide-check")).toBeTruthy();
  });

  it("renders double CheckCheck icon with grey color when isMine is true and status is DELIVERED", () => {
    const { container } = renderWithIntl(
      <MessageBubble
        message={{ ...mockMessage, status: "DELIVERED" }}
        isMine={true}
        conversationId="conv-1"
        participants={[]}
      />,
    );
    const icon = container.querySelector("svg.lucide-check-check");
    expect(icon).toBeTruthy();
    expect(icon?.getAttribute("class")).toContain("text-foreground/40");
  });

  it("renders double CheckCheck icon with blue color when isMine is true and status is READ", () => {
    const { container } = renderWithIntl(
      <MessageBubble
        message={{ ...mockMessage, status: "READ" }}
        isMine={true}
        conversationId="conv-1"
        participants={[]}
      />,
    );
    const icon = container.querySelector("svg.lucide-check-check");
    expect(icon).toBeTruthy();
    expect(icon?.getAttribute("class")).toContain("text-blue-500");
  });

  it("renders no status indicator when isMine is false", () => {
    const { container } = renderWithIntl(
      <MessageBubble
        message={mockMessage}
        isMine={false}
        conversationId="conv-1"
        participants={[]}
      />,
    );
    expect(container.querySelector("svg.lucide-check")).toBeNull();
    expect(container.querySelector("svg.lucide-check-check")).toBeNull();
  });

  it("renders no status indicator when message is deleted", () => {
    const { container } = renderWithIntl(
      <MessageBubble
        message={{ ...mockMessage, isDeleted: true }}
        isMine={true}
        conversationId="conv-1"
        participants={[]}
      />,
    );
    expect(container.querySelector("svg.lucide-check")).toBeNull();
    expect(container.querySelector("svg.lucide-check-check")).toBeNull();
  });
});

describe("MessageBubble — AI messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
    vi.mocked(useToggleReaction).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useToggleReaction>);
  });

  it("renders purple AI bubble with 🤖 AI Assistant label when isAI is true", () => {
    const aiMessage: Message = {
      ...mockMessage,
      isAI: true,
      toolUsed: "get_weather",
    };
    renderWithIntl(
      <MessageBubble
        message={aiMessage}
        isMine={false}
        conversationId="conv-1"
        participants={[]}
      />,
    );
    expect(screen.getByText("🤖 AI Assistant")).toBeTruthy();
    expect(screen.getByText(aiMessage.content)).toBeTruthy();
  });

  it("renders tool badge for get_weather", () => {
    const aiMessage: Message = {
      ...mockMessage,
      isAI: true,
      toolUsed: "get_weather",
    };
    renderWithIntl(
      <MessageBubble
        message={aiMessage}
        isMine={false}
        conversationId="conv-1"
        participants={[]}
      />,
    );
    expect(screen.getByText("🌤️ Weather")).toBeTruthy();
  });

  it("renders tool badge for web_search", () => {
    const aiMessage: Message = {
      ...mockMessage,
      isAI: true,
      toolUsed: "web_search",
    };
    renderWithIntl(
      <MessageBubble
        message={aiMessage}
        isMine={false}
        conversationId="conv-1"
        participants={[]}
      />,
    );
    expect(screen.getByText("🔍 Web search")).toBeTruthy();
  });

  it("does not render edit or delete controls for AI messages", () => {
    const aiMessage: Message = {
      ...mockMessage,
      isAI: true,
      toolUsed: "direct",
    };
    renderWithIntl(
      <MessageBubble
        message={aiMessage}
        isMine={true}
        conversationId="conv-1"
        participants={[]}
      />,
    );
    expect(screen.queryByText("Edit")).toBeNull();
    expect(screen.queryByText("Delete")).toBeNull();
  });
});

describe("MessageBubble quoted reply", () => {
  const messageWithReplyTo: Message = {
    ...mockMessage,
    replyTo: {
      messageId: "original-1",
      senderId: "user-2",
      content: "The original message content",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
    vi.mocked(useToggleReaction).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof useToggleReaction>);
    useChatStore.setState({ replyTargets: {} });
  });

  it("renders quoted preview block when message.replyTo is present", () => {
    renderWithIntl(
      <MessageBubble
        message={messageWithReplyTo}
        isMine={false}
        conversationId="conv-1"
        participants={[]}
      />,
    );
    expect(screen.getByText("The original message content")).toBeTruthy();
  });

  it("resolves sender name from participants in quoted preview (group chat)", () => {
    const participants: ConversationParticipant[] = [
      {
        userId: "user-1",
        username: "Me",
      } as unknown as ConversationParticipant,
      {
        userId: "user-2",
        username: "Alice",
      } as unknown as ConversationParticipant,
      {
        userId: "user-3",
        username: "Bob",
      } as unknown as ConversationParticipant,
    ];
    renderWithIntl(
      <MessageBubble
        message={messageWithReplyTo}
        isMine={false}
        conversationId="conv-1"
        participants={participants}
      />,
    );
    expect(screen.getByText("Alice")).toBeTruthy();
  });

  it("does not render quoted preview when message.replyTo is absent", () => {
    renderWithIntl(
      <MessageBubble
        message={mockMessage}
        isMine={false}
        conversationId="conv-1"
        participants={[]}
      />,
    );
    expect(screen.queryByText("The original message content")).toBeNull();
  });

  it("Reply button sets replyTarget in store when clicked", async () => {
    renderWithIntl(
      <MessageBubble
        message={mockMessage}
        isMine={false}
        conversationId="conv-1"
        participants={[]}
      />,
    );
    const replyButton = screen.getByRole("button", { name: /^reply$/i });
    await simulate.click(replyButton);
    expect(useChatStore.getState().replyTargets["conv-1"]).toEqual(mockMessage);
  });
});
