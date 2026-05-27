export type Msg = { role: "user" | "assistant"; content: string };
export type ConversationSnapshot = { messages: Msg[]; sessionId: string | null };

let snapshot: ConversationSnapshot = { messages: [], sessionId: null };
const listeners = new Set<() => void>();

function set(next: ConversationSnapshot): void {
  snapshot = next;
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getSnapshot(): ConversationSnapshot {
  return snapshot;
}

export function setMessages(messages: Msg[]): void {
  set({ ...snapshot, messages });
}

export function append(msg: Msg): void {
  set({ ...snapshot, messages: [...snapshot.messages, msg] });
}

export function appendMany(msgs: Msg[]): void {
  set({ ...snapshot, messages: [...snapshot.messages, ...msgs] });
}

export function replaceLast(msg: Msg): void {
  const m = snapshot.messages;
  if (m.length === 0) { append(msg); return; }
  set({ ...snapshot, messages: [...m.slice(0, -1), msg] });
}

export function dropLast(): void {
  set({ ...snapshot, messages: snapshot.messages.slice(0, -1) });
}

export function setSessionId(sessionId: string | null): void {
  set({ ...snapshot, sessionId });
}

export function reset(): void {
  set({ messages: [], sessionId: null });
}

/** Test-only: clear module singleton state between tests. */
export function __resetForTest(): void {
  snapshot = { messages: [], sessionId: null };
  listeners.clear();
}
