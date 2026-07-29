// Single source of truth for listing categories.
// NOTE: keep in sync with the LLM constraint list in
// supabase/functions/ai-prefill/index.ts (it can only return one of these).
export const CATEGORIES = [
  { value: 'AI/ML', emoji: '🤖' },
  { value: 'SaaS', emoji: '⚡' },
  { value: 'Developer Tools', emoji: '👨‍💻' },
  { value: 'Productivity', emoji: '📊' },
  { value: 'Design', emoji: '🎨' },
  { value: 'Web App', emoji: '🌐' },
  { value: 'Mobile App', emoji: '📱' },
  { value: 'Chrome Extension', emoji: '🧩' },
  { value: 'API/Service', emoji: '🔗' },
  { value: 'Marketing', emoji: '📈' },
  { value: 'E-commerce', emoji: '🛒' },
  { value: 'Social', emoji: '👥' },
  { value: 'Education', emoji: '📚' },
  { value: 'Health & Fitness', emoji: '🏃‍♂️' },
  { value: 'Gaming', emoji: '🎮' },
  { value: 'Other', emoji: '📦' },
];

// A listing can belong to up to 3 categories. The first one picked is the
// primary category (written to startups.category for browsing/filtering);
// the full list lives in details.categories.
export const MAX_CATEGORIES = 3;

// How the product itself is priced (details.pricing_model). Mirrors the enum
// the ai-prefill function returns for `pricing`.
export const PRICING_MODELS = [
  { value: 'Free', label: 'Free' },
  { value: 'Freemium', label: 'Freemium — free plan + paid tiers' },
  { value: 'Paid', label: 'Paid — one-time purchase' },
  { value: 'Subscription', label: 'Subscription' },
];
