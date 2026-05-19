import React from "react";
import { screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConversationItem } from "../../src/features/chat/components/ConversationItem";
import { ConversationList } from "../../src/features/chat/components/ConversationList";
import { Conversation } from "@shared-types";
import { renderWithIntl } from "../utils/render";
import { useAuthStore } from "../../src/features/auth/store/useAuthStore";

vi.mock("../../src/features/auth/store/useAuthStore", () => ({
  useAuthStore: vi.fn(),
}));

const currentUserId = "user-1";

const mockConversation: Conversation = {
  id: "conv-1",
  participants: [
    { userId: currentUserId, username: "me" },
    {
      userId: "user-2",
      username: "friend",
      fullName: "Friend User",
      isOnline: false,
    },
  ],
  lastMessage: {
    id: "msg-1",
    conversationId: "conv-1",
    senderId: "user-2",
    content: "Hey there!",
    type: "TEXT",
    status: "SENT",
    isDeleted: false,
    isAI: false,
    reactions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  unreadCount: 3,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("ConversationItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useAuthStore).mockImplementation((selector: any) =>
      selector({ user: { id: currentUserId } }),
    );
  });

  it("renders unread badge when unreadCount > 0", () => {
    renderWithIntl(
      <ConversationItem
        conversation={mockConversation}
        isActive={false}
        onClick={vi.fn()}
      />,
    );
    const badge = screen.getByText("3");
    expect(badge).toBeTruthy();
    expect(badge.className).toContain("bg-primary");
  });

  it("renders no badge when unreadCount is 0", () => {
    const noUnread = { ...mockConversation, unreadCount: 0 };
    const { container } = renderWithIntl(
      <ConversationItem
        conversation={noUnread}
        isActive={false}
        onClick={vi.fn()}
      />,
    );
    const badge = container.querySelector(".bg-primary.rounded-full");
    expect(badge).toBeNull();
  });
});

describe("ConversationList", () => {
  it("renders empty state message when list is empty", () => {
    renderWithIntl(
      <ConversationList
        conversations={[]}
        activeId={null}
        onSelect={vi.fn()}
        onLoadMore={vi.fn()}
        hasMore={false}
      />,
    );
    expect(
      screen.getByText(
        "No conversations yet. Message a friend to get started!",
      ),
    ).toBeTruthy();
  });
});
