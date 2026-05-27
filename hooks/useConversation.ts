import { useSyncExternalStore } from "react";
import { subscribe, getSnapshot } from "@/lib/conversationStore";

/** Subscribe a component to the shared conversation (messages + sessionId). */
export function useConversation() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
