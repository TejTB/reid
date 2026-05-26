// Shared cross-cutting UI types. Lives in lib/ so hooks and components can both
// import it without a hooks -> components dependency.

export type OrbState = 'idle' | 'listening' | 'thinking' | 'responding';

export type UIMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
};

let _counter = 0;
/** Stable-enough local id for list keys (DB rows get their own gen_random_uuid). */
export function genId(prefix = 'm'): string {
  _counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${_counter}_${Math.random().toString(36).slice(2, 8)}`;
}
