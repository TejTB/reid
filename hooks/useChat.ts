import { useCallback, useRef, useState } from 'react';
import { streamChat, type ChatMessage } from '../lib/anthropic';
import { supabase } from '../lib/supabase';
import { genId, type OrbState, type UIMessage } from '../lib/types';

export type UseChatOptions = {
  /** System prompt for this conversation. */
  system: string;
  model?: string;
  maxTokens?: number;
  /** Persist messages to a sessions row (creates one lazily on first message). */
  persist?: { profileId: string; mode: 'chat' | 'onboarding' };
  /** A static opening line from Reid, shown before the user speaks. */
  initialAssistantMessage?: string;
  /** Fired after each assistant turn fully completes. */
  onAssistantComplete?: (fullText: string, allMessages: UIMessage[]) => void;
};

export type UseChat = {
  messages: UIMessage[];
  isStreaming: boolean;
  orbState: OrbState;
  sessionId: string | null;
  send: (text: string) => Promise<void>;
  /** Drive the orb to 'listening' while the user is composing. */
  setComposing: (composing: boolean) => void;
};

/**
 * The Anthropic API requires the message list to start with a user turn and to
 * alternate roles. Our UI may open with a seeded assistant line, so prepend a
 * minimal user turn when needed.
 */
function normalizeForApi(messages: UIMessage[]): ChatMessage[] {
  const mapped: ChatMessage[] = messages
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content }));
  if (mapped.length > 0 && mapped[0].role === 'assistant') {
    return [{ role: 'user', content: 'Begin.' }, ...mapped];
  }
  return mapped;
}

export function useChat(opts: UseChatOptions): UseChat {
  const [messages, setMessages] = useState<UIMessage[]>(
    opts.initialAssistantMessage
      ? [{ id: genId('a'), role: 'assistant', content: opts.initialAssistantMessage }]
      : [],
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const sessionIdRef = useRef<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const messagesRef = useRef<UIMessage[]>(messages);
  messagesRef.current = messages;

  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (!opts.persist) return null;
    if (sessionIdRef.current) return sessionIdRef.current;
    const { data, error } = await supabase
      .from('sessions')
      .insert({ user_id: opts.persist.profileId, mode: opts.persist.mode, started_at: new Date().toISOString() })
      .select('id')
      .single();
    if (error || !data) return null;
    sessionIdRef.current = data.id as string;
    setSessionId(sessionIdRef.current);
    return sessionIdRef.current;
  }, [opts.persist]);

  const persistMessage = useCallback(
    async (role: 'user' | 'assistant', content: string) => {
      if (!opts.persist || !content.trim()) return;
      const sid = await ensureSession();
      if (!sid) return;
      await supabase.from('messages').insert({
        session_id: sid,
        user_id: opts.persist.profileId,
        role,
        content,
      });
    },
    [opts.persist, ensureSession],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      const userMsg: UIMessage = { id: genId('u'), role: 'user', content: trimmed };
      const history = [...messagesRef.current, userMsg];
      setMessages(history);
      setIsStreaming(true);
      setOrbState('thinking');

      void persistMessage('user', trimmed);

      const assistantId = genId('a');
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', streaming: true }]);

      let first = true;
      let full = '';
      try {
        await streamChat(
          normalizeForApi(history),
          opts.system,
          (delta) => {
            if (first) {
              setOrbState('responding');
              first = false;
            }
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + delta } : m)),
            );
          },
          (f) => {
            full = f;
          },
          { model: opts.model, maxTokens: opts.maxTokens },
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content || 'I lost the thread for a second. Say that again?', streaming: false }
              : m,
          ),
        );
        setIsStreaming(false);
        setOrbState('idle');
        return;
      }

      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)));
      setIsStreaming(false);
      setOrbState('idle');

      void persistMessage('assistant', full);
      opts.onAssistantComplete?.(full, messagesRef.current);
    },
    [isStreaming, opts, persistMessage],
  );

  const setComposing = useCallback(
    (composing: boolean) => {
      if (isStreaming) return;
      setOrbState(composing ? 'listening' : 'idle');
    },
    [isStreaming],
  );

  return { messages, isStreaming, orbState, sessionId, send, setComposing };
}
