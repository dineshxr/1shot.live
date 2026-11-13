// Product categories that get a /category/:slug landing page (api/category.js).
// Hand-curated allowlist with hand-written copy: a category only belongs here
// once it has enough live listings to make a useful page (the junk "Other"
// bucket deliberately has none). api/sitemap.js, api/startup.js and
// api/blog.js import this so every link to a category page stays in sync.

export const CATEGORIES = {
  'saas': {
    db: 'SaaS', name: 'SaaS Products',
    h1: 'Best New SaaS Products',
    blurb: 'Every SaaS product launched on SubmitHunt, ranked by community upvotes. B2B platforms, subscription tools, and software businesses — each with a live listing, maker details, and a link to try it.',
  },
  'ai-ml': {
    db: 'AI/ML', name: 'AI & Machine Learning Tools',
    h1: 'Best New AI Tools',
    blurb: 'New AI tools and machine-learning products launching now: assistants, generators, copilots, and AI infrastructure. Ranked by upvotes from the makers and early adopters who tried them first.',
  },
  'productivity': {
    db: 'Productivity', name: 'Productivity Tools',
    h1: 'Best New Productivity Tools',
    blurb: 'Task managers, note apps, calendars, focus tools, and workflow automations launched by indie makers — ranked by the community. Find your next productivity upgrade before it hits the mainstream.',
  },
  'marketing': {
    db: 'Marketing', name: 'Marketing Tools',
    h1: 'Best New Marketing Tools',
    blurb: 'Fresh marketing software from indie makers: SEO tools, social schedulers, email platforms, analytics, and growth utilities — ranked by upvotes, each with a live listing and maker story.',
  },
  'web-app': {
    db: 'Web App', name: 'Web Apps',
    h1: 'Best New Web Apps',
    blurb: 'Browser-based products launched on SubmitHunt — no installs, just URLs. Discover new web apps across every niche, ranked by community upvotes.',
  },
  'e-commerce': {
    db: 'E-commerce', name: 'E-commerce Tools',
    h1: 'Best New E-commerce Tools',
    blurb: 'Storefront builders, checkout tools, dropshipping utilities, and merchant analytics launched by founders — ranked by upvotes from the community.',
  },
  'developer-tools': {
    db: 'Developer Tools', name: 'Developer Tools',
    h1: 'Best New Developer Tools',
    blurb: 'APIs, CLIs, IDE extensions, deployment platforms, and code utilities built by developers for developers — ranked by upvotes from makers who actually shipped with them.',
  },
  'design': {
    db: 'Design', name: 'Design Tools',
    h1: 'Best New Design Tools',
    blurb: 'New design software from indie makers: UI kits, icon sets, mockup generators, color tools, and creative utilities — ranked by community upvotes.',
  },
  'education': {
    db: 'Education', name: 'Education Tools',
    h1: 'Best New Education Tools',
    blurb: 'Learning platforms, course builders, flashcard apps, and study tools launched on SubmitHunt — ranked by upvotes from learners and educators.',
  },
  'health-fitness': {
    db: 'Health & Fitness', name: 'Health & Fitness Apps',
    h1: 'Best New Health & Fitness Apps',
    blurb: 'Workout trackers, nutrition apps, sleep tools, and wellness products launched by indie makers — ranked by the community.',
  },
  'mobile-app': {
    db: 'Mobile App', name: 'Mobile Apps',
    h1: 'Best New Mobile Apps',
    blurb: 'iOS and Android apps launched on SubmitHunt — utilities, games, social tools, and more, ranked by upvotes from early adopters.',
  },
  'gaming': {
    db: 'Gaming', name: 'Gaming Products',
    h1: 'Best New Gaming Products',
    blurb: 'Indie games, gaming tools, and player utilities launched on SubmitHunt — ranked by community upvotes.',
  },
  'social': {
    db: 'Social', name: 'Social Apps',
    h1: 'Best New Social Apps',
    blurb: 'Community platforms, messaging tools, and social products launched by indie makers — ranked by upvotes.',
  },
  'api-service': {
    db: 'API/Service', name: 'APIs & Developer Services',
    h1: 'Best New APIs & Services',
    blurb: 'Third-party APIs, backend services, and infrastructure products launched on SubmitHunt — ranked by the developers who use them.',
  },
  'chrome-extension': {
    db: 'Chrome Extension', name: 'Chrome Extensions',
    h1: 'Best New Chrome Extensions',
    blurb: 'Browser extensions launched by indie makers — productivity boosters, dev tools, and utilities that live in your toolbar, ranked by upvotes.',
  },
};

// DB category value (startups.category) -> slug, for linking from listings.
export const CATEGORY_SLUG_BY_DB = Object.fromEntries(
  Object.entries(CATEGORIES).map(([slug, c]) => [c.db, slug])
);

export const categoryPath = (dbCategory) => {
  const slug = CATEGORY_SLUG_BY_DB[dbCategory];
  return slug ? `/category/${slug}` : null;
};
