-- Three keyword-targeted guide posts filling the biggest gaps in the content
-- map (checked against GSC 2026-08-10: zero existing rankings for any of
-- these; no cannibalization with the 20260618 keyword posts):
--   product hunt alternatives        - the head keyword of the whole niche;
--                                      the homepage title targets it but no
--                                      dedicated page exists
--   free dofollow backlinks (sites)  - highest-intent query for the core value
--                                      prop; distinct from the how-to angle of
--                                      build-quality-backlinks-startup-website
--   submit ai tool / ai directories  - biggest category (337 live listings);
--                                      pairs with the new /category/ai-ml page
-- DR figures and pricing labels are copied from api/directory.js (measured
-- 2026-07-28) so the posts never claim numbers the directory page contradicts.
-- Same conventions as 20260618000000_insert_seo_keyword_blog_posts.sql:
-- startup_id NULL, dollar-quoted $html$ content, generated_by 'manual'.

-- 1) "product hunt alternatives"
INSERT INTO blog_posts (title, slug, content, excerpt, meta_description, keywords, category, author_name, is_published, generated_by)
VALUES (
  '15 Best Product Hunt Alternatives for Your 2026 Launch (Ranked by DR)',
  'product-hunt-alternatives',
  $html$<article class="blog-post">
  <h2>Why founders look beyond Product Hunt</h2>
  <p>Product Hunt is still the best-known launch platform, and with a Domain Rating of 91 it deserves a spot in every launch plan. But it has real limitations: launch day is a lottery decided by the algorithm and whoever else ships that day, the homepage increasingly favors well-networked teams with hunter connections, and the backlink you get is nofollow — it sends traffic, not SEO authority. Most launches get their spike, drop off the feed within 48 hours, and never see PH traffic again.</p>
  <p>The good news: "launch platform" is no longer one site. In 2026 there is a healthy ecosystem of Product Hunt alternatives — some with bigger audiences in specific niches, some with dofollow backlinks that keep working long after launch day, and some where a small indie project can actually reach #1. This guide ranks the 15 worth your time, with Ahrefs Domain Rating (DR) for each so you can judge the SEO value at a glance.</p>

  <h2>What actually matters in a launch platform</h2>
  <ul>
    <li><strong>Audience fit</strong> — 500 developers who care beat 50,000 random visitors. Match the platform to your product.</li>
    <li><strong>Link type</strong> — a <strong>dofollow</strong> link passes SEO authority to your domain; nofollow links bring traffic only. A good launch plan collects both (see our guide to <a href="/blog/directory-backlinks-seo-weapon-startups">directory backlinks as an SEO strategy</a>).</li>
    <li><strong>Evergreen value</strong> — does your listing keep existing (and ranking) after launch week, or does it vanish into an archive?</li>
    <li><strong>Cost</strong> — most of this list is free. Pay only where the audience or the link justifies it.</li>
  </ul>

  <h2>The 15 best Product Hunt alternatives in 2026</h2>

  <h3>1. SubmitHunt — DR 37, free, dofollow</h3>
  <p><em>Disclosure: this is our platform.</em> <a href="/submit">Submit your startup</a> and you get a same-week launch slot, a permanent product page, community upvotes, and a dofollow backlink from this DR 37 domain — free. Paid plans ($20–50, one-time) skip the queue and add featured placement. Where Product Hunt buries you after launch day, your SubmitHunt listing, <a href="/blog">review post</a>, and <a href="/category/saas">category page</a> placement stay live and indexable. Browse the <a href="/">current launches</a> to see how listings look.</p>

  <h3>2. Hacker News (Show HN) — DR 91, free, nofollow</h3>
  <p>The highest-leverage free launch in tech, and the hardest crowd. A Show HN that resonates can send tens of thousands of visitors in a day. Read the Show HN guidelines, post your actual product URL, be in the comments all day, and don't use marketing language — HN punishes it.</p>

  <h3>3. Reddit — DR 91, free, nofollow</h3>
  <p>r/SideProject, r/InternetIsBeautiful, r/startups, and your niche subreddits. Bigger potential reach than Product Hunt, but every subreddit has its own self-promotion rules and enforcement is unforgiving. We wrote a dedicated guide on <a href="/blog/submit-your-startup-reddit">launching on Reddit without getting banned</a>.</p>

  <h3>4. AlternativeTo — DR 88, free, dofollow</h3>
  <p>Not a launch feed — a "software like X" directory with massive evergreen search traffic. List your product as an alternative to the incumbent in your space and you inherit a slice of that comparison demand for years. One of the best pure-SEO listings available, and the link is dofollow.</p>

  <h3>5. Wellfound (AngelList) — DR 88, free, nofollow</h3>
  <p>Primarily a hiring and fundraising platform, but a complete company profile here doubles as social proof for investors and candidates who will search for you either way.</p>

  <h3>6. DEV Community — DR 90, free, dofollow</h3>
  <p>For developer tools, a well-written launch post on dev.to routinely outperforms a Product Hunt launch. You get an engaged technical audience and dofollow links from a DR 90 domain in your article body.</p>

  <h3>7. SourceForge — DR 92, freemium, dofollow</h3>
  <p>Feels dated, still enormous: SourceForge pages rank for almost every software category query, and the vendor profile link is dofollow from a DR 92 domain. Worth the setup time for any downloadable or B2B software.</p>

  <h3>8. Indie Hackers — DR 76, free, dofollow</h3>
  <p>The community where building in public actually works. Create a product page, post milestones, and share real numbers — transparent revenue posts reliably outperform launch announcements here.</p>

  <h3>9. BetaList — DR 73, freemium, dofollow</h3>
  <p>The place to launch <em>before</em> you launch: BetaList features pre-launch startups collecting early-access signups. Free submission with a wait; a one-time fee skips the queue. Do it 2–4 weeks before your main launch to build a waitlist.</p>

  <h3>10. F6S — DR 78, free, dofollow</h3>
  <p>Startup profiles tied to accelerator applications, grants, and deals. The profile is quick to create, the link is dofollow, and many programs ask for your F6S page anyway.</p>

  <h3>11. Nick Launches — DR 68, freemium, dofollow</h3>
  <p>A curated indie launch platform with a genuinely engaged audience and verified dofollow product links from a DR 68 domain. Smaller feed means far better odds of being seen than a crowded PH Tuesday.</p>

  <h3>12. There's An AI For That — DR 72, paid, dofollow</h3>
  <p>The biggest AI-specific directory, with serious category search traffic. Listing is paid now, so it only makes sense for AI products — if that's you, see our full guide to <a href="/blog/submit-ai-tool-directories">AI tool directories</a> before paying anyone.</p>

  <h3>13. Startup Stash — DR 71, freemium, dofollow</h3>
  <p>A long-running tools directory organized by category. Evergreen listing, dofollow link, and decent referral traffic for productivity and marketing tools.</p>

  <h3>14. SaaSHub — DR 64, freemium, dofollow</h3>
  <p>Alternatives-and-reviews site like a leaner AlternativeTo, focused on SaaS. Free listing, dofollow link, and its comparison pages ("X vs Y") rank surprisingly well.</p>

  <h3>15. PitchWall — DR 40, free, dofollow</h3>
  <p>A smaller Product Hunt-style feed where new products get real visibility for days rather than hours. Lower DR, but free, dofollow, and low effort.</p>

  <h2>How to sequence a multi-platform launch</h2>
  <ol>
    <li><strong>2–4 weeks out:</strong> BetaList for the waitlist; set up AlternativeTo, F6S, and Wellfound profiles.</li>
    <li><strong>Launch week:</strong> pick one flagship day for Product Hunt or Show HN. Launch on <a href="/submit">SubmitHunt</a> and the smaller feeds the same week — momentum compounds across platforms.</li>
    <li><strong>After:</strong> work through the evergreen directories (our <a href="/directory">ranked directory list</a> covers 47 of them with DR and pricing), then keep shipping — every platform above rewards updates.</li>
  </ol>
  <p>For the traffic side of the equation, read <a href="/blog/get-first-1000-users-startup-launch-strategy">how to get your first 1,000 users</a>; for the SEO side, <a href="/blog/free-dofollow-backlinks-for-startups">free dofollow backlinks for startups</a>.</p>

  <h2>FAQ</h2>
  <h3>Is Product Hunt still worth it in 2026?</h3>
  <p>Yes — as one launch among several, not the whole plan. The audience is real, but the algorithm is unpredictable and the backlink is nofollow, so pair it with platforms whose value persists.</p>
  <h3>Which alternatives give dofollow backlinks?</h3>
  <p>From this list: SubmitHunt, AlternativeTo, DEV Community, SourceForge, Indie Hackers, BetaList, F6S, Nick Launches, There's An AI For That, Startup Stash, SaaSHub, and PitchWall. That mix of DR 37–92 dofollow sources is a legitimate SEO foundation for a new domain.</p>
  <h3>Can I launch on multiple platforms at once?</h3>
  <p>Yes. Platforms don't penalize it, and the compounding attention helps everywhere. Keep your tagline and screenshots consistent so your brand reads the same on every feed.</p>
</article>$html$,
  'Product Hunt is one launch among many now. The 15 best alternatives in 2026, ranked by Ahrefs DR, with link type (dofollow vs nofollow) and cost for each.',
  'The 15 best Product Hunt alternatives for 2026, ranked by Domain Rating — free and paid launch platforms compared, with dofollow backlink status for each.',
  ARRAY['product hunt alternatives', 'product hunt alternative', 'launch platforms', 'sites like product hunt', 'where to launch startup', 'best launch platforms 2026'],
  'directories',
  'SubmitHunt Team',
  true,
  'manual'
);

-- 2) "free dofollow backlinks"
INSERT INTO blog_posts (title, slug, content, excerpt, meta_description, keywords, category, author_name, is_published, generated_by)
VALUES (
  'Free Dofollow Backlinks for Startups: 18 Sites That Actually Pass SEO Value (2026)',
  'free-dofollow-backlinks-for-startups',
  $html$<article class="blog-post">
  <h2>What a dofollow backlink is (and why founders chase them)</h2>
  <p>Every link on the web either passes SEO authority to the page it points at, or tells search engines not to count it (<code>rel="nofollow"</code>, <code>rel="ugc"</code>, <code>rel="sponsored"</code>). A <strong>dofollow</strong> link — really just a link with none of those attributes — is a vote: it transfers a slice of the linking site's authority to yours. Collect enough votes from reputable domains and your own Domain Rating climbs, which lifts every page on your site in search.</p>
  <p>Agencies charge $50–$200 per placement for exactly this. But early-stage startups don't need to buy links: a surprising number of legitimate, high-DR platforms give dofollow links to any product that completes a listing. This is the current list — every entry verified for link type, with Ahrefs DR as of July 2026 (the same data behind our <a href="/directory">ranked submission directory</a>).</p>

  <h2>How to verify a link is dofollow (30 seconds)</h2>
  <ol>
    <li>Open a live listing page on the platform — not the homepage, an actual product page like yours would be.</li>
    <li>Right-click the outbound link to the product's website and choose <em>Inspect</em>.</li>
    <li>Read the <code>&lt;a&gt;</code> tag: if <code>rel</code> contains <code>nofollow</code>, <code>ugc</code>, or <code>sponsored</code>, it passes no authority. If those tokens are absent, it's dofollow.</li>
  </ol>
  <p>Directories change their policies quietly, so check before you invest effort. We re-verify the claims below periodically and mark anything we haven't confirmed as such on the <a href="/directory">directory page</a>.</p>

  <h2>18 free (or freemium) dofollow sources, highest DR first</h2>
  <ul>
    <li><strong>GitHub — DR 96.</strong> A public repo README with your product link. For anything with a technical surface (CLI, SDK, open-source core), this is the single highest-DR dofollow link a startup can get for free.</li>
    <li><strong>SourceForge — DR 92.</strong> Vendor profile + listing for software products. Dated interface, enormous authority, dofollow.</li>
    <li><strong>DEV Community — DR 90.</strong> Links inside your posts are dofollow. Write a real technical article about how you built something; a link dump gets flagged.</li>
    <li><strong>Softpedia — DR 88.</strong> Software directory that still indexes and ranks; free submission, dofollow.</li>
    <li><strong>AlternativeTo — DR 88.</strong> List your product as an alternative to your biggest competitor. Evergreen comparison traffic plus a dofollow link.</li>
    <li><strong>F6S — DR 78.</strong> Startup profile, free, dofollow. Doubles as your identity for accelerator and grant applications.</li>
    <li><strong>Indie Hackers — DR 76.</strong> Product page links are dofollow. The community rewards build-in-public posts far more than launch announcements.</li>
    <li><strong>BetaList — DR 73.</strong> Pre-launch listing with a dofollow link; free with a queue, paid skip available.</li>
    <li><strong>Land-book — DR 73.</strong> Design gallery: if your landing page looks good, a free submission earns a dofollow link and design-community traffic.</li>
    <li><strong>SaaSworthy — DR 72.</strong> SaaS directory, freemium, dofollow. Categories rank well for "best X software" queries.</li>
    <li><strong>Futurepedia — DR 71.</strong> One of the two AI directories that matter (see our <a href="/blog/submit-ai-tool-directories">AI directory guide</a>). Freemium, dofollow.</li>
    <li><strong>Startup Stash — DR 71.</strong> Category-organized tools directory, freemium, dofollow.</li>
    <li><strong>Nick Launches — DR 68.</strong> Curated indie launch platform; product links verified dofollow.</li>
    <li><strong>Toolify — DR 65.</strong> Large AI tools directory, freemium, dofollow.</li>
    <li><strong>SaaSHub — DR 64.</strong> Alternatives site for SaaS; free listing, dofollow, ranking comparison pages.</li>
    <li><strong>AI Tool Hunt — DR 41.</strong> Smaller AI directory, free, dofollow.</li>
    <li><strong>PitchWall — DR 40.</strong> Product Hunt-style feed, free, dofollow.</li>
    <li><strong>SubmitHunt — DR 37.</strong> <em>Ours.</em> <a href="/submit">Submit free</a>, get a listing plus a dofollow badge backlink; every launch also gets a dedicated <a href="/blog">review post</a> and a spot on its <a href="/category/saas">category page</a>. Paid plans add a guaranteed placement link.</li>
  </ul>

  <h2>Getting the most from each link</h2>
  <ul>
    <li><strong>Link to your homepage</strong> unless you have a strong reason not to — it distributes authority across your site via your own internal links.</li>
    <li><strong>Keep anchors natural.</strong> Your product name is the right anchor text almost every time. Directories set the anchor anyway; never try to force "best crm software" as your anchor — that pattern is what link-spam detection looks for.</li>
    <li><strong>Complete every profile.</strong> Half-filled listings get pruned in directory cleanups, and the traffic difference between a bare listing and one with screenshots and a real description is large. Our <a href="/blog/submit-your-startup">startup submission checklist</a> covers the assets to prepare once and reuse everywhere.</li>
    <li><strong>Pace yourself.</strong> Google does not penalize a new site for gaining directory links, but 18 links appearing in one afternoon looks odd next to a site with three pages. Spread submissions over a few weeks and keep publishing content meanwhile — <a href="/blog/build-quality-backlinks-startup-website">quality backlink building</a> is a habit, not an event.</li>
  </ul>

  <h2>What to avoid</h2>
  <p>Skip anything advertising "1,000 backlinks for $5", reciprocal link farms, and comment-spam tools. Those links are ignored at best and toxic at worst. A realistic free plan — the 18 sites above plus a handful of niche communities — builds a DR 15–25 foundation for a brand-new domain in a quarter, which is enough to start ranking for long-tail queries in most niches.</p>

  <h2>FAQ</h2>
  <h3>Do directory backlinks still work in 2026?</h3>
  <p>Curated, moderated directories: yes, as a foundation layer. They won't outrank real editorial links, but they establish the baseline authority a new domain needs. Full analysis in <a href="/blog/directory-backlinks-seo-weapon-startups">our directory backlinks deep-dive</a>.</p>
  <h3>How many backlinks does a new startup need?</h3>
  <p>There's no magic number, but the pattern we see across launches: sites with 15–30 referring domains start appearing for long-tail queries; 50+ quality referring domains is where competitive terms come into reach.</p>
  <h3>Are paid directory listings worth it?</h3>
  <p>Only where the audience is real. Pay for reach (There's An AI For That for AI tools), not for the link alone — a paid link with no traffic is a poor trade at any price.</p>
</article>$html$,
  'Agencies charge $50-200 per dofollow link. These 18 legitimate platforms — DR 37 to 96 — give them to startups free. Every entry verified for link type.',
  'Free dofollow backlinks for startups: 18 verified sites (DR 37-96) that pass real SEO value in 2026, plus how to check any link''s rel attribute yourself.',
  ARRAY['free dofollow backlinks', 'dofollow backlinks for startups', 'free backlinks for startups', 'dofollow backlink sites', 'high dr backlinks free', 'startup seo backlinks'],
  'growth',
  'SubmitHunt Team',
  true,
  'manual'
);

-- 3) "submit ai tool" / "ai tool directories"
INSERT INTO blog_posts (title, slug, content, excerpt, meta_description, keywords, category, author_name, is_published, generated_by)
VALUES (
  'Where to Submit Your AI Tool in 2026: The 12 AI Directories Worth Your Time',
  'submit-ai-tool-directories',
  $html$<article class="blog-post">
  <h2>The AI directory problem</h2>
  <p>Hundreds of AI tool directories launched in the past three years, and most are ghost towns: auto-scraped listings, zero moderation, no traffic, sometimes not even a real link. Submitting to all of them is a waste of a week. Submitting to the right dozen takes an afternoon and gets you real referral traffic plus a set of dofollow backlinks from DR 40–90 domains.</p>
  <p>This guide is that dozen — filtered by three tests: does the directory have real search traffic, is the listing moderated (a directory that accepts everything ranks for nothing), and what kind of link do you get. DR figures are Ahrefs, July 2026, consistent with our full <a href="/directory">submission directory rankings</a>.</p>

  <h2>The AI-specific directories</h2>
  <h3>1. There's An AI For That — DR 72, paid, dofollow</h3>
  <p>The category leader, with real organic traffic across thousands of "AI for X" queries. Listings are paid now, which filters the junk out. If you pay for exactly one AI listing, this is the one — but check that your category page actually gets traffic before buying (search "theresanaiforthat + your niche" and see if it ranks).</p>
  <h3>2. Futurepedia — DR 71, freemium, dofollow</h3>
  <p>Large, actively maintained, real newsletter audience. Free submissions queue for review; paid listings get placement. The free tier is worth it for every AI product.</p>
  <h3>3. Toolify — DR 65, freemium, dofollow</h3>
  <p>Huge index with programmatic category pages that rank surprisingly well internationally. Free listing plus dofollow link makes it an easy yes.</p>
  <h3>4. Future Tools — DR 64, free, nofollow</h3>
  <p>Matt Wolfe's curated directory. The link is nofollow, so this one is purely about the audience — but it's a real audience of AI early adopters, and a feature can drive thousands of visits. Submit anyway; curation means rejection is possible, which is exactly why acceptance is worth something.</p>
  <h3>5. AI Tool Hunt — DR 41, free, dofollow</h3>
  <p>Smaller but moderated, free, dofollow. Five minutes of effort for a legitimate referring domain.</p>

  <h2>The general platforms every AI tool should also hit</h2>
  <h3>6. SubmitHunt — DR 37, free, dofollow</h3>
  <p><em>Disclosure: ours.</em> AI/ML is our largest category — <a href="/category/ai-ml">337 live AI tools and counting</a> — and every launch gets a product page, community upvotes, a dedicated review post, and a dofollow badge backlink, free. <a href="/submit">Submit your AI tool here</a>; it goes live on the next weekday slot.</p>
  <h3>7. Product Hunt — DR 91, free, nofollow</h3>
  <p>Still the biggest single-day audience for an AI launch, and AI products dominate its leaderboards. Nofollow link, so treat it as a traffic event, not an SEO play — full comparison in our <a href="/blog/product-hunt-alternatives">Product Hunt alternatives guide</a>.</p>
  <h3>8. AlternativeTo — DR 88, free, dofollow</h3>
  <p>"ChatGPT alternatives" and its thousand variants are some of the most-searched software queries on the web. Position your tool as an alternative to the AI incumbent it's closest to and collect that comparison traffic indefinitely.</p>
  <h3>9. Hacker News (Show HN) — DR 91, free, nofollow</h3>
  <p>HN is skeptical of AI wrappers and generous to AI tools that solve real problems with an interesting approach. Lead with the technical substance, share what you learned, and never post marketing copy.</p>
  <h3>10. DEV Community — DR 90, free, dofollow</h3>
  <p>Write the "how I built it" article — architecture, model choice, cost lessons. AI build posts perform exceptionally on dev.to, and body links are dofollow.</p>
  <h3>11. SaaSHub — DR 64, freemium, dofollow</h3>
  <p>Its auto-generated "X alternatives" pages rank for AI tool comparisons; a free listing gets you into them with a dofollow link.</p>
  <h3>12. Reddit — DR 91, free, nofollow</h3>
  <p>r/ArtificialIntelligence, r/ChatGPT, r/LocalLLaMA, and your task-specific subreddits. The strongest channel for honest feedback and the least tolerant of promotion — read our <a href="/blog/submit-your-startup-reddit">Reddit launch guide</a> first.</p>

  <h2>Submission tips specific to AI tools</h2>
  <ul>
    <li><strong>Show, don't describe.</strong> A 30-second demo GIF or video outperforms any feature list — directories with media get dramatically more clickthroughs.</li>
    <li><strong>Say what model you use and what happens to user data.</strong> These are the two questions every 2026 AI buyer asks; answering them in the listing builds trust and preempts the top comment.</li>
    <li><strong>Be precise about pricing.</strong> "Free tier: 20 generations/month" converts better than "freemium" — and directories increasingly filter by pricing model.</li>
    <li><strong>Pick the narrow category.</strong> "AI video generator" beats "AI tool" everywhere: category pages are where directory traffic actually lands (that's the logic behind our own <a href="/category/ai-ml">AI category page</a>).</li>
  </ul>

  <h2>What results to expect</h2>
  <p>Honest numbers: a good AI directory listing sends tens of visits per month, not thousands — the exceptions are a Future Tools feature, a front-page HN post, or a Product Hunt top-5, each of which can send thousands in a day. The compounding value is the link profile: the dofollow entries above give a new AI product 8–9 referring domains between DR 37 and 92 for the cost of an afternoon, which is the SEO baseline that lets your own landing pages start ranking for "[your niche] AI tool" queries. Track the effect with your own Ahrefs/GSC data — our <a href="/blog/free-dofollow-backlinks-for-startups">dofollow backlinks guide</a> covers how to verify each link.</p>

  <h2>FAQ</h2>
  <h3>Should I pay for AI directory listings?</h3>
  <p>Pay for audience, never for just a link. There's An AI For That is the only paid AI listing with clear traffic ROI for most tools; everything else worth having is free or freemium.</p>
  <h3>How long until directory backlinks affect my rankings?</h3>
  <p>Links get counted within days of being crawled; visible ranking movement typically takes 4–8 weeks as authority propagates. New domains see the effect most clearly.</p>
  <h3>My tool is pre-launch — where do I start?</h3>
  <p>BetaList for the waitlist, then this list at launch. Our <a href="/blog/submit-your-startup">step-by-step submission guide</a> covers the assets to prepare first.</p>
</article>$html$,
  'Most AI directories are ghost towns. The 12 with real traffic and honest links — DR 37 to 91, dofollow status verified — plus AI-specific listing tips.',
  'Where to submit your AI tool in 2026: 12 directories with real traffic, verified dofollow status, and DR 37-91 — plus what results to actually expect.',
  ARRAY['submit ai tool', 'ai tool directories', 'ai directories', 'where to submit ai tools', 'ai tool directory list', 'promote ai tool'],
  'directories',
  'SubmitHunt Team',
  true,
  'manual'
);
