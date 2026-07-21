-- Fields for the AI-Powered Form Prefill / richer listings.
--   tags    — short keyword chips shown on the card/detail page
--   details — the extra AI-extracted fields we don't have dedicated columns for
--             (pricing, target audience, tech stack, FAQ, SEO, social links)
alter table public.startups add column if not exists tags text[];
alter table public.startups add column if not exists details jsonb;
