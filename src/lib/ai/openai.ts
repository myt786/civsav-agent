import "server-only";
import { z } from "zod";

// OpenAI, called directly over its REST API with the team's own key
// (OPENAI_API_KEY in Vercel). No extra SDK package: one JSON request in,
// one JSON object out, checked against a zod schema before anything uses
// it. OPENAI_MODEL switches the model without a code change.

export const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";

export function openAiModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

export class AiError extends Error {}

export async function openAiJson<S extends z.ZodType>({
  instructions,
  prompt,
  schema,
  model = openAiModel(),
  temperature = 0.4,
}: {
  instructions: string;
  prompt: string;
  schema: S;
  model?: string;
  temperature?: number;
}): Promise<{ output: z.infer<S>; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AiError("OPENAI_API_KEY isn't set in Vercel.");

  // The model is told the exact shape it must return; json_object mode
  // guarantees valid JSON, and zod checks the shape.
  const shape = JSON.stringify(z.toJSONSchema(schema));
  const messages = [
    { role: "system", content: `${instructions}\n\nReply with one JSON object only, matching this JSON Schema exactly:\n${shape}` },
    { role: "user", content: prompt },
  ];

  let lastProblem = "";
  // One retry if the reply doesn't match the shape.
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature,
        response_format: { type: "json_object" },
        messages:
          attempt === 0
            ? messages
            : [...messages, { role: "user", content: `Your last reply didn't match the schema (${lastProblem}). Reply again with valid JSON only.` }],
      }),
    });
    const body = (await response.json().catch(() => null)) as
      | { choices?: { message?: { content?: string } }[]; error?: { message?: string } }
      | null;
    if (!response.ok) {
      const message = body?.error?.message ?? `HTTP ${response.status}`;
      throw new AiError(
        response.status === 401
          ? "OpenAI didn't accept the API key — check OPENAI_API_KEY in Vercel."
          : response.status === 404
            ? `OpenAI model "${model}" isn't available on this key — set OPENAI_MODEL in Vercel.`
            : response.status === 429
              ? "OpenAI rate limit or quota reached — try again in a minute, or check the OpenAI account's billing."
              : `OpenAI error: ${message}`,
      );
    }
    const content = body?.choices?.[0]?.message?.content ?? "";
    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      lastProblem = "not valid JSON";
      continue;
    }
    const parsed = schema.safeParse(json);
    if (parsed.success) return { output: parsed.data as z.infer<S>, model };
    lastProblem = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
  }
  throw new AiError(`The AI's reply couldn't be read (${lastProblem}). Please try again.`);
}
