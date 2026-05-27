import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as store from "../conversationStore.ts";

beforeEach(() => store.__resetForTest());

test("append / appendMany / getSnapshot", () => {
  store.append({ role: "user", content: "hi" });
  store.appendMany([{ role: "assistant", content: "hey" }, { role: "user", content: "yo" }]);
  assert.deepEqual(store.getSnapshot().messages.map((m) => m.content), ["hi", "hey", "yo"]);
});

test("replaceLast and dropLast", () => {
  store.append({ role: "assistant", content: "partial" });
  store.replaceLast({ role: "assistant", content: "final" });
  assert.equal(store.getSnapshot().messages.at(-1)?.content, "final");
  store.dropLast();
  assert.equal(store.getSnapshot().messages.length, 0);
});

test("setSessionId / setMessages / reset", () => {
  store.setSessionId("abc");
  store.setMessages([{ role: "user", content: "x" }]);
  assert.equal(store.getSnapshot().sessionId, "abc");
  assert.equal(store.getSnapshot().messages.length, 1);
  store.reset();
  assert.deepEqual(store.getSnapshot(), { messages: [], sessionId: null });
});

test("subscribe fires on change and snapshot identity is stable until mutation", () => {
  let calls = 0;
  const unsub = store.subscribe(() => { calls += 1; });
  const before = store.getSnapshot();
  store.append({ role: "user", content: "a" });
  assert.equal(calls, 1);
  assert.notEqual(store.getSnapshot(), before);
  unsub();
  store.append({ role: "user", content: "b" });
  assert.equal(calls, 1);
});
