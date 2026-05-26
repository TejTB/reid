// Reid's Picks — the founder's toolkit. Static defaults for Sprint 1;
// personalises over time in a later sprint.

export type PickCategory = 'Build' | 'Design' | 'Finance' | 'Grow';

export type Pick = {
  id: string;
  name: string;
  emoji: string;
  url: string;
  tagline: string;
  category: PickCategory;
};

export const PICKS: Pick[] = [
  { id: 'claude', name: 'Claude', emoji: '🤖', url: 'https://claude.ai', tagline: 'Your thinking partner', category: 'Build' },
  { id: 'notion', name: 'Notion', emoji: '📝', url: 'https://notion.so', tagline: 'Your second brain', category: 'Build' },
  { id: 'linear', name: 'Linear', emoji: '⚡', url: 'https://linear.app', tagline: 'Ship without the noise', category: 'Build' },
  { id: 'vercel', name: 'Vercel', emoji: '▲', url: 'https://vercel.com', tagline: 'Frontend in seconds', category: 'Build' },
  { id: 'stripe', name: 'Stripe', emoji: '💳', url: 'https://stripe.com', tagline: 'Start taking money', category: 'Finance' },
  { id: 'supabase', name: 'Supabase', emoji: '🗄️', url: 'https://supabase.com', tagline: 'Your backend, instant', category: 'Build' },
  { id: 'figma', name: 'Figma', emoji: '🎨', url: 'https://figma.com', tagline: 'Design at founder speed', category: 'Design' },
  { id: 'github', name: 'GitHub', emoji: '🐙', url: 'https://github.com', tagline: 'Where your code lives', category: 'Build' },
  { id: 'producthunt', name: 'Product Hunt', emoji: '🚀', url: 'https://producthunt.com', tagline: 'Your launch audience', category: 'Grow' },
  { id: 'yc', name: 'Y Combinator', emoji: '🔶', url: 'https://ycombinator.com', tagline: 'The founder playbook', category: 'Grow' },
];
