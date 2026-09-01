"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai";
import { AlertTriangleIcon, MessageCircleIcon, SendIcon, SparklesIcon, WrenchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { InsightsAgentUIMessage } from "@/lib/agents/insights-agent";

const SUGGESTIONS = [
  "Which clients need attention this week?",
  "Who has the highest cost per lead?",
  "Any connectors currently failing to sync?",
];

function Avatar({ role }: { role: "user" | "assistant" }) {
  if (role === "assistant") {
    return (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <SparklesIcon className="size-3.5" aria-hidden />
      </span>
    );
  }
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
      <span className="text-[10px] font-medium">You</span>
    </span>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2">
      <Avatar role="assistant" />
      <div className="flex items-center gap-1 rounded-2xl bg-muted px-3.5 py-2.5">
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.3s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.15s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50" />
      </div>
    </div>
  );
}

export function ChatPanel() {
  const { messages, sendMessage, status, error, regenerate } = useChat<InsightsAgentUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/insights/chat" }),
  });
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    sendMessage({ text: trimmed });
    setInput("");
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <MessageCircleIcon className="size-3.5" aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-medium text-foreground">Ask about your clients</h2>
          <p className="text-xs text-muted-foreground">Grounded in the same live data as the dashboard — it looks numbers up, never guesses.</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <SparklesIcon className="size-5" aria-hidden />
            </span>
            <p className="max-w-xs text-sm text-muted-foreground">
              Ask anything about the fleet — leads, spend, sync health, individual clients.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {status === "submitted" && <TypingIndicator />}

        {status === "error" && (
          <div className="flex items-start gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangleIcon className="size-3.5" aria-hidden />
            </span>
            <div className="flex max-w-[85%] flex-col gap-2 rounded-2xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
              <span>{error?.message ?? "Something went wrong answering that."}</span>
              <button type="button" onClick={() => regenerate()} className="w-fit text-xs font-medium underline underline-offset-2 hover:no-underline">
                Try again
              </button>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="flex items-end gap-2 border-t border-border bg-muted/30 px-3 py-3"
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(input);
            }
          }}
          placeholder="Ask a question about your clients…"
          disabled={busy}
          className="min-h-9 max-h-32 resize-none rounded-2xl bg-card text-sm"
          rows={1}
        />
        <Button type="submit" size="icon-sm" className="rounded-full" disabled={busy || !input.trim()}>
          <SendIcon className="size-3.5" aria-hidden />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </div>
  );
}

function ChatMessage({ message }: { message: InsightsAgentUIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex items-start gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
      <Avatar role={isUser ? "user" : "assistant"} />
      <div className={cn("flex min-w-0 flex-col gap-1.5", isUser ? "items-end" : "items-start")}>
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap",
                  isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground shadow-sm",
                )}
              >
                {part.text}
              </div>
            );
          }
          if (isToolUIPart(part)) {
            return (
              <div key={i} className="flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
                <WrenchIcon className="size-3" aria-hidden />
                {part.state === "output-available" ? `checked ${getToolName(part)}` : `checking ${getToolName(part)}…`}
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
