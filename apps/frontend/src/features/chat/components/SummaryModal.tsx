"use client";

import React, { useState, useEffect, useRef } from "react";
import { Loader2, X, Copy, Check } from "lucide-react";
import { cn } from "../../../shared/utils/cn";
import { useTranslations } from "next-intl";

interface SummaryModalProps {
  isOpen: boolean;
  isLoading: boolean;
  isError: boolean;
  summary: string | undefined;
  onClose: () => void;
  onRetry: () => void;
}

export const SummaryModal = ({
  isOpen,
  isLoading,
  isError,
  summary,
  onClose,
  onRetry,
}: SummaryModalProps) => {
  const t = useTranslations("features.chat.summary");
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus the panel on open; restore the trigger's focus on close
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  // Escape closes; Tab cycles within the panel
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(summary ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-label={t("title")}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "w-full max-w-md bg-card rounded-2xl shadow-xl p-6 flex flex-col gap-4 outline-none max-h-[80vh]",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground text-base">
            {t("title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="p-1 rounded-lg text-foreground/40 hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-sm text-foreground/60">{t("loading")}</p>
          </div>
        )}

        {!isLoading && isError && (
          <div className="flex flex-col items-center gap-4 py-4">
            <p className="text-sm text-foreground/60 text-center">
              {t("error_message")}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="text-sm text-primary hover:underline"
            >
              {t("retry")}
            </button>
          </div>
        )}

        {!isLoading && !isError && summary && (
          <div className="flex flex-col flex-1 min-h-0 gap-4">
            <div className="flex flex-col gap-2 overflow-y-auto min-h-0">
              {summary
                .split("\n")
                .filter((line) => line.trim())
                .map((line, i) => (
                  <p
                    key={i}
                    className="text-sm text-foreground/80 leading-relaxed"
                  >
                    {line}
                  </p>
                ))}
            </div>
            <div className="flex justify-end pt-2 border-t border-border flex-shrink-0">
              <button
                type="button"
                onClick={handleCopy}
                className={cn(
                  "flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-all duration-200",
                  copied
                    ? "text-green-600 bg-green-500/10"
                    : "text-foreground/60 hover:text-foreground hover:bg-foreground/5",
                )}
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copied ? t("copied") : t("copy")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
