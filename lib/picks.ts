// Reid's Picks — the founder toolkit Reid recommends. File-sourced (not DB):
// a curated, versioned default set. Inline-in-chat pick cards are Sprint 5.

export type Pick = {
  id: string;
  name: string;
  tagline: string;
  url: string;
};

export const PICKS: Pick[] = [
  { id: "claude", name: "Claude", tagline: "Your thinking partner", url: "https://claude.ai" },
  { id: "notion", name: "Notion", tagline: "Where the plan lives", url: "https://notion.so" },
  { id: "linear", name: "Linear", tagline: "Ship without the noise", url: "https://linear.app" },
  { id: "vercel", name: "Vercel", tagline: "Deploy in seconds", url: "https://vercel.com" },
  { id: "stripe", name: "Stripe", tagline: "Get paid", url: "https://stripe.com" },
  { id: "supabase", name: "Supabase", tagline: "Backend in an afternoon", url: "https://supabase.com" },
  { id: "figma", name: "Figma", tagline: "Design it real", url: "https://figma.com" },
  { id: "github", name: "GitHub", tagline: "Where the code lives", url: "https://github.com" },
  { id: "producthunt", name: "Product Hunt", tagline: "Launch loud", url: "https://producthunt.com" },
  { id: "yc", name: "Y Combinator", tagline: "Apply anyway", url: "https://ycombinator.com" },
];
