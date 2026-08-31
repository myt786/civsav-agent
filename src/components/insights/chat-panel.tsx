"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai";
import { SendIcon, WrenchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { InsightsAgentUIMessage } from "@/lib/agents/insights-agent";

const SUGGESTIONS = [
  "Which clients need attention this week?",
  "Who has the highest cost per lead?",
  "Any connectors currently failing to sync?",
];

export function ChatPanel() {
  const { messages, sendMessage, status } = useChat<InsightsAgentUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/insights/chat" }),
  });
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    sendMessage({ text: trimmed });
    setInput("");
  }

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium text-foreground">Ask about your clients</h2>
        <p className="text-xs text-muted-foreground">Grounded in the same live data as the dashboard — it looks numbers up, never guesses.</p>
      </div>

      <div className="flex max-h-96 flex-col gap-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => submit(s)}
                className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {status === "submitted" && <div className="text-xs text-muted-foreground">Thinking…</div>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="flex items-end gap-2 border-t border-border px-3 py-3"
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
          className="min-h-9 resize-none text-sm"
          rows={1}
        />
        <Button type="submit" size="icon-sm" disabled={busy || !input.trim()}>
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
    <div className={cn("flex flex-col gap-1.5", isUser ? "items-end" : "items-start")}>
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          return (
            <div
              key={i}
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
              )}
            >
              {part.text}
            </div>
          );
        }
        if (isToolUIPart(part)) {
          return (
            <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <WrenchIcon className="size-3" aria-hidden />
              {part.state === "output-available" ? `checked ${getToolName(part)}` : `checking ${getToolName(part)}…`}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
