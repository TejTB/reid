// Reid chat proxy — keeps the Anthropic API key server-side.
//
// The app NEVER ships the Anthropic key. It calls this function with the user's
// Supabase JWT (verify_jwt = true, enforced by the Edge gateway). The function
// holds ANTHROPIC_API_KEY as a secret and proxies to the Anthropic Messages API.
//
// Request body:
//   { messages: {role,content}[], system?: string, max_tokens?: number,
//     stream?: boolean (default true), model?: string, temperature?: number }
//
// Streaming response: text/plain stream of token deltas (just the text).
// Non-streaming response: { text: string }.
//
// Set the secret before use:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (or via the dashboard)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-6";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!ANTHROPIC_API_KEY) {
    return json(
      { error: "Server not configured: ANTHROPIC_API_KEY secret is missing." },
      500,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: "`messages` must be a non-empty array" }, 400);
  }

  const stream = body.stream !== false; // default true
  const payload: Record<string, unknown> = {
    model: typeof body.model === "string" ? body.model : DEFAULT_MODEL,
    max_tokens: typeof body.max_tokens === "number" ? body.max_tokens : 1024,
    messages,
    stream,
  };
  if (typeof body.system === "string" && body.system.length > 0) {
    payload.system = body.system;
  }
  if (typeof body.temperature === "number") {
    payload.temperature = body.temperature;
  }

  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return json({ error: "Anthropic request failed", status: upstream.status, detail }, 502);
  }

  // Non-streaming: collect text blocks and return once.
  if (!stream) {
    const data = await upstream.json();
    const text = Array.isArray(data?.content)
      ? data.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("")
      : "";
    return json({ text });
  }

  // Streaming: parse Anthropic SSE, re-emit only the text deltas as a plain stream.
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === "" || dataStr === "[DONE]") continue;
            try {
              const evt = JSON.parse(dataStr);
              if (
                evt.type === "content_block_delta" &&
                evt.delta?.type === "text_delta" &&
                typeof evt.delta.text === "string"
              ) {
                controller.enqueue(encoder.encode(evt.delta.text));
              }
            } catch {
              // partial JSON across chunk boundary — ignore, it'll re-parse next pass
            }
          }
        }
      } catch (err) {
        controller.error(err);
        return;
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
});
