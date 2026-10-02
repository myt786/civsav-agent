"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart } from "ai";
import {
  AlertTriangleIcon,
  CheckIcon,
  CopyIcon,
  DollarSignIcon,
  MessageCircleIcon,
  PhoneMissedIcon,
  RefreshCwIcon,
  SendIcon,
  SparklesIcon,
  SquareIcon,
  SquarePenIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  WrenchIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { InsightsAgentUIMessage } from "@/lib/agents/insights-agent";

const SUGGESTIONS: { text: string; icon: typeof SparklesIcon }[] = [
  { text: "Which clients need attention this week?", icon: AlertTriangleIcon },
  { text: "Who has the highest cost per lead?", icon: DollarSignIcon },
  { text: "Whose leads dropped the most this week?", icon: TrendingDownIcon },
  { text: "Which clients are growing fastest?", icon: TrendingUpIcon },
  { text: "Who is missing the most calls?", icon: PhoneMissedIcon },
  { text: "Is any client's data not updating?", icon: RefreshCwIcon },
];

// Light formatting for answers: **bold**, "- " / "1. " lists and
// paragraphs. Plain React elements, so nothing in a reply can inject HTML.
function renderInline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
    chunk.startsWith("**") && chunk.endsWith("**") && chunk.length > 4 ? (
      <strong key={i} className="font-semibold">
        {chunk.slice(2, -2)}
      </strong>
    ) : (
      chunk
    ),
  );
}

function FormattedText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  // The list being collected, as plain values rather than a nullable object
  // (a nullable reassigned in a loop trips TypeScript's narrowing).
  let listItems: string[] = [];
  let listOrdered = false;
  const flush = () => {
    if (listItems.length === 0) return;
    const items = listItems.map((item, i) => <li key={i}>{renderInline(item)}</li>);
    blocks.push(
      listOrdered ? (
        <ol key={blocks.length} className="ml-4 list-decimal space-y-0.5">
          {items}
        </ol>
      ) : (
        <ul key={blocks.length} className="ml-4 list-disc space-y-0.5">
          {items}
        </ul>
      ),
    );
    listItems = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const item = bullet?.[1] ?? numbered?.[1];
    if (item !== undefined) {
      const ordered = numbered !== null && bullet === null;
      if (listItems.length > 0 && listOrdered !== ordered) flush();
      listOrdered = ordered;
      listItems.push(item);
      continue;
    }
    flush();
    if (line.trim() === "") continue;
    blocks.push(<p key={blocks.length}>{renderInline(line)}</p>);
  }
  flush();
  return <div className="flex flex-col gap-2">{blocks}</div>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked — nothing to do.
        }
      }}
      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label="Copy answer"
    >
      {copied ? <CheckIcon className="size-3 text-success" /> : <CopyIcon className="size-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

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
  const { messages, sendMessage, status, regenerate, stop, setMessages } = useChat<InsightsAgentUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/insights/chat" }),
  });
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";
  const scrollRef = useRef<HTMLDivElement>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  // Grows with what's typed, up to the max height, then scrolls.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  function newChat() {
    if (busy) stop();
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  }

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    sendMessage({ text: trimmed });
    setInput("");
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-border py-3 pr-12 pl-4">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MessageCircleIcon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">Ask about your clients</h2>
          <p className="truncate text-xs text-muted-foreground">Answers come from the same numbers as the dashboard.</p>
        </div>
        {messages.length > 0 && (
          <Button type="button" size="sm" variant="ghost" onClick={newChat} title="Start a new conversation">
            <SquarePenIcon className="size-3.5" />
            New chat
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex flex-1 flex-col justify-center gap-5">
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <SparklesIcon className="size-6" aria-hidden />
              </span>
              <p className="text-base font-semibold text-foreground">What would you like to know?</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Ask about leads, spend, calls, rankings — across all clients or one by name.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map(({ text, icon: Icon }) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => submit(text)}
                  className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-3 text-left text-sm text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  {text}
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
              <span>Something went wrong answering that. Please try again.</span>
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
        className="flex items-end gap-2 border-t border-border bg-muted/30 px-3 pt-3 pb-1.5"
      >
        <Textarea
          ref={inputRef}
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
        {busy ? (
          <Button type="button" size="icon-sm" variant="outline" className="rounded-full" onClick={() => stop()} title="Stop">
            <SquareIcon className="size-3 fill-current" aria-hidden />
            <span className="sr-only">Stop</span>
          </Button>
        ) : (
          <Button type="submit" size="icon-sm" className="rounded-full" disabled={!input.trim()}>
            <SendIcon className="size-3.5" aria-hidden />
            <span className="sr-only">Send</span>
          </Button>
        )}
      </form>
      <p className="bg-muted/30 px-4 pb-2 text-[11px] text-muted-foreground">
        Enter to send · Shift+Enter for a new line · Answers can be wrong — check important numbers on the dashboard.
      </p>
    </div>
  );
}

// The agent's tools have code names (getFleetSnapshot…); show what each
// one is actually doing instead.
const TOOL_LABELS: Record<string, [string, string]> = {
  getFleetSnapshot: ["Looking at all your clients…", "Looked at all your clients"],
  getClientDetail: ["Looking at this client in detail…", "Looked at this client in detail"],
  getSyncStatus: ["Checking when data last updated…", "Checked when data last updated"],
};

function toolLabel(name: string, done: boolean): string {
  const labels = TOOL_LABELS[name] ?? ["Looking up the numbers…", "Looked up the numbers"];
  return done ? labels[1] : labels[0];
}

function ChatMessage({ message }: { message: InsightsAgentUIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex items-start gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
      <Avatar role={isUser ? "user" : "assistant"} />
      <div className={cn("flex min-w-0 flex-col gap-1.5", isUser ? "items-end" : "items-start")}>
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            if (isUser) {
              return (
                <div
                  key={i}
                  className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground [overflow-wrap:anywhere]"
                >
                  {part.text}
                </div>
              );
            }
            return (
              <div key={i} className="flex max-w-[92%] flex-col items-start gap-1">
                <div className="rounded-2xl rounded-tl-sm border border-border bg-card px-3.5 py-2.5 text-sm leading-relaxed text-foreground shadow-sm [overflow-wrap:anywhere]">
                  <FormattedText text={part.text} />
                </div>
                {part.text.trim() && <CopyButton text={part.text} />}
              </div>
            );
          }
          if (isToolUIPart(part)) {
            return (
              <div key={i} className="flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">
                <WrenchIcon className="size-3" aria-hidden />
                {toolLabel(getToolName(part), part.state === "output-available")}
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
