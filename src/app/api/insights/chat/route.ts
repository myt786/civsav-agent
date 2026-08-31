import { createAgentUIStreamResponse, type UIMessage } from "ai";
import { insightsAgent } from "@/lib/agents/insights-agent";

// Generous ceiling for a multi-tool-call turn (fleet snapshot + a couple of
// client-detail lookups), not a typical response time.
export const maxDuration = 60;

export async function POST(request: Request) {
  const { messages }: { messages: UIMessage[] } = await request.json();

  return createAgentUIStreamResponse({
    agent: insightsAgent,
    uiMessages: messages,
  });
}
