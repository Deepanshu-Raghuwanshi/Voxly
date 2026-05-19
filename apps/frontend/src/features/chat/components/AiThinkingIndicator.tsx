"use client";

import React from "react";
import { useChatStore } from "../store/useChatStore";

interface AiThinkingIndicatorProps {
  conversationId: string;
}

function resolveLabel(draft: string): string {
  const query = draft
    .replace(/^@ai\s*/i, "")
    .trim()
    .toLowerCase();
  if (!query) return "🤖 AI is thinking...";
  if (
    query.includes("weather") ||
    query.includes("temperature") ||
    query.includes("climate")
  )
    return "🌤️ Checking weather...";
  if (
    query.startsWith("http") ||
    query.includes("summarize") ||
    query.includes("url")
  )
    return "🔗 Summarizing URL...";
  if (query.includes("translate") || query.includes("translation"))
    return "🌐 Translating...";
  return "🔍 Searching the web...";
}

export const AiThinkingIndicator = ({
  conversationId,
}: AiThinkingIndicatorProps) => {
  const isAiThinking = useChatStore(
    (state) => state.agentThinking[conversationId] ?? false,
  );
  const draft = useChatStore(
    (state) => state.draftMessages[conversationId] ?? "",
  );

  if (!isAiThinking) return null;

  const label = resolveLabel(draft);

  return (
    <div className="flex items-center gap-2 px-4 py-1.5">
      <span className="text-xs font-medium text-violet-500">{label}</span>
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1 h-1 rounded-full bg-violet-400 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </span>
    </div>
  );
};
