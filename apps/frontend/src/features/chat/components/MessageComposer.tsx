"use client";

import { toast } from "sonner";
import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  KeyboardEvent,
} from "react";
import { Send, Smile, Reply, X, Sparkles, Loader2 } from "lucide-react";
import { cn } from "../../../shared/utils/cn";
import { useTranslations } from "next-intl";
import {
  useSendMessage,
  useRewriteMessage,
  useAiAgent,
} from "../hooks/useChat";
import { useChatStore } from "../store/useChatStore";
import { EmojiPickerPopover } from "./EmojiPickerPopover";
import { AiTonePicker, type RewriteTone } from "./AiTonePicker";
import type { ConversationParticipant } from "@shared-types";
import { resolveParticipantName } from "../utils/resolveParticipantName";
import {
  emitTypingStart,
  emitTypingStop,
} from "../../friends/hooks/usePresence";

interface MessageComposerProps {
  conversationId: string;
  participants: ConversationParticipant[];
}

export const MessageComposer = ({
  conversationId,
  participants,
}: MessageComposerProps) => {
  const t = useTranslations("features.chat.composer");
  const draft = useChatStore(
    (state) => state.draftMessages[conversationId] ?? "",
  );
  const setDraft = useChatStore((state) => state.setDraft);
  const replyTarget = useChatStore(
    (state) => state.replyTargets[conversationId] ?? null,
  );
  const setReplyTarget = useChatStore((state) => state.setReplyTarget);
  const composerFocusToken = useChatStore(
    (state) => state.composerFocusTokens[conversationId] ?? 0,
  );
  const { mutate: sendMessage, isPending } = useSendMessage(conversationId);

  const { mutate: rewriteMessage, isPending: isRewriting } =
    useRewriteMessage(conversationId);

  const { mutate: triggerAiAgent, isPending: isAgentPending } =
    useAiAgent(conversationId);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiAreaRef = useRef<HTMLDivElement>(null);
  const aiAreaRef = useRef<HTMLDivElement>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [aiPickerOpen, setAiPickerOpen] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    if (replyTarget) textareaRef.current?.focus();
  }, [replyTarget]);

  useEffect(() => {
    if (composerFocusToken === 0) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [composerFocusToken]);

  useEffect(() => {
    if (!emojiPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        emojiAreaRef.current &&
        !emojiAreaRef.current.contains(e.target as Node)
      ) {
        setEmojiPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [emojiPickerOpen]);

  useEffect(() => {
    if (!aiPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (aiAreaRef.current && !aiAreaRef.current.contains(e.target as Node)) {
        setAiPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [aiPickerOpen]);

  const stopTyping = useCallback(() => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
    if (isTypingRef.current) {
      emitTypingStop(conversationId);
      isTypingRef.current = false;
    }
  }, [conversationId]);

  useEffect(() => {
    return () => stopTyping();
  }, [stopTyping]);

  const handleEmojiSelect = (emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? draft.length;
    const end = textarea.selectionEnd ?? draft.length;
    const newValue = draft.slice(0, start) + emoji + draft.slice(end);
    setDraft(conversationId, newValue);
    setEmojiPickerOpen(false);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const handleToneSelect = (tone: RewriteTone) => {
    setAiPickerOpen(false);
    rewriteMessage({ text: draft.trim(), tone });
  };

  const handleSend = () => {
    const content = draft.trim();
    if (!content || isPending || isAgentPending) return;
    stopTyping();

    if (content.toLowerCase().startsWith("@ai")) {
      const query = content.replace(/^@ai\s*/i, "").trim();
      if (!query) {
        toast("Add your question after @AI. Example: @AI weather in Tokyo", {
          position: "bottom-center",
          duration: 3000,
        });
        return;
      }
      triggerAiAgent(content);
      return;
    }

    sendMessage(
      { content, quotedMessageId: replyTarget?.id },
      {
        onSuccess: () => {
          setDraft(conversationId, "");
          if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
          }
        },
      },
    );
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(conversationId, e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
    if (e.target.value.trim()) {
      if (!isTypingRef.current) {
        emitTypingStart(conversationId);
        isTypingRef.current = true;
      }
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(stopTyping, 3000);
    } else {
      stopTyping();
    }
  };

  return (
    <div className="shrink-0 px-4 py-3 bg-card border-t border-border">
      <div
        className={cn(
          "flex flex-col bg-secondary rounded-2xl",
          replyTarget ? "pt-0" : "",
        )}
      >
        {replyTarget && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border/40 text-xs rounded-t-2xl">
            <Reply className="w-3.5 h-3.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              {participants.length > 2 && (
                <p className="font-medium text-primary truncate">
                  {resolveParticipantName(replyTarget.senderId, participants)}
                </p>
              )}
              <p className="text-foreground/60 truncate">
                {replyTarget.content.slice(0, 80)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyTarget(conversationId, null)}
              aria-label={t("cancel_reply")}
              className="p-1 rounded-full hover:bg-foreground/10 text-foreground/40 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2 px-4 py-2">
          {!draft.trim() && !isAgentPending && (
            <button
              type="button"
              onClick={() => {
                setDraft(conversationId, "@AI ");
                requestAnimationFrame(() => {
                  const el = textareaRef.current;
                  if (!el) return;
                  el.focus();
                  const len = el.value.length;
                  el.setSelectionRange(len, len);
                });
              }}
              aria-label={t("ai_agent_chip_label")}
              className="shrink-0 text-xs font-semibold px-2 py-1 rounded-lg border border-violet-300 dark:border-violet-700 text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
            >
              @AI
            </button>
          )}
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={
              draft.trim() ? t("placeholder") : t("placeholder_with_ai_hint")
            }
            rows={1}
            disabled={isPending || isRewriting || isAgentPending}
            className={cn(
              "flex-1 bg-transparent resize-none outline-none text-sm text-foreground",
              "placeholder:text-foreground/40 max-h-30 leading-relaxed py-1 disabled:opacity-50",
              isRewriting && "animate-pulse",
              isAgentPending && "animate-pulse",
            )}
          />
          <div ref={emojiAreaRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setEmojiPickerOpen((v) => !v)}
              aria-label={t("emoji_button_label")}
              className={cn(
                "p-2 rounded-xl transition-all duration-200",
                emojiPickerOpen
                  ? "text-primary bg-primary/10"
                  : "text-foreground/40 hover:text-foreground hover:bg-foreground/5",
              )}
            >
              <Smile className="w-4 h-4" />
            </button>
            {emojiPickerOpen && (
              <EmojiPickerPopover onEmojiSelect={handleEmojiSelect} />
            )}
          </div>
          {draft.trim() && (
            <div ref={aiAreaRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setAiPickerOpen((v) => !v)}
                disabled={isRewriting}
                aria-label={t("ai_rewrite_button_label")}
                className={cn(
                  "p-2 rounded-xl transition-all duration-200",
                  isRewriting
                    ? "text-primary bg-primary/10 cursor-wait"
                    : aiPickerOpen
                      ? "text-primary bg-primary/10"
                      : "text-foreground/40 hover:text-foreground hover:bg-foreground/5",
                )}
              >
                {isRewriting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
              </button>
              {aiPickerOpen && (
                <AiTonePicker
                  onSelect={handleToneSelect}
                  isLoading={isRewriting}
                />
              )}
            </div>
          )}
          <button
            onClick={handleSend}
            disabled={!draft.trim() || isPending || isAgentPending}
            className={cn(
              "shrink-0 p-2 rounded-xl transition-all duration-200",
              draft.trim() && !isPending && !isAgentPending
                ? "bg-primary text-white hover:bg-primary/90 shadow-sm"
                : "bg-foreground/10 text-foreground/30 cursor-not-allowed",
            )}
            aria-label={t("send")}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
