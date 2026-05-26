// Client for the `reid-chat` Edge Function (the Anthropic proxy).
//
// We use `expo/fetch` rather than React Native's built-in fetch because only
// expo/fetch exposes a streaming `response.body` reader on native — RN's fetch
// buffers the whole body, which would defeat token streaming.

import { fetch as expoFetch } from 'expo/fetch';
import { EDGE_FUNCTION_URL, SUPABASE_ANON, getAccessToken } from './supabase';

const CHAT_URL = `${EDGE_FUNCTION_URL}/reid-chat`;

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type StreamOptions = {
  maxTokens?: number;
  model?: string;
  temperature?: number;
  signal?: AbortSignal;
};

function authHeaders(): Record<string, string> {
  // Prefer the verified user's token; fall back to anon (still a valid JWT, so
  // it passes the function's verify_jwt gate) for the rare pre-session case.
  const token = getAccessToken();
  return {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON,
    Authorization: `Bearer ${token ?? SUPABASE_ANON}`,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Stream a chat completion. Calls `onChunk` with each text delta as it arrives
 * and `onDone` with the full concatenated text when finished.
 *
 * Retries the INITIAL connection (network error or 5xx) up to 3 times with
 * exponential backoff. Once bytes start streaming we do not retry — partial
 * output is surfaced via onChunk and the final onDone reflects what arrived.
 */
export async function streamChat(
  messages: ChatMessage[],
  system: string,
  onChunk: (delta: string) => void,
  onDone: (full: string) => void,
  opts: StreamOptions = {},
): Promise<void> {
  const maxAttempts = 3;
  let lastErr: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await expoFetch(CHAT_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          messages,
          system,
          max_tokens: opts.maxTokens ?? 1024,
          model: opts.model,
          temperature: opts.temperature,
          stream: true,
        }),
        signal: opts.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        // Retry transient server errors; fail fast on 4xx (bad request / auth).
        if (res.status >= 500 && attempt < maxAttempts - 1) {
          lastErr = new Error(`reid-chat ${res.status}: ${detail}`);
          await sleep(2 ** attempt * 500);
          continue;
        }
        throw new Error(`reid-chat ${res.status}: ${detail}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('reid-chat: no response stream');

      const decoder = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const delta = decoder.decode(value, { stream: true });
        if (delta) {
          full += delta;
          onChunk(delta);
        }
      }
      onDone(full);
      return;
    } catch (err) {
      lastErr = err;
      // Don't retry user-initiated aborts.
      if ((err as { name?: string })?.name === 'AbortError') throw err;
      if (attempt < maxAttempts - 1) {
        await sleep(2 ** attempt * 500);
        continue;
      }
    }
  }
  throw lastErr ?? new Error('reid-chat: request failed');
}

/**
 * One-shot, non-streaming completion. Used by the session-summary engine,
 * which needs the full JSON response at once. Same backoff policy.
 */
export async function complete(
  messages: ChatMessage[],
  system: string,
  opts: StreamOptions = {},
): Promise<string> {
  const maxAttempts = 3;
  let lastErr: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await expoFetch(CHAT_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          messages,
          system,
          max_tokens: opts.maxTokens ?? 1024,
          model: opts.model,
          temperature: opts.temperature,
          stream: false,
        }),
        signal: opts.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        if (res.status >= 500 && attempt < maxAttempts - 1) {
          lastErr = new Error(`reid-chat ${res.status}: ${detail}`);
          await sleep(2 ** attempt * 500);
          continue;
        }
        throw new Error(`reid-chat ${res.status}: ${detail}`);
      }

      const data = (await res.json()) as { text?: string };
      return data.text ?? '';
    } catch (err) {
      lastErr = err;
      if ((err as { name?: string })?.name === 'AbortError') throw err;
      if (attempt < maxAttempts - 1) {
        await sleep(2 ** attempt * 500);
        continue;
      }
    }
  }
  throw lastErr ?? new Error('reid-chat: request failed');
}
