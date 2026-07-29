import { supabaseClient } from '../lib/supabase-client.js';
import { captureScreenshot, uploadScreenshot } from '../lib/screenshot-service.js';
import { Confetti } from './confetti.js';
import { createCheckoutSession } from '../lib/stripe.js';
import { config } from '../config.js';
import { getFreeSubmissionStatus, verifyBacklink, BADGE_LIGHT_EMBED, BADGE_DARK_EMBED } from '../lib/backlink.js';
import { aiPrefill, fetchDomainRating, uploadAsset } from '../lib/prefill.js';
import { CATEGORIES, MAX_CATEGORIES, PRICING_MODELS } from '../lib/categories.js';

/* global html, useState, useEffect, useRef */

// Field limits. These are the contract between the form, the DB and the Stripe
// metadata cap (500 chars per value) — don't raise one without checking the
// paid path in create-checkout / stripe-webhook still round-trips the value.
const LIMITS = {
  name: 40,
  tagline: 60,
  description: 600,
  seoKeyword: 100,
  firstComment: 500,
  discount: 60,
};

const MAX_SCREENSHOTS = 5;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;       // 2 MB
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

// ---------------------------------------------------------------------------
// Step 2 social proof
//
// Every number below was MEASURED from the production database on 2026-07-28:
// 1,661 products submitted / 1,476 currently live, 1,365 distinct makers, and
// 345 published SEO articles. DR 38 is the Ahrefs Domain Rating for
// submithunt.com (the same figure used everywhere else on the site).
//
// Do NOT estimate, extrapolate, or round up — if you can't count it, don't show
// it. These go stale, so re-count against production and update this list
// periodically (quarterly is plenty).
//
// There is deliberately NO page-views tile: startups.views is never incremented,
// so we have no page-view data at all. Don't add one until it's really tracked.
const LAUNCH_STATS = [
  { value: '1,476', label: 'Products live', hint: 'of 1,661 submitted' },
  { value: '1,365', label: 'Makers launched here', hint: 'distinct maker accounts' },
  { value: '345', label: 'SEO articles published', hint: 'on submithunt.com' },
  { value: '37', label: 'Domain Rating', hint: 'Ahrefs, submithunt.com' },
];

// submithunt.com's own Ahrefs Domain Rating, measured 2026-07-28. Used wherever
// we state our DR as a fact. Re-check it before quoting it in new copy — DR
// drifts, and the site's older "DR 38+" copy is already a point above this.
const SITE_DR = 37;

// Real maker quotes ONLY. This must stay empty until the owner pastes in quotes
// he has actually received AND has permission to publish, each with the real
// name/handle of the person who said it. The whole section renders nothing while
// this array is empty — never seed it with placeholder or invented testimonials.
const TESTIMONIALS = [];

// The one source of truth for what each plan costs, used by the plan cards and
// the running total. These match the live Stripe prices — changing a number here
// does NOT change what Stripe charges.
const PLAN_PRICE_USD = { free: 0, premium: 20, featured: 50 };

// Which plan is pre-selected when a maker first reaches step 2.
//
// This is a MERCHANDISING choice, not a technical one: Premium is our
// recommended plan, so it starts selected instead of Free. It is overridden by
// (a) an explicit ?plan= URL param and (b) a restored localStorage draft, and
// Free stays one click away on the same screen — nothing is hidden and no one
// reaches Stripe without clicking a clearly priced "Continue to payment".
// To go back to Free-by-default, set this to 'free'. That's the whole change.
const DEFAULT_PLAN = 'premium';

// A live "12/40" counter that warns as the maker approaches the cap. Rendered
// on the right of the field's label so it never shifts the input.
const counter = (value, max) => {
  const len = (value || '').length;
  const tone = len >= max ? ' sh-counter--max' : (len > max * 0.85 ? ' sh-counter--warn' : '');
  return html`<span class="sh-counter${tone}">${len}/${max}</span>`;
};

// Accept a full profile URL or a bare handle and return the bare handle.
const normalizeHandle = (input) => {
  const raw = (input || '').trim();
  if (!raw) return '';
  return raw
    .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .slice(0, 40);
};

// YouTube / Loom only — anything else is rejected rather than embedded blind.
const isSupportedVideoUrl = (url) => {
  const u = (url || '').trim();
  if (!u) return true; // optional
  return /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|(www\.)?loom\.com\/share\/)/i.test(u);
};

// localStorage key for an unpaid paid-plan submission awaiting Stripe payment.
// Lets us show a persistent "not submitted yet" state if the user abandons
// checkout and returns. Cleared on the payment-success page.
const PENDING_KEY = 'sh_pending_submission';

// localStorage key for the in-progress form. Persisted so an OAuth login (which
// is a full-page redirect) doesn't make the user re-type everything afterwards.
const FORMDATA_KEY = 'sh_submit_formdata';

// Supabase Edge Function that verifies a Turnstile token for the free flow.
const VERIFY_TURNSTILE_URL = `${config.supabase.url}/functions/v1/verify-turnstile`;

// Turnstile explicit-render widget id (module scope — one submit form per page).
let turnstileWidgetId = null;

// ---------------------------------------------------------------------------
// Paid launch scheduling
//
// Paid plans (Premium / Featured) may pick ANY future weekday to launch on:
// the soonest launchable weekday is recommended, but they can schedule up to
// PAID_SCHEDULE_MAX_DAYS out. Dates are computed on the PST wall clock and
// anchored at UTC noon to classify the weekday without local-timezone drift,
// so a launch day chosen here lines up exactly with the go-live cron (which
// compares against the PST date) and the webhook's weekday coercion.
const PAID_SCHEDULE_MAX_DAYS = 90;

// "Now" as a PST wall-clock Date.
const pstNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));

// YYYY-MM-DD for a Date in PST — same basis the webhook/cron use for "today".
const pstDateStr = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

// UTC-noon anchor for a PST wall-clock day (weekday classification only).
const pstDayAnchor = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12));

const anchorToValue = (a) =>
  `${a.getUTCFullYear()}-${String(a.getUTCMonth() + 1).padStart(2, '0')}-${String(a.getUTCDate()).padStart(2, '0')}`;

// Parse a YYYY-MM-DD into a UTC-noon anchor (null if malformed).
const valueToAnchor = (value) => {
  const [y, m, d] = (value || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d, 12));
};

const isWeekdayValue = (value) => {
  const a = valueToAnchor(value);
  if (!a) return false;
  const dow = a.getUTCDay();
  return dow >= 1 && dow <= 5;
};

// Format a YYYY-MM-DD launch day for display (weekday classification is UTC so
// the day never shifts).
const formatLaunchLabel = (value, opts = { weekday: 'long', month: 'long', day: 'numeric' }) => {
  const a = valueToAnchor(value);
  return a ? a.toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' }) : '';
};

// Every selectable paid launch weekday: the soonest launchable weekday (today
// if it's a weekday — paid goes live immediately, any hour — otherwise the next
// weekday) through PAID_SCHEDULE_MAX_DAYS out.
const buildPaidLaunchDates = () => {
  const start = pstDayAnchor(pstNow());
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + PAID_SCHEDULE_MAX_DAYS);
  const out = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const dow = cursor.getUTCDay();
    if (dow >= 1 && dow <= 5) {
      out.push({
        value: anchorToValue(cursor),
        dow,
        dayNum: String(cursor.getUTCDate()),
        short: cursor.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
};

export const SubmitStartupPage = ({ user, authLoading, onLoginRequired }) => {
  const [formData, setFormData] = useState({
    url: "",
    xProfile: "",
    contactEmail: "",
    projectName: "",
    tagline: "",
    description: "",
    slug: "",
    category: "",       // primary category — categories[0], kept for DB/browse compat
    categories: [],     // up to MAX_CATEGORIES, stored in details.categories
    seoKeyword: "",     // the one search term this listing should target
    tags: "",        // comma-separated in the form, split to array on insert
    linkedin: "",
    github: "",
    logoUrl: "",     // public URL (AI-extracted or uploaded)
    coverUrl: "",    // legacy single cover — superseded by screenshots[]
    screenshots: [], // up to MAX_SCREENSHOTS public URLs; [0] is the social share image
    videoUrl: "",    // optional YouTube / Loom demo
    openSource: false,
    pricingModel: "",
    discount: "",    // optional discount/promo shown as a badge on the listing
    firstComment: "",// posted as the maker's comment when the product goes live
    // Merchandising default — see DEFAULT_PLAN. A ?plan= param and a restored
    // draft both override this in the mount effect below.
    plan: DEFAULT_PLAN,
    launchDate: ""
  });
  const [aiDetails, setAiDetails] = useState(null); // extra AI fields (pricing, audience, tech stack, faq, seo)
  const [prefillError, setPrefillError] = useState(null);
  const [drValue, setDrValue] = useState(null);     // Ahrefs Domain Rating
  const [drLoading, setDrLoading] = useState(false);
  const [drAnim, setDrAnim] = useState(0);          // 0..1 count-up progress
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [showSlugEditor, setShowSlugEditor] = useState(false);
  // Discount is a toggle that reveals a text field; the toggle state has to be
  // separate so an empty-but-open field doesn't collapse on every keystroke.
  const [discountOn, setDiscountOn] = useState(false);
  // Per-field validation messages, keyed by field name, so step 1 can point at
  // the field that's wrong instead of only showing one banner at the top.
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showSuccessPage, setShowSuccessPage] = useState(false);
  const [availableLaunchDates, setAvailableLaunchDates] = useState([]);
  // Selectable launch weekdays for paid plans (any future weekday, soonest
  // recommended). Computed once on mount; refreshed when a paid plan is picked.
  const [paidLaunchDates, setPaidLaunchDates] = useState(() => buildPaidLaunchDates());
  // Combined free-plan unlock status from get_free_submission_status — null
  // until loaded. Shape: {eligible, upvotes_done, upvotes_required,
  // comments_done, comments_required, backlink_verified, is_returning}.
  const [freeStatus, setFreeStatus] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [wasLocked, setWasLocked] = useState(false); // saw the unlock panel this visit
  // Backlink: an OPTIONAL final step. A do-follow badge earns a DR 37 backlink,
  // but the maker can skip it (skipBacklink) and launch without — they just
  // forfeit the link equity (and we keep reminding them on the dashboard + in
  // the launch email).
  const [backlinkUrl, setBacklinkUrl] = useState('');
  const [verifyingBacklink, setVerifyingBacklink] = useState(false);
  const [backlinkError, setBacklinkError] = useState(null);
  const [skipBacklink, setSkipBacklink] = useState(false); // "continue with a no-follow backlink"
  const [copiedEmbed, setCopiedEmbed] = useState(''); // '' | 'light' | 'dark'
  // Phase 1 auto-fill (scrape metadata from the URL)
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [loadingDates, setLoadingDates] = useState(false);
  const [pendingSubmission, setPendingSubmission] = useState(null); // unpaid paid-plan draft awaiting payment
  const [turnstileToken, setTurnstileToken] = useState(null); // Cloudflare Turnstile token (anti-bot)
  const [turnstileUnavailable, setTurnstileUnavailable] = useState(false); // widget couldn't load (e.g. blocked)
  const [freeDomainTaken, setFreeDomainTaken] = useState(false); // this site already submitted on free plan
  const [showScheduleConfirm, setShowScheduleConfirm] = useState(false); // free-launch confirmation modal
  const [couponCopied, setCouponCopied] = useState(false);

  const getESTDateString = (date) => {
    const estDate = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
    return estDate.getFullYear() + '-' +
      String(estDate.getMonth() + 1).padStart(2, '0') + '-' +
      String(estDate.getDate()).padStart(2, '0');
  };

  const fetchSlotAvailability = async (dateValue) => {
    const supabase = supabaseClient();
    try {
      const { data, error } = await supabase.rpc('get_available_slots', { target_date: dateValue });

      if (error) {
        const { count: freeCount } = await supabase
          .from('startups')
          .select('id', { count: 'exact' })
          .eq('plan', 'free')
          .eq('launch_date', dateValue);

        const { count: totalCount } = await supabase
          .from('startups')
          .select('id', { count: 'exact' })
          .eq('launch_date', dateValue);

        return {
          free_slots_remaining: 6 - (freeCount || 0),
          free_count: freeCount || 0,
          total_count: totalCount || 0
        };
      }

      return data?.[0] || { free_slots_remaining: 6, free_count: 0, total_count: 0 };
    } catch (err) {
      console.error('Error in fetchSlotAvailability:', err);
      return { free_slots_remaining: 6, free_count: 0, total_count: 0 };
    }
  };

  const generateLaunchDates = async () => {
    setLoadingDates(true);
    const dates = [];

    const now = new Date();
    const estNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));

    let workingDate = new Date(estNow);
    workingDate.setHours(0, 0, 0, 0);
    workingDate.setDate(workingDate.getDate() + 7);

    let daysChecked = 0;

    while (dates.length < 5 && daysChecked < 30) {
      const dayOfWeek = workingDate.getDay();

      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        const dateOptions = { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' };
        const formattedDate = workingDate.toLocaleDateString('en-US', dateOptions);
        const dateValue = getESTDateString(workingDate);
        const slotData = await fetchSlotAvailability(dateValue);
        const slotsRemaining = slotData.free_slots_remaining;
        const freeAvailable = slotsRemaining > 0;

        dates.push({
          date: formattedDate,
          value: dateValue,
          freeAvailable: freeAvailable,
          premiumAvailable: true,
          freeCount: slotData.free_count,
          totalCount: slotData.total_count,
          slotsRemaining: slotsRemaining,
          dayOfWeek: dayOfWeek
        });
      }

      workingDate.setDate(workingDate.getDate() + 1);
      daysChecked++;
    }

    setLoadingDates(false);
    return dates;
  };

  const refreshSlotAvailability = async () => {
    if (availableLaunchDates.length === 0) return;

    const updatedDates = await Promise.all(
      availableLaunchDates.map(async (dateInfo) => {
        const slotData = await fetchSlotAvailability(dateInfo.value);
        return {
          ...dateInfo,
          freeCount: slotData.free_count,
          totalCount: slotData.total_count,
          slotsRemaining: slotData.free_slots_remaining,
          freeAvailable: slotData.free_slots_remaining > 0
        };
      })
    );

    setAvailableLaunchDates(updatedDates);

    if (formData.launchDate) {
      const selectedDate = updatedDates.find(d => d.value === formData.launchDate);
      if (selectedDate && !selectedDate.freeAvailable && formData.plan === 'free') {
        setFormData(prev => ({ ...prev, launchDate: '' }));
      }
    }
  };

  const selectLaunchDate = (dateValue) => {
    setFormData(prev => ({ ...prev, launchDate: dateValue }));
  };

  // Calculate days until first available free launch date
  const getDelayText = () => {
    if (availableLaunchDates.length === 0) return 'Loading...';

    const firstAvailable = availableLaunchDates.find(d => d.freeAvailable);
    if (!firstAvailable) return 'No slots available';

    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    today.setHours(0, 0, 0, 0);

    const launchDate = new Date(firstAvailable.value + 'T12:00:00');
    const diffTime = launchDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 1) return '1 day';
    if (diffDays < 7) return `${diffDays} days`;
    if (diffDays === 7) return '1 week';
    if (diffDays < 14) return `${diffDays} days (~1 week)`;
    return `${Math.ceil(diffDays / 7)} weeks`;
  };

  // Latest product URL + a request-id, so the status check (which can be fired
  // from several places) reads the current URL and ignores out-of-order
  // responses instead of letting a slow earlier request clobber a newer one.
  const urlRef = useRef(formData.url);
  urlRef.current = formData.url;
  const statusReqRef = useRef(0);

  // Combined free-plan unlock status: upvote 3 + comment 1 (fresh since the
  // user's last free launch) + a verified do-follow backlink for this product.
  // Returning users can resubmit free once they re-clear the gate. The check
  // fails open client-side; the DB trigger is the real enforcement.
  const checkFreeStatus = async (productUrl) => {
    if (!window.auth || !window.auth.isAuthenticated()) {
      setFreeStatus(null);
      return;
    }
    const url = productUrl !== undefined ? productUrl : urlRef.current;
    const myReq = ++statusReqRef.current;
    setCheckingStatus(true);
    try {
      const status = await getFreeSubmissionStatus(url);
      if (myReq !== statusReqRef.current) return; // a newer check superseded this one
      setFreeStatus(status);
    } finally {
      if (myReq === statusReqRef.current) setCheckingStatus(false);
    }
  };

  // Unlock state for the free plan. While the status is still loading we show
  // a spinner instead of flashing the unlock panel at already-eligible users.
  const statusLoading = !!user && freeStatus === null;
  // Engagement (upvote + comment) is what UNLOCKS the form/slot picker. The
  // do-follow backlink is a separate FINAL step that gates the Submit button —
  // not the unlock — so the user fills details and picks a slot first.
  const engagementDone = freeStatus
    ? (freeStatus.unavailable === true
        || ((freeStatus.upvotes_done || 0) >= (freeStatus.upvotes_required || 3)
            && (freeStatus.comments_done || 0) >= (freeStatus.comments_required || 1)))
    : true;
  const freeUnlocked = !statusLoading && engagementDone;
  const backlinkVerified = freeStatus ? (freeStatus.unavailable === true || !!freeStatus.backlink_verified) : true;


  // On mount, restore any in-progress form data saved before an OAuth login
  // (a full-page redirect), then let an explicit ?plan= param win — e.g. when
  // arriving from pricing/featured. This is what lets users pick up exactly
  // where they left off after signing in instead of re-typing everything.
  //
  // Plan precedence, highest first: ?plan= param → restored draft → DEFAULT_PLAN.
  // The spread order below is what encodes that, so don't reorder it.
  useEffect(() => {
    let restored = null;
    try {
      const raw = localStorage.getItem(FORMDATA_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          restored = saved.formData || null;
          if (typeof saved.currentPage === 'number') setCurrentPage(saved.currentPage);
        }
      }
    } catch (e) { /* ignore malformed saved form */ }

    const planParam = new URLSearchParams(window.location.search).get('plan');
    const validPlan = ['free', 'premium', 'featured'].includes(planParam) ? planParam : null;

    if (restored || validPlan) {
      setFormData(prev => {
        const next = { ...prev, ...(restored || {}), ...(validPlan ? { plan: validPlan } : {}) };
        // Drafts saved before the multi-category / gallery fields existed carry
        // a single `category` and `coverUrl` — lift them into the new shape so
        // a returning maker doesn't find those fields blank.
        if (!Array.isArray(next.categories)) next.categories = next.category ? [next.category] : [];
        if (!Array.isArray(next.screenshots)) next.screenshots = next.coverUrl ? [next.coverUrl] : [];
        for (const key of ['seoKeyword', 'videoUrl', 'pricingModel', 'discount', 'firstComment']) {
          if (typeof next[key] !== 'string') next[key] = '';
        }
        next.openSource = !!next.openSource;
        // A corrupt/legacy draft must never leave an unknown plan selected —
        // fall back to the default rather than rendering with no plan at all.
        if (!['free', 'premium', 'featured'].includes(next.plan)) next.plan = DEFAULT_PLAN;
        return next;
      });
      if (restored && restored.discount) setDiscountOn(true);
    }
  }, []);

  // Persist the in-progress form so a full-page OAuth redirect (login) doesn't
  // wipe what the user typed. Cleared on successful submit / discard.
  useEffect(() => {
    try {
      localStorage.setItem(FORMDATA_KEY, JSON.stringify({ formData, currentPage }));
    } catch (e) { /* ignore quota errors */ }
  }, [formData, currentPage]);

  // Restore any unpaid submission left over from an abandoned checkout so we
  // can clearly tell the user their launch was NOT submitted (and let them
  // resume payment). Stripe's cancel_url returns here, to /submit.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft && draft.plan && draft.title) {
        setPendingSubmission(draft);
      }
    } catch (e) {
      /* ignore malformed draft */
    }
  }, []);

  // Render the Cloudflare Turnstile widget on the plan/submit step (page 2).
  // Explicit render so it mounts reliably inside the SPA; the token is captured
  // via callback and required before a submission can go through.
  useEffect(() => {
    // Turnstile is only used on the FREE plan now (paid is gated by payment).
    // While the unlock checklist is shown there's no widget container mounted at
    // all — skip, or the retry loop would wrongly conclude the script is blocked
    // and fail open via turnstileUnavailable.
    if (currentPage !== 2 || formData.plan !== 'free' || !freeUnlocked) return undefined;
    let cancelled = false;
    let tries = 0;

    const renderWidget = () => {
      if (cancelled) return;
      const el = document.getElementById('turnstile-widget');
      if (!window.turnstile || !el) {
        tries += 1;
        if (tries > 16) {
          // ~4s with no Turnstile: the script was blocked or failed to load.
          // Mark it unavailable so we don't hard-lock a legitimate user.
          setTurnstileUnavailable(true);
          return;
        }
        setTimeout(renderWidget, 250); // api.js still loading or element not mounted yet
        return;
      }
      setTurnstileUnavailable(false);
      if (turnstileWidgetId !== null) return; // already rendered
      try {
        turnstileWidgetId = window.turnstile.render(el, {
          sitekey: config.turnstile?.siteKey || '0x4AAAAAAA_Rl5VDA4u6EMKm',
          callback: (token) => setTurnstileToken(token),
          'expired-callback': () => setTurnstileToken(null),
          'error-callback': () => setTurnstileToken(null),
        });
      } catch (e) {
        /* already-rendered or transient — ignore */
      }
    };
    renderWidget();

    return () => {
      cancelled = true;
      try {
        if (window.turnstile && turnstileWidgetId !== null) {
          window.turnstile.remove(turnstileWidgetId);
        }
      } catch (e) { /* ignore */ }
      turnstileWidgetId = null;
      setTurnstileToken(null);
    };
  }, [currentPage, formData.plan, freeUnlocked]);

  // Load launch dates and set up refresh interval
  useEffect(() => {
    const loadLaunchDates = async () => {
      const dates = await generateLaunchDates();
      setAvailableLaunchDates(dates);
    };

    loadLaunchDates();

    const refreshInterval = setInterval(() => {
      refreshSlotAvailability();
    }, 10000);

    return () => {
      clearInterval(refreshInterval);
    };
  }, []);

  // Ensure a paid plan always has a valid launch weekday selected — covers every
  // entry point into a paid plan (the ?plan= deep link and a restored draft, not
  // just the plan cards). Refreshes the window first so a tab left open across
  // midnight can't offer a stale "soonest" date.
  //
  // The plan/date checks happen INSIDE the updater, not against the render-time
  // formData. Premium is now the default plan (DEFAULT_PLAN), so this effect
  // fires on mount — in the same commit as the draft-restore effect above. If it
  // read the render-time values it would stamp a paid weekday onto a restored
  // FREE draft, leaving a date selected that isn't in the free slot grid.
  useEffect(() => {
    if (formData.plan !== 'premium' && formData.plan !== 'featured') return;
    const fresh = buildPaidLaunchDates();
    setPaidLaunchDates(fresh);
    setFormData(prev => {
      if (prev.plan !== 'premium' && prev.plan !== 'featured') return prev;
      if (prev.launchDate && fresh.some(d => d.value === prev.launchDate)) return prev;
      return { ...prev, launchDate: fresh[0]?.value || '' };
    });
  }, [formData.plan]);

  // Fetch the unlock status when the user lands on the plan step (page 2), and
  // reset it to null first so a freshly-edited URL can't briefly show the
  // previous URL's "unlocked" state. Keyed on currentPage (not formData.url) so
  // typing the URL on page 1 doesn't fire an RPC per keystroke — the URL can't
  // change while page 2 is shown.
  useEffect(() => {
    if (!user) { setFreeStatus(null); return; }
    if (currentPage === 2) {
      setFreeStatus(null);
      checkFreeStatus(formData.url);
    }
  }, [user, currentPage]);

  // Re-check whenever the tab regains focus — the upvote/comment steps happen on
  // the homepage in another tab, so this is what ticks the checklist off when
  // the user comes back. Reads the latest URL via urlRef (no per-keystroke
  // listener churn).
  useEffect(() => {
    if (!user) return undefined;
    const onFocus = () => checkFreeStatus(urlRef.current);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [user]);

  // Remember that the unlock panel was shown, so we can confirm visibly once
  // every step is completed (instead of the panel silently vanishing).
  useEffect(() => {
    if (freeStatus && !freeStatus.eligible) setWasLocked(true);
  }, [freeStatus]);

  const generateSlug = (name) => {
    if (!name) return '';
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  };

  const makeUniqueSlug = (baseSlug) => {
    const randomSuffix = Math.floor(Math.random() * 10000);
    return `${baseSlug}-${randomSuffix}`;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    // Typing in a field clears its own error — the message shouldn't linger
    // while the maker is actively fixing it.
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: null } : prev));

    if (name === 'projectName' && value) {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
        slug: !prev.slug || prev.slug === generateSlug(prev.projectName) ? generateSlug(value) : prev.slug
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  // Categories are a chip multi-select capped at MAX_CATEGORIES. The first one
  // picked stays the primary (written to startups.category) so browsing and
  // filtering keep working unchanged; the rest live in details.categories.
  const toggleCategory = (value) => {
    setFieldErrors((prev) => (prev.categories ? { ...prev, categories: null } : prev));
    setFormData((prev) => {
      const current = prev.categories || [];
      const next = current.includes(value)
        ? current.filter((c) => c !== value)
        : (current.length >= MAX_CATEGORIES ? current : [...current, value]);
      return { ...prev, categories: next, category: next[0] || '' };
    });
  };

  const setField = (name, value) => {
    setFieldErrors((prev) => (prev[name] ? { ...prev, [name]: null } : prev));
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // AI-Powered Form Prefill: send the URL to the ai-prefill Edge Function
  // (OpenRouter) and fill the form from the structured result. Fills empty-ish
  // fields so it never clobbers what the user already typed.
  const handleAutoFill = async () => {
    const url = formData.url.trim();
    if (!url || autoFilling) return;
    setAutoFilling(true);
    setAutoFilled(false);
    setPrefillError(null);
    setError(null);
    window.trackEvent('ai_prefill_requested', { url });
    try {
      const data = await aiPrefill(url);
      if (data.error) {
        setPrefillError(data.error);
        return;
      }
      setFormData((prev) => {
        const next = { ...prev };
        if (data.name && !prev.projectName) next.projectName = String(data.name).slice(0, LIMITS.name);
        if (data.tagline && !prev.tagline) next.tagline = String(data.tagline).slice(0, LIMITS.tagline);
        if (data.description && !prev.description) next.description = String(data.description).slice(0, LIMITS.description);
        if (data.category && !(prev.categories || []).length) {
          // Only accept a category the chip list actually offers, so the AI can
          // never write a value the browse filters don't know about.
          const known = CATEGORIES.find((c) => c.value === data.category);
          if (known) { next.categories = [known.value]; next.category = known.value; }
        }
        if (Array.isArray(data.tags) && data.tags.length && !prev.tags) next.tags = data.tags.slice(0, 5).join(', ');
        if (data.pricing && !prev.pricingModel && PRICING_MODELS.some((p) => p.value === data.pricing)) {
          next.pricingModel = data.pricing;
        }
        if (data.logo && !prev.logoUrl) next.logoUrl = data.logo;
        if (data.cover && !(prev.screenshots || []).length) next.screenshots = [data.cover];
        if (data.seoKeyword && !prev.seoKeyword) {
          next.seoKeyword = String(data.seoKeyword).slice(0, LIMITS.seoKeyword);
        }
        const s = data.socialLinks || {};
        if (s.youtube && !prev.videoUrl && isSupportedVideoUrl(s.youtube)) next.videoUrl = s.youtube;
        if (s.x && !prev.xProfile) {
          const handle = normalizeHandle(String(s.x));
          if (handle) next.xProfile = handle;
        }
        if (s.linkedin && !prev.linkedin) next.linkedin = s.linkedin;
        if (s.github && !prev.github) next.github = s.github;
        if (!prev.slug && (data.name || prev.projectName)) {
          next.slug = generateSlug(data.name || prev.projectName);
        }
        return next;
      });
      setAiDetails({
        pricing: data.pricing || '',
        targetAudience: data.targetAudience || '',
        techStack: Array.isArray(data.techStack) ? data.techStack : [],
        longDescription: data.longDescription || '',
        seo: data.seo || null,
        faq: Array.isArray(data.faq) ? data.faq : [],
        socialLinks: data.socialLinks || {},
      });
      setAutoFilled(true);
      window.trackEvent('ai_prefill_success', {});
    } catch (e) {
      setPrefillError('Prefill failed. Please fill the details in manually.');
    } finally {
      setAutoFilling(false);
    }
  };

  // Domain Rating lookup (Ahrefs free endpoint) — shown next to the URL.
  const lookupDomainRating = async (url) => {
    const u = (url || '').trim();
    if (!u) { setDrValue(null); return; }
    setDrLoading(true);
    try {
      const res = await fetchDomainRating(u);
      setDrValue(typeof res.dr === 'number' ? res.dr : null);
    } finally {
      setDrLoading(false);
    }
  };

  // Reject anything that isn't a reasonable image before it reaches storage —
  // the bucket has no MIME or size limits of its own, so this is the only gate.
  const rejectFile = (file, maxBytes, label) => {
    const type = (file.type || '').toLowerCase();
    if (type && !ALLOWED_IMAGE_TYPES.includes(type)) {
      return `${label} must be a PNG, JPG, WebP or GIF.`;
    }
    if (file.size > maxBytes) {
      return `${label} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${Math.round(maxBytes / 1024 / 1024)} MB.`;
    }
    return null;
  };

  // Upload the logo the user picked; store the public URL.
  const handleLogoUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // let the same file be re-picked after an error
    if (!file) return;

    const invalid = rejectFile(file, MAX_LOGO_BYTES, 'Logo');
    if (invalid) { setFieldErrors((prev) => ({ ...prev, logoUrl: invalid })); return; }

    setUploadingLogo(true);
    setFieldErrors((prev) => ({ ...prev, logoUrl: null }));
    try {
      const res = await uploadAsset(file, 'logo');
      if (res.error) { setFieldErrors((prev) => ({ ...prev, logoUrl: res.error })); return; }
      setFormData((prev) => ({ ...prev, logoUrl: res.url }));
    } finally {
      setUploadingLogo(false);
    }
  };

  // Upload one or more screenshots, appending up to MAX_SCREENSHOTS. The first
  // one doubles as the listing card image and the social share image.
  const handleScreenshotUpload = async (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length) return;

    const room = MAX_SCREENSHOTS - (formData.screenshots || []).length;
    if (room <= 0) {
      setFieldErrors((prev) => ({ ...prev, screenshots: `You can add up to ${MAX_SCREENSHOTS} screenshots.` }));
      return;
    }

    const files = picked.slice(0, room);
    const skipped = picked.length - files.length;
    setUploadingCover(true);
    setFieldErrors((prev) => ({ ...prev, screenshots: null }));
    try {
      const problems = [];
      for (const file of files) {
        const invalid = rejectFile(file, MAX_SCREENSHOT_BYTES, file.name || 'Screenshot');
        if (invalid) { problems.push(invalid); continue; }
        const res = await uploadAsset(file, 'screenshot');
        if (res.error) { problems.push(res.error); continue; }
        setFormData((prev) => ({
          ...prev,
          screenshots: [...(prev.screenshots || []), res.url].slice(0, MAX_SCREENSHOTS),
        }));
      }
      if (skipped > 0) problems.push(`${skipped} file${skipped > 1 ? 's were' : ' was'} skipped — ${MAX_SCREENSHOTS} screenshots max.`);
      if (problems.length) setFieldErrors((prev) => ({ ...prev, screenshots: problems.join(' ') }));
    } finally {
      setUploadingCover(false);
    }
  };

  const removeScreenshot = (index) => {
    setFieldErrors((prev) => ({ ...prev, screenshots: null }));
    setFormData((prev) => ({
      ...prev,
      screenshots: (prev.screenshots || []).filter((_, i) => i !== index),
    }));
  };

  // Promote a screenshot to first position — it becomes the card + social image.
  const makePrimaryScreenshot = (index) => {
    setFormData((prev) => {
      const list = [...(prev.screenshots || [])];
      if (index <= 0 || index >= list.length) return prev;
      const [picked] = list.splice(index, 1);
      return { ...prev, screenshots: [picked, ...list] };
    });
  };


  // Count-up animation (0..1) that drives the DR cards' numbers + bars.
  useEffect(() => {
    if (drValue == null) { setDrAnim(0); return undefined; }
    setDrAnim(0);
    let step = 0;
    const steps = 22;
    const id = setInterval(() => {
      step += 1;
      setDrAnim(Math.min(1, step / steps));
      if (step >= steps) clearInterval(id);
    }, 40);
    return () => clearInterval(id);
  }, [drValue]);

  // Requirement #3: verify the do-follow backlink the user placed on their site.
  const handleVerifyBacklink = async () => {
    const link = backlinkUrl.trim();
    if (!link) { setBacklinkError('Enter the URL where you placed our link.'); return; }
    setVerifyingBacklink(true);
    setBacklinkError(null);
    window.trackEvent('backlink_verify_requested', { product: formData.url });
    try {
      const result = await verifyBacklink(link, formData.url);
      if (result.verified) {
        window.trackEvent('backlink_verify_success', {});
        // Re-pull the combined status so the checklist + Submit unlock together.
        await checkFreeStatus();
      } else {
        setBacklinkError(result.error || 'Could not verify the backlink. Please try again.');
        window.trackEvent('backlink_verify_failed', { error: String(result.error || '').slice(0, 120) });
      }
    } finally {
      setVerifyingBacklink(false);
    }
  };

  const copyEmbed = async (variant) => {
    const code = variant === 'dark' ? BADGE_DARK_EMBED : BADGE_LIGHT_EMBED;
    try {
      await navigator.clipboard.writeText(code);
      setCopiedEmbed(variant);
      setTimeout(() => setCopiedEmbed(''), 2000);
    } catch (e) { /* clipboard blocked — the badge is shown so it can be copied manually */ }
  };

  const copyCoupon = async () => {
    try {
      await navigator.clipboard.writeText('HACK');
      setCouponCopied(true);
      setTimeout(() => setCouponCopied(false), 2000);
    } catch (e) { /* clipboard blocked — code is visible to copy manually */ }
  };

  // Flag whether this site (or a subpage/subdomain of it) is already on the
  // FREE plan. We don't hard-block here — the user can still pick a paid plan —
  // we just surface a warning on the plan step and disable the free option.
  const checkDuplicateUrl = async () => {
    if (!formData.url) { setFreeDomainTaken(false); return; }
    try {
      const supabase = supabaseClient();
      const { data, error } = await supabase.rpc('check_free_domain_taken', { p_url: formData.url });
      setFreeDomainTaken(!error && data === true);
    } catch (e) {
      console.error('Error in checkDuplicateUrl:', e);
      setFreeDomainTaken(false);
    }
  };

  const goToNextPage = async () => {
    if (currentPage === 1) {
      if (!user) {
        onLoginRequired();
        return;
      }

      // Collect every problem at once and pin each to its field, so the maker
      // fixes the whole step in one pass instead of one error at a time.
      const problems = {};
      if (!formData.url.trim()) {
        problems.url = 'Add the link to your product.';
      } else if (!/^https?:\/\//i.test(formData.url.trim())) {
        problems.url = 'The URL needs to start with http:// or https://';
      }
      if (!formData.projectName.trim()) problems.projectName = 'Your product needs a name.';
      if (!formData.tagline.trim()) problems.tagline = 'A one-line tagline is what people read first.';
      if (!formData.description.trim()) {
        problems.description = 'Tell people what your product does.';
      } else if (formData.description.trim().length < 40) {
        problems.description = 'Add a bit more — at least 40 characters.';
      }
      if (!(formData.categories || []).length) problems.categories = 'Pick at least one category.';
      if (!formData.logoUrl) problems.logoUrl = 'Add a logo — it appears on every listing card.';
      if (!formData.xProfile.trim()) problems.xProfile = 'Your X handle links the launch back to you.';
      if (!isSupportedVideoUrl(formData.videoUrl)) problems.videoUrl = 'Only YouTube and Loom links are supported.';
      if (formData.firstComment.trim() && formData.firstComment.trim().length < 5) {
        problems.firstComment = 'Comments need at least 5 characters.';
      }

      if (Object.keys(problems).length) {
        setFieldErrors(problems);
        setError('Please fix the highlighted fields before continuing.');
        // Scroll to the first field that needs attention.
        const firstId = Object.keys(problems)[0];
        const el = document.getElementById(firstId) || document.getElementById(`field-${firstId}`);
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      setFieldErrors({});

      // Slug is auto-derived; never block the user on it. Backfill if empty.
      if (!formData.slug) {
        const auto = generateSlug(formData.projectName)
          || generateSlug(formData.url.replace(/^https?:\/\//, ''))
          || `startup-${Math.floor(Math.random() * 100000)}`;
        setFormData(prev => ({ ...prev, slug: auto }));
      }

      // Refresh the "already on free plan" flag for the plan-step warning. We do
      // NOT block here — the user may still choose a paid plan for this site.
      await checkDuplicateUrl();

      setError(null);
      setCurrentPage(2);
      window.trackEvent('form_next_page', { page: 1 });
    }
  };

  const goToPreviousPage = () => {
    setCurrentPage(currentPage - 1);
    window.trackEvent('form_prev_page', { page: currentPage });
  };

  const selectPlan = (plan) => {
    setFormData(prev => {
      const next = { ...prev, plan };
      if (plan === 'premium' || plan === 'featured') {
        // Default paid launches to the soonest launchable weekday (recommended).
        // Keep an already-chosen weekday if it's still within the paid window.
        if (!prev.launchDate || !paidLaunchDates.some(d => d.value === prev.launchDate)) {
          next.launchDate = paidLaunchDates[0]?.value || '';
        }
      } else {
        // Free uses the slot-limited grid; drop any paid-only date so it can
        // never bypass the free queue or the 6-slots-a-day cap.
        next.launchDate = '';
      }
      return next;
    });
  };

  // Snap an arbitrary date (e.g. from the native date input) to a valid paid
  // launch weekday: bump weekends to Monday, clamp into the schedulable window.
  const selectPaidDate = (value) => {
    let a = valueToAnchor(value);
    if (!a) return;
    while (a.getUTCDay() === 0 || a.getUTCDay() === 6) a.setUTCDate(a.getUTCDate() + 1);
    const first = valueToAnchor(paidLaunchDates[0]?.value);
    const last = valueToAnchor(paidLaunchDates[paidLaunchDates.length - 1]?.value);
    if (first && a < first) a = first;
    if (last && a > last) a = last;
    setFormData(prev => ({ ...prev, launchDate: anchorToValue(a) }));
  };

  // Re-launch Stripe checkout for a submission that was started but never paid.
  const resumePayment = async () => {
    if (!pendingSubmission) return;
    setLoading(true);
    setError(null);
    window.trackEvent('paid_checkout_resumed', { plan: pendingSubmission.plan });
    try {
      const result = await createCheckoutSession(pendingSubmission.plan, {
        startupTitle: pendingSubmission.title,
        userEmail: user?.email,
        submission: pendingSubmission,
        turnstileToken, // may be null on resume; payment gates the resume flow
      });
      // On success the helper navigates away; we only land here on failure.
      if (!result || result.success === false) {
        throw new Error(result?.error || 'Could not start payment. Please try again.');
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // User explicitly abandons the unpaid submission — drop the local draft.
  const discardPending = () => {
    try { localStorage.removeItem(PENDING_KEY); } catch (e) { /* ignore */ }
    setPendingSubmission(null);
    window.trackEvent('paid_checkout_discarded', { plan: pendingSubmission?.plan });
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    if (!user) {
      onLoginRequired();
      return;
    }

    // Anti-bot: require a solved Turnstile challenge on the FREE plan only —
    // paid plans are gated by Stripe payment. If the widget couldn't load
    // (e.g. blocked), don't hard-lock the user.
    if (formData.plan === 'free' && !turnstileToken && !turnstileUnavailable) {
      setError('Please complete the "I\'m human" verification to continue.');
      return;
    }

    // For the free plan, this site (or a subpage/subdomain) is already taken —
    // steer them to a paid plan instead of failing at insert time.
    if (formData.plan === 'free' && freeDomainTaken) {
      setError('This website is already submitted on the free plan. Choose Premium or Featured to launch it again.');
      return;
    }

    // Free launches must be unlocked first: upvote 3 + comment 1. The do-follow
    // backlink is optional now, so it's not part of this gate. The DB trigger
    // enforces the engagement rule regardless; this just catches it early with a
    // friendlier message.
    if (formData.plan === 'free' && freeStatus && !freeStatus.eligible) {
      setError('Complete the unlock steps first — upvote 3 products and comment on 1.');
      return;
    }

    setLoading(true);
    setError(null);

    window.trackEvent('form_submit', { plan: formData.plan });
    // Checkpoint logs so a stuck spinner can be diagnosed from DevTools
    // without redeploying. Each successful step prints its own line.
    console.info('[submit] handleSubmit start', { plan: formData.plan });

    try {
      if (!formData.url) throw new Error("Please enter a valid URL");
      if (!formData.url.startsWith('http://') && !formData.url.startsWith('https://')) {
        throw new Error("Please enter a valid URL starting with http:// or https://");
      }
      if (!formData.projectName) throw new Error("Please enter a project name");
      if (!formData.category) throw new Error("Please select a category for your startup");
      if (!isSupportedVideoUrl(formData.videoUrl)) {
        throw new Error("Demo video must be a YouTube or Loom link.");
      }

      // Slug is auto-derived and must NEVER block submission or surface as an
      // error. Backfill from the name/URL if somehow empty; uniqueness is
      // handled by the insert retry loop / webhook, not by the user.
      const slug = (formData.slug && formData.slug.trim())
        || generateSlug(formData.projectName)
        || generateSlug(formData.url.replace(/^https?:\/\//, ''))
        || `startup-${Math.floor(Math.random() * 100000)}`;

      const supabase = supabaseClient();

      // Screenshot capture is best-effort and goes through the Microlink free
      // tier, which is rate-limited and frequently slow. A hung screenshot
      // call here used to strand users on a stuck spinner with no console
      // error and no Stripe handoff. Bound it with a 6s timeout so we always
      // move on to the insert + Stripe redirect even if Microlink is down.
      let screenshotUrl = null;
      const SCREENSHOT_TIMEOUT_MS = 6000;
      const hasOwnScreenshots = (formData.screenshots || []).length > 0;
      // The maker supplied their own screenshots — don't spend 6s capturing one
      // we'd immediately discard.
      if (hasOwnScreenshots) {
        console.info('[submit] skipping auto-screenshot — maker uploaded their own');
      } else try {
        console.info('[submit] capturing screenshot (max 6s)');
        const screenshotPromise = (async () => {
          const capturedScreenshotUrl = await captureScreenshot(formData.url, {
            width: 1280,
            height: 800,
            waitUntil: 'networkidle2'
          });
          if (capturedScreenshotUrl) {
            return await uploadScreenshot(supabase, capturedScreenshotUrl, slug);
          }
          return null;
        })();

        let timeoutHandle;
        const timeoutPromise = new Promise((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error('screenshot_timeout')),
            SCREENSHOT_TIMEOUT_MS
          );
        });

        try {
          screenshotUrl = await Promise.race([screenshotPromise, timeoutPromise]);
        } finally {
          clearTimeout(timeoutHandle);
        }

        if (screenshotUrl) {
          console.info('[submit] screenshot ready');
        }
      } catch (screenshotError) {
        if (screenshotError && screenshotError.message === 'screenshot_timeout') {
          console.warn('[submit] screenshot skipped (timeout 6s) — Microlink slow/down');
          window.trackEvent('screenshot_timeout', { url: formData.url });
        } else {
          console.warn('[submit] screenshot skipped (error)', screenshotError);
          window.trackEvent('screenshot_failed', { error: String(screenshotError?.message || screenshotError).slice(0, 200) });
        }
      }

      console.info('[submit] preparing submission data');
      const authUser = window.auth.getCurrentUser();
      const contactEmail = formData.contactEmail || authUser?.email || '';
      const handle = normalizeHandle(formData.xProfile);
      let authorInfo = {
        name: handle,
        profile_url: `https://x.com/${handle}`,
        avatar: `https://unavatar.io/twitter/${handle}`,
        email: contactEmail
      };

      // Gallery: the maker's own screenshots win, then an AI-extracted cover,
      // then the auto-captured one. images[0] is the card + social share image.
      const gallery = (formData.screenshots || []).filter(Boolean);
      const fallbackCover = formData.coverUrl || screenshotUrl || null;
      const images = gallery.length ? gallery : (fallbackCover ? [fallbackCover] : []);
      const coverImage = images[0] || null;

      // Everything the startups table has no column for rides along in the
      // details jsonb — the AI extras plus what the maker filled in by hand.
      const detailsObj = {
        ...(aiDetails || {}),
        categories: formData.categories || [],
        seo_keyword: formData.seoKeyword.trim() || null,
        pricing_model: formData.pricingModel || null,
        open_source: !!formData.openSource,
        discount: formData.discount.trim() || null,
        // Posted as the maker's own comment the moment the product goes live.
        first_comment: formData.firstComment.trim() || null,
        socialLinks: {
          ...((aiDetails && aiDetails.socialLinks) || {}),
          ...(handle ? { x: `https://x.com/${handle}` } : {}),
          ...(formData.linkedin ? { linkedin: formData.linkedin } : {}),
          ...(formData.github ? { github: formData.github } : {}),
        },
      };

      // On the free plan, only honor a launch date that's an actually-available
      // slot in the grid — never a stray paid-window date. Paid plans use the
      // maker's chosen weekday as-is.
      const selectedLaunchDate = formData.plan === 'free'
        ? (availableLaunchDates.some(d => d.value === formData.launchDate && d.freeAvailable) ? formData.launchDate : '')
        : formData.launchDate;

      const resolvedLaunchDate = selectedLaunchDate || await (async () => {
        // For paid plans, use today's PST date so it launches on payment date.
        // The startups table has a CHECK constraint requiring launch_date to
        // be a weekday (Mon-Fri), so if today is a weekend bump forward to
        // the next Monday — otherwise the insert returns HTTP 400 and the
        // user never reaches Stripe checkout.
        if (formData.plan && formData.plan !== 'free') {
          const pstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
          let launchDay = new Date(pstNow);
          while (launchDay.getDay() === 0 || launchDay.getDay() === 6) {
            launchDay.setDate(launchDay.getDate() + 1);
          }
          return launchDay.getFullYear() + '-' +
            String(launchDay.getMonth() + 1).padStart(2, '0') + '-' +
            String(launchDay.getDate()).padStart(2, '0');
        }
        // For free plan, get next available scheduled date
        const { data: nextDate, error: dateError } = await supabase.rpc('get_next_launch_date');
        if (dateError) {
          const pst = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
          let nextDay = new Date(pst);
          nextDay.setDate(pst.getDate() + 1);
          while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
            nextDay.setDate(nextDay.getDate() + 1);
          }
          return nextDay.getFullYear() + '-' +
            String(nextDay.getMonth() + 1).padStart(2, '0') + '-' +
            String(nextDay.getDate()).padStart(2, '0');
        }
        return nextDate;
      })();

      const isPaid = formData.plan === 'premium' || formData.plan === 'featured';

      // PAID PLANS (premium / featured): do NOT write anything to the database
      // here. The startup row is created server-side ONLY after Stripe confirms
      // payment (stripe-webhook Edge Function reads the submission from the
      // checkout session metadata and inserts it as paid + live). This is what
      // prevents abandoned checkouts from leaving orphaned 'pending' rows.
      if (isPaid) {
        const submission = {
          title: formData.projectName,
          url: formData.url,
          tagline: formData.tagline || '',
          description: formData.description || '',
          slug,
          category: formData.category,
          tags: (formData.tags || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 5).join(','),
          author: authorInfo,
          logo_url: formData.logoUrl || '',
          screenshot_url: coverImage || '',
          images,
          demo_video_url: formData.videoUrl.trim() || '',
          details: detailsObj,
          plan: formData.plan,
          launch_date: resolvedLaunchDate,
          contact_email: contactEmail,
        };

        // Persist a local "not submitted yet" record. If the user abandons the
        // Stripe page and comes back, we surface a banner making it explicit
        // the launch was NOT submitted, and let them resume. Cleared on the
        // payment-success page once payment goes through.
        const draft = { ...submission, savedAt: Date.now() };
        try { localStorage.setItem(PENDING_KEY, JSON.stringify(draft)); } catch (e) { /* ignore */ }
        setPendingSubmission(draft);

        console.info('[submit] paid plan — handing off to Stripe with NO db insert', { plan: formData.plan });
        window.trackEvent('paid_checkout_started', { plan: formData.plan });

        const checkoutResult = await createCheckoutSession(formData.plan, {
          startupTitle: formData.projectName,
          userEmail: user?.email,
          submission,
          turnstileToken,
        });
        // createCheckoutSession sets window.location.href on success, so we
        // only get here if it failed. Keep the form mounted with an error and
        // the not-submitted banner so the user can retry.
        if (!checkoutResult || checkoutResult.success === false) {
          window.trackEvent('paid_checkout_blocked', {
            plan: formData.plan,
            error: String(checkoutResult?.error || 'unknown').slice(0, 200),
          });
          throw new Error(checkoutResult?.error || 'Could not start payment. Please try again.');
        }
        return;
      }

      // FREE PLAN: verify the Turnstile token server-side first so a bot that
      // never solved the challenge can't create a listing. We only treat an
      // explicit verification failure as fatal — if the endpoint is missing or
      // down we let a real user through rather than blocking them.
      if (turnstileToken) {
        console.info('[submit] verifying turnstile (free)');
        let verificationFailed = false;
        try {
          const vr = await fetch(VERIFY_TURNSTILE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ turnstileToken }),
          });
          if (vr.status === 403) {
            verificationFailed = true;
          } else if (vr.ok) {
            const vj = await vr.json().catch(() => ({}));
            if (vj && vj.success === false) verificationFailed = true;
          }
          // 404 / 5xx / other → endpoint missing or down; don't block a real user.
        } catch (e) {
          console.warn('[submit] turnstile verify unreachable — allowing submission', e);
        }
        if (verificationFailed) {
          try { if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId); } catch (e) { /* ignore */ }
          setTurnstileToken(null);
          throw new Error('Verification failed. Please complete the "I\'m human" check again.');
        }
      }

      // Insert, auto-generating a fresh slug on collision. The user NEVER sees a
      // slug / unique-id error — we just retry with a new suffix.
      console.info('[submit] inserting free startup row');
      const tagsArray = (formData.tags || '')
        .split(',').map(t => t.trim()).filter(Boolean).slice(0, 5);
      const baseRow = {
        title: formData.projectName,
        url: formData.url,
        tagline: formData.tagline || null,
        description: formData.description,
        category: formData.category,
        tags: tagsArray.length ? tagsArray : null,
        author: authorInfo,
        logo_url: formData.logoUrl || null,
        screenshot_url: coverImage,
        images: images.length ? images : null,
        demo_video_url: formData.videoUrl.trim() || null,
        details: detailsObj,
        plan: formData.plan,
        payment_status: 'paid',
        launch_date: resolvedLaunchDate,
        // Record the verified backlink for ops/audit (the gate itself is the
        // DB trigger checking backlink_verifications).
        backlink_url: backlinkUrl.trim() || null,
        backlink_verified_at: freeStatus && freeStatus.backlink_verified ? new Date().toISOString() : null,
      };

      let data = null;
      let trySlug = slug;
      for (let attempt = 0; attempt < 6; attempt++) {
        const res = await supabase
          .from('startups')
          .insert([{ ...baseRow, slug: trySlug }])
          .select('id, title, url, description, slug, author, screenshot_url, plan, launch_date')
          .single();

        if (!res.error) { data = res.data; break; }

        const msg = res.error.message || '';
        if (res.error.code === '23505' && /slug/i.test(msg)) {
          trySlug = makeUniqueSlug(slug); // silently pick a new slug and retry
          continue;
        }
        if (/DUPLICATE_FREE_DOMAIN/i.test(msg)) {
          throw new Error('This website (or one of its pages or subdomains) is already submitted on the free plan. Choose Premium or Featured to launch it again.');
        }
        if (/FREE_UNLOCK_REQUIRED/i.test(msg)) {
          checkFreeStatus(); // re-sync the unlock checklist
          throw new Error('Almost there — finish the unlock steps (upvote 3 products, comment on 1), then try again.');
        }
        if (res.error.code === '23505' && /email/i.test(msg)) {
          // Transitional: the one-active-free-launch-per-email unique index
          // still exists until the unlock migration is applied.
          throw new Error('You already have an active free launch. Choose Premium or Featured for additional launches.');
        }
        if (res.error.code === '23505' && /url/i.test(msg)) {
          throw new Error('This website has already been submitted. To launch it again, choose Premium or Featured.');
        }
        // Anything else: don't leak DB internals to the user.
        console.error('[submit] free insert error', res.error);
        throw new Error('Something went wrong submitting your startup. Please try again.');
      }

      if (!data) {
        throw new Error('Something went wrong submitting your startup. Please try again.');
      }

      console.info('[submit] free insert ok', { startup_id: data?.id });
      window.trackEvent('form_submit_success', { plan: formData.plan });

      // Submission complete — clear the saved in-progress form.
      try { localStorage.removeItem(FORMDATA_KEY); } catch (e) { /* ignore */ }

      // Free row is live-eligible immediately, so show the success screen.
      setSuccess(true);
      setShowSuccessPage(true);
      window.dispatchEvent(new Event("refresh-startups"));

    } catch (err) {
      setError(err.message);
      window.trackEvent('form_submit_error', { error: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while checking auth - login modal will auto-appear if not authenticated
  if (!user && !authLoading) {
    return html`
      <div class="max-w-4xl mx-auto px-4 py-12 md:py-16 text-center">
        <div class="inline-block animate-spin rounded-full h-10 w-10 border-2 border-gray-300 border-t-gray-900"></div>
        <p class="mt-4 text-sm text-gray-500">Please sign in to continue…</p>
      </div>
    `;
  }

  // Show loading state
  if (authLoading) {
    return html`
      <div class="max-w-4xl mx-auto px-4 py-12 md:py-16 text-center">
        <div class="inline-block animate-spin rounded-full h-10 w-10 border-2 border-gray-300 border-t-gray-900"></div>
        <p class="mt-4 text-sm text-gray-500">Loading…</p>
      </div>
    `;
  }

  // Success page
  if (showSuccessPage) {
    return html`
      <div class="max-w-3xl mx-auto px-4 py-10 md:py-14">
        <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 md:p-10">
          <div class="text-center mb-8">
            <div class="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 mb-4">
              <i class="fas fa-check text-emerald-600 text-xl"></i>
            </div>
            <h2 class="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 mb-2">Startup submitted 🚀</h2>
            ${formData.plan === 'free' ? html`
              <p class="text-gray-500">Your startup will be featured on the Home Page shortly.</p>
            ` : ''}
          </div>

          ${formData.plan === 'premium' || formData.plan === 'featured' ? html`
            <div class="mb-6 flex items-center gap-3 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl">
              <div class="animate-spin rounded-full h-4 w-4 border-2 border-orange-300 border-t-orange-700 shrink-0"></div>
              <div class="text-sm">
                <p class="font-medium text-gray-900">Redirecting to payment…</p>
                <p class="text-gray-600">You'll be redirected to Stripe to complete your ${formData.plan === 'featured' ? '$50 payment' : '$20 payment'}.</p>
                ${formData.launchDate ? html`<p class="text-gray-600 mt-1">Launch day: <strong>${formatLaunchLabel(formData.launchDate)}</strong>${formData.launchDate === pstDateStr() ? ' — live right after payment' : ' — scheduled, we\'ll launch it for you'}.</p>` : ''}
              </div>
            </div>
          ` : html`
            <div class="mb-6 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-900">
              Your submission has been added to the queue and will be featured on your selected launch date.
            </div>

            <!-- Phase 4 upsell: keep the paid option visible after the free launch is queued -->
            <div class="mb-6 px-4 py-4 bg-orange-50 border border-orange-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
              <div class="text-sm">
                <p class="font-semibold text-orange-900">Don't want to wait in the queue?</p>
                <p class="text-orange-800 mt-0.5">Upgrade to Priority and launch immediately with prominent placement — no backlink required.</p>
              </div>
              <a href="/submit?plan=premium" class="sh-btn-accent text-sm shrink-0">
                <i class="fas fa-bolt text-xs"></i> Go Priority
              </a>
            </div>
          `}

          <div class="mt-6 p-5 border border-orange-200 rounded-2xl bg-orange-50/40">
            <h3 class="font-semibold text-gray-900 mb-3 flex items-center">
              <i class="fas fa-award mr-2 text-orange-600"></i>
              Get your badge & keep your DR 37 backlink
            </h3>
            <div class="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p class="text-sm text-amber-900">Add our badge to your website to make your listing <strong>permanent</strong> and keep your backlink as <strong>dofollow</strong>.</p>
            </div>

            <div class="border border-gray-200 rounded-xl p-4 bg-white">
              <h4 class="text-sm font-semibold text-gray-900 mb-2">Embed code</h4>
              <img src="/badge-light.svg" alt="Featured on Submit Hunt" class="h-11 w-auto mb-3" />
              <div class="bg-gray-50 border border-gray-200 p-3 rounded-lg text-xs font-mono mb-3 overflow-x-auto text-gray-700">
                <code id="embed-code">&lt;a href="https://submithunt.com" target="_blank"&gt;&lt;img src="https://submithunt.com/badge-light.svg" alt="Featured on Submit Hunt" width="240" height="66" /&gt;&lt;/a&gt;</code>
              </div>
              <button
                onClick=${() => {
        const embedCode = document.getElementById('embed-code').textContent;
        navigator.clipboard.writeText(embedCode);
      }}
                class="sh-btn-ghost text-sm"
              >
                <i class="fas fa-copy text-xs"></i> Copy embed code
              </button>
            </div>
          </div>

          <div class="mt-8 flex flex-col items-center">
            <p class="mb-3 text-sm font-medium text-gray-700">Share your launch</p>
            <div class="flex space-x-3">
              <a href="https://twitter.com/intent/tweet?text=I%20just%20launched%20my%20startup%20on%20submithunt.com%21" target="_blank"
                 class="w-10 h-10 flex items-center justify-center rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors">
                <i class="fab fa-twitter"></i>
              </a>
              <a href="https://www.linkedin.com/sharing/share-offsite/?url=https://submithunt.com" target="_blank"
                 class="w-10 h-10 flex items-center justify-center rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors">
                <i class="fab fa-linkedin-in"></i>
              </a>
            </div>
          </div>

          <${Confetti} />

          <div class="flex justify-center mt-8">
            <a href="/" class="sh-btn-primary">
              <i class="fas fa-arrow-left text-xs"></i> Back to home
            </a>
          </div>
        </div>
      </div>
    `;
  }

  // Inline, per-field validation message.
  const fieldError = (name) => (fieldErrors[name]
    ? html`<p class="text-xs text-red-600 mt-1.5 flex items-start gap-1.5"><i class="fas fa-circle-exclamation mt-0.5"></i><span>${fieldErrors[name]}</span></p>`
    : '');
  // Red border on a field that failed validation.
  const errCls = (name) => (fieldErrors[name] ? ' !border-red-400' : '');

  // getDelayText() returns either a duration ("1 week") or a status string
  // ("Loading...", "No slots available"), so wrap it for prose contexts where
  // "next one in No slots available" would read wrong.
  const freeWaitPhrase = () => {
    const t = getDelayText();
    if (t === 'Loading...') return 'checking availability…';
    if (t === 'No slots available') return 'no free slots open right now';
    return `about ${t}`;
  };

  // Running total for the selected plan, shown above the submit button.
  const selectedPrice = PLAN_PRICE_USD[formData.plan] ?? 0;
  const selectedPlanLabel = formData.plan === 'featured' ? 'Featured spot'
    : (formData.plan === 'premium' ? 'Premium launch' : 'Free launch');
  // One plain-English line describing exactly what the submit button does next.
  // Free = queued for the chosen date, nothing charged. Paid = Stripe first,
  // and (per handleSubmit) nothing is written to the database until it clears.
  const submitSummary = () => {
    if (formData.plan === 'free') {
      return formData.launchDate
        ? `No payment. Your launch is queued for ${formatLaunchLabel(formData.launchDate)} and goes live that morning.`
        : 'No payment. Pick a launch date above and your launch is queued for that day.';
    }
    const day = formData.launchDate ? formatLaunchLabel(formData.launchDate) : 'your chosen weekday';
    const when = formData.launchDate && formData.launchDate === pstDateStr()
      ? 'goes live right after payment'
      : `is scheduled for ${day}`;
    return `You'll be sent to Stripe to pay $${selectedPrice} once. Nothing is published until payment clears — then your launch ${when}.`;
  };

  // Main form
  return html`
    <!-- Step 1 is a single column of form cards, so it reads better narrow;
         step 2's three plan cards need the wider container. Both steps are
         sectioned white cards on the page background — no outer card wrapper. -->
    <div class="${currentPage === 1 ? 'max-w-3xl' : 'max-w-5xl'} mx-auto px-4 py-10 md:py-14">
      <div>
        <div class="mb-6">
          <h2 class="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 mb-2">Launch your product</h2>
          <p class="text-gray-500">Tell us about your product. You can come back to edit before going live.</p>
        </div>

        <!-- Step indicator -->
        <div class="mb-8 flex items-center max-w-md">
          <div class="flex items-center gap-2 shrink-0">
            <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${currentPage >= 1 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}">
              ${currentPage > 1 ? html`<i class="fas fa-check text-[10px]"></i>` : '1'}
            </div>
            <span class="text-sm font-medium ${currentPage >= 1 ? 'text-gray-900' : 'text-gray-400'}">Your product</span>
          </div>
          <div class="flex-1 h-px mx-3 ${currentPage > 1 ? 'bg-gray-900' : 'bg-gray-200'}"></div>
          <div class="flex items-center gap-2 shrink-0">
            <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${currentPage >= 2 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}">2</div>
            <span class="text-sm font-medium ${currentPage >= 2 ? 'text-gray-900' : 'text-gray-400'}">Plan & launch</span>
          </div>
        </div>

        <div class="mb-6 flex items-start gap-3 p-4 bg-orange-50/60 border border-orange-200 rounded-xl">
          <div class="w-8 h-8 rounded-lg bg-white border border-orange-200 flex items-center justify-center text-orange-600 shrink-0">
            <i class="fas fa-rocket text-sm"></i>
          </div>
          <div class="text-sm">
            <p class="font-medium text-gray-900">Submit your startup, get a DR 37 backlink</p>
            <p class="text-gray-600 mt-0.5">Join hundreds of founders who chose SubmitHunt.</p>
          </div>
        </div>

        ${error && html`
          <div class="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
            <p class="text-sm text-red-700">${error}</p>
          </div>
        `}

        ${pendingSubmission && html`
          <div class="mb-6 px-4 py-4 bg-amber-50 border-2 border-amber-300 rounded-xl">
            <div class="flex items-start gap-3">
              <i class="fas fa-triangle-exclamation text-amber-600 mt-0.5"></i>
              <div class="flex-1">
                <p class="font-semibold text-amber-900">Not submitted yet — payment required</p>
                <p class="text-sm text-amber-800 mt-0.5">
                  Your ${pendingSubmission.plan === 'featured' ? 'Featured' : 'Premium'} launch for
                  "${pendingSubmission.title}" was <strong>not submitted</strong> — the payment wasn't
                  completed. Nothing is published until you finish payment.
                </p>
                <div class="flex flex-wrap gap-2 mt-3">
                  <button type="button" onClick=${resumePayment} class="sh-btn-accent text-sm disabled:opacity-50" disabled=${loading}>
                    ${loading ? html`<i class="fas fa-spinner fa-spin text-xs"></i> Redirecting…` : html`<i class="fas fa-credit-card text-xs"></i> Resume payment`}
                  </button>
                  <button type="button" onClick=${discardPending} class="sh-btn-ghost text-sm" disabled=${loading}>
                    Discard
                  </button>
                </div>
              </div>
            </div>
          </div>
        `}

        <form onSubmit=${handleSubmit}>
          ${currentPage === 1 ? html`
            <div class="space-y-5">
              <!-- ============ Product details ============ -->
              <section class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-6 space-y-5">
                <div>
                  <h3 class="text-lg font-semibold tracking-tight text-gray-900">Product details</h3>
                  <p class="text-sm text-gray-500 mt-0.5">Your story, website, categories, and whether the product is open source.</p>
                </div>

                <!-- AI-Powered Form Prefill -->
                <div class="rounded-xl border border-dashed border-indigo-300 bg-indigo-50/40 p-4">
                  <div class="flex items-start gap-3 mb-3">
                    <div class="w-8 h-8 rounded-lg bg-white border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
                      <i class="fas fa-wand-magic-sparkles text-sm"></i>
                    </div>
                    <div class="min-w-0">
                      <p class="font-semibold text-gray-900 text-sm">AI-powered form prefill</p>
                      <p class="text-xs text-gray-600 mt-0.5">Paste your URL and we'll fill the form automatically — name, tagline, description, categories, pricing, logo, cover and social links.</p>
                    </div>
                  </div>

                <div class="flex flex-col lg:flex-row gap-3 lg:items-start">
                  <div class="flex-1 min-w-0">
                    <div class="flex flex-col sm:flex-row gap-2">
                      <input
                        type="url" id="url" name="url"
                        value=${formData.url}
                        onInput=${handleChange}
                        onBlur=${() => lookupDomainRating(formData.url)}
                        class="sh-input flex-1${errCls('url')}"
                        placeholder="https://mystartup.com"
                      />
                      <button
                        type="button"
                        onClick=${() => { handleAutoFill(); lookupDomainRating(formData.url); }}
                        disabled=${autoFilling || !formData.url}
                        class="shrink-0 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        ${autoFilling
                          ? html`<i class="fas fa-spinner fa-spin text-xs"></i> AI is reading your site…`
                          : html`<i class="fas fa-wand-magic-sparkles text-xs"></i> Prefill with AI`}
                      </button>
                    </div>
                    ${autoFilled
                      ? html`<p class="text-xs text-emerald-600 mt-1.5 flex items-center gap-1"><i class="fas fa-check"></i> Filled in empty fields. Review before publishing.</p>`
                      : html`<p class="sh-help">Fills empty fields only — anything you've typed is left alone.</p>`}
                    ${fieldError('url')}
                    ${prefillError ? html`<p class="text-xs text-red-600 mt-1.5">${prefillError}</p>` : ''}
                  </div>

                  <!-- Domain Rating. We show the maker's MEASURED DR (a real Ahrefs
                       lookup) next to ours — both are facts. We deliberately do NOT
                       project a post-launch DR: no one can predict what a single
                       backlink does to a domain's rating, and the old "With us"
                       tile invented that number from a formula. -->
                  ${(drLoading || drValue != null) ? html`
                    <div class="flex items-stretch gap-2 shrink-0">
                      ${drLoading && drValue == null ? html`
                        <div class="rounded-xl border border-gray-200 bg-white px-3 py-2 flex items-center gap-2 text-xs text-gray-500"><i class="fas fa-spinner fa-spin"></i> Checking DR…</div>
                      ` : html`
                        <div class="rounded-xl border border-gray-200 bg-white px-3 py-2 text-center w-[80px]">
                          <p class="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Your DR</p>
                          <p class="text-2xl font-bold text-gray-900 tabular-nums leading-tight">${Math.round((drValue || 0) * drAnim)}</p>
                          <div class="h-1 rounded-full bg-gray-100 mt-1 overflow-hidden"><div class="h-full bg-gray-400" style="width:${(drValue || 0) * drAnim}%"></div></div>
                        </div>
                        <div class="flex flex-col items-center justify-center text-gray-300 px-0.5">
                          <i class="fas fa-link text-sm"></i>
                        </div>
                        <div class="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-center w-[80px]">
                          <p class="text-[9px] font-semibold uppercase tracking-wider text-emerald-600">Our DR</p>
                          <p class="text-2xl font-bold text-emerald-700 tabular-nums leading-tight">${Math.round(SITE_DR * drAnim)}</p>
                          <div class="h-1 rounded-full bg-emerald-100 mt-1 overflow-hidden"><div class="h-full bg-emerald-500" style="width:${SITE_DR * drAnim}%"></div></div>
                        </div>
                      `}
                    </div>
                  ` : ''}
                </div>
              </div>

                <!-- Name + tagline: the two lines every card and search result shows -->
                <div class="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label class="sh-label" for="projectName">
                      <span class="sh-req">Product name</span>
                      ${counter(formData.projectName, LIMITS.name)}
                    </label>
                    <input
                      type="text" id="projectName" name="projectName"
                      placeholder="Acme"
                      value=${formData.projectName}
                      onInput=${handleChange}
                      maxlength=${LIMITS.name}
                      class="sh-input${errCls('projectName')}"
                    />
                    ${fieldError('projectName')}
                  </div>
                  <div>
                    <label class="sh-label" for="tagline">
                      <span class="sh-req">One-line tagline</span>
                      ${counter(formData.tagline, LIMITS.tagline)}
                    </label>
                    <input
                      type="text" id="tagline" name="tagline"
                      placeholder="Everything you need to agree"
                      value=${formData.tagline}
                      onInput=${handleChange}
                      maxlength=${LIMITS.tagline}
                      class="sh-input${errCls('tagline')}"
                    />
                    ${fieldError('tagline')}
                  </div>
                </div>

                <div>
                  <label class="sh-label" for="description">
                    <span class="sh-req">Product description</span>
                    ${counter(formData.description, LIMITS.description)}
                  </label>
                  <textarea
                    id="description" name="description"
                    value=${formData.description}
                    onInput=${handleChange}
                    maxlength=${LIMITS.description}
                    rows="5"
                    class="sh-textarea${errCls('description')}"
                    placeholder="What does your product do, who is it for, and what makes it different?"
                  ></textarea>
                  ${fieldError('description')}
                </div>

                <div>
                  <label class="sh-label" for="seoKeyword">
                    <span>What do people search for to find a tool like yours?</span>
                    ${counter(formData.seoKeyword, LIMITS.seoKeyword)}
                  </label>
                  <input
                    type="text" id="seoKeyword" name="seoKeyword"
                    value=${formData.seoKeyword}
                    onInput=${handleChange}
                    maxlength=${LIMITS.seoKeyword}
                    class="sh-input"
                    placeholder="e.g. svg to png converter"
                  />
                  <p class="sh-help">Optional. One search term this page should target — not your brand name, and not a list.</p>
                </div>

                <div>
                  <label class="sh-label" for="websiteUrl"><span class="sh-req">Website URL</span></label>
                  <input
                    type="url" id="websiteUrl" name="url"
                    value=${formData.url}
                    onInput=${handleChange}
                    onBlur=${() => lookupDomainRating(formData.url)}
                    class="sh-input${errCls('url')}"
                    placeholder="https://mystartup.com"
                  />
                  <div class="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
                    <p class="text-xs text-gray-400">
                      Your listing: <span class="font-mono text-gray-500">submithunt.com/startup/${formData.slug || 'your-product'}</span>
                    </p>
                    <button type="button" onClick=${() => setShowSlugEditor(!showSlugEditor)} class="text-xs font-semibold text-gray-600 hover:text-gray-900 underline underline-offset-2">
                      ${showSlugEditor ? 'Done' : 'Edit'}
                    </button>
                  </div>
                  ${showSlugEditor ? html`
                    <input
                      type="text" id="slug" name="slug"
                      value=${formData.slug}
                      onInput=${handleChange}
                      class="sh-input mt-2"
                      placeholder="my-awesome-startup"
                    />
                  ` : ''}
                </div>

                <div id="field-categories">
                  <label class="sh-label">
                    <span class="sh-req">Categories</span>
                    <span class="sh-counter${(formData.categories || []).length >= MAX_CATEGORIES ? ' sh-counter--max' : ''}">${(formData.categories || []).length}/${MAX_CATEGORIES}</span>
                  </label>
                  <div class="flex flex-wrap gap-1.5">
                    ${CATEGORIES.map((cat) => {
      const on = (formData.categories || []).includes(cat.value);
      const full = (formData.categories || []).length >= MAX_CATEGORIES;
      return html`
                        <button
                          type="button"
                          onClick=${() => toggleCategory(cat.value)}
                          disabled=${!on && full}
                          class="sh-chip${on ? ' sh-chip--on' : ''}"
                          aria-pressed=${on ? 'true' : 'false'}
                        >${cat.emoji} ${cat.value}</button>`;
    })}
                  </div>
                  <p class="sh-help">Pick up to ${MAX_CATEGORIES}. The first one you pick is your primary category.</p>
                  ${fieldError('categories')}
                </div>

                <div>
                  <label class="sh-label" for="tags"><span>Tags</span></label>
                  <input
                    type="text" id="tags" name="tags"
                    value=${formData.tags}
                    onInput=${handleChange}
                    class="sh-input"
                    placeholder="ai, productivity, saas"
                  />
                  <p class="sh-help">Optional. Comma-separated, up to 5 — shown on your listing card.</p>
                </div>

                <label class="flex items-center justify-between gap-4 rounded-xl border border-gray-200 px-4 py-3 cursor-pointer hover:border-gray-300 transition-colors">
                  <span class="min-w-0">
                    <span class="block text-sm font-semibold text-gray-900">Open source</span>
                    <span class="block text-xs text-gray-500 mt-0.5">Is your product open source?</span>
                  </span>
                  <span class="sh-switch">
                    <input type="checkbox" checked=${formData.openSource} onChange=${(e) => setField('openSource', e.target.checked)} />
                    <span class="sh-switch-track"></span>
                    <span class="sh-switch-thumb"></span>
                  </span>
                </label>
              </section>

              <!-- ============ Media ============ -->
              <section class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-6 space-y-5">
                <div>
                  <h3 class="text-lg font-semibold tracking-tight text-gray-900">Media</h3>
                  <p class="text-sm text-gray-500 mt-0.5">Logo, gallery, social handle, and an optional demo video.</p>
                </div>

                <div id="field-logoUrl">
                  <label class="sh-label"><span class="sh-req">Logo</span></label>
                  <div class="flex items-center gap-3">
                    <label class="sh-dropzone w-20 h-20 shrink-0 overflow-hidden ${fieldErrors.logoUrl ? '!border-red-400' : ''}">
                      ${uploadingLogo
                        ? html`<i class="fas fa-spinner fa-spin"></i>`
                        : (formData.logoUrl
                            ? html`<img src=${formData.logoUrl} alt="Logo preview" class="w-full h-full object-contain bg-white" />`
                            : html`<i class="fas fa-image text-lg"></i>`)}
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" onChange=${handleLogoUpload} />
                    </label>
                    <div class="min-w-0">
                      <label class="sh-btn-ghost text-sm cursor-pointer">
                        <i class="fas fa-upload text-xs"></i> ${formData.logoUrl ? 'Replace logo' : 'Upload logo'}
                        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" onChange=${handleLogoUpload} />
                      </label>
                      <p class="sh-help">Square, 512×512 or larger. PNG, JPG, WebP or GIF, up to 2 MB.<br/>Non-square logos get cropped to a square from the center.</p>
                    </div>
                  </div>
                  ${fieldError('logoUrl')}
                </div>

                <div id="field-screenshots">
                  <label class="sh-label">
                    <span>Screenshots</span>
                    <span class="sh-counter${(formData.screenshots || []).length >= MAX_SCREENSHOTS ? ' sh-counter--max' : ''}">${(formData.screenshots || []).length}/${MAX_SCREENSHOTS}</span>
                  </label>
                  <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    ${(formData.screenshots || []).map((url, i) => html`
                      <div class="sh-thumb">
                        <img src=${url} alt=${`Screenshot ${i + 1}`} />
                        ${i === 0
                          ? html`<span class="sh-thumb-tag">Cover</span>`
                          : html`<button type="button" onClick=${() => makePrimaryScreenshot(i)} class="sh-thumb-tag sh-thumb-tag--btn" title="Use as cover">Make cover</button>`}
                        <button type="button" class="sh-thumb-x" onClick=${() => removeScreenshot(i)} aria-label=${`Remove screenshot ${i + 1}`}>
                          <i class="fas fa-xmark"></i>
                        </button>
                      </div>
                    `)}
                    ${(formData.screenshots || []).length < MAX_SCREENSHOTS ? html`
                      <label class="sh-dropzone aspect-video ${fieldErrors.screenshots ? '!border-red-400' : ''}">
                        ${uploadingCover
                          ? html`<i class="fas fa-spinner fa-spin"></i>`
                          : html`<i class="fas fa-image text-lg"></i>`}
                        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple class="hidden" onChange=${handleScreenshotUpload} />
                      </label>
                    ` : ''}
                  </div>
                  <p class="sh-help">
                    Landscape 16:9, 1920×1080 or larger. PNG, JPG, WebP or GIF, up to 10 MB each.<br/>
                    Anything that isn't 16:9 is cropped from the center, so phone screenshots lose most of their height — put them on a 16:9 background instead.<br/>
                    The first screenshot is also your social share image, so lead with the best one. Leave this empty and we'll capture your homepage automatically.
                  </p>
                  ${fieldError('screenshots')}
                </div>

                <div>
                  <label class="sh-label" for="xProfile"><span class="sh-req">X / Twitter username</span></label>
                  <div class="relative">
                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">@</span>
                    <input
                      type="text" id="xProfile" name="xProfile"
                      value=${formData.xProfile}
                      onInput=${handleChange}
                      onBlur=${(e) => setField('xProfile', normalizeHandle(e.target.value))}
                      class="sh-input sh-input--prefix${errCls('xProfile')}"
                      placeholder="username"
                    />
                  </div>
                  <p class="sh-help">Paste your profile URL or just the handle — we'll clean it up. Used for your listing's author avatar.</p>
                  ${fieldError('xProfile')}
                </div>

                <div class="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label class="sh-label" for="linkedin"><span>LinkedIn</span></label>
                    <input
                      type="text" id="linkedin" name="linkedin"
                      value=${formData.linkedin}
                      onInput=${handleChange}
                      class="sh-input"
                      placeholder="linkedin.com/company/…"
                    />
                  </div>
                  <div>
                    <label class="sh-label" for="github"><span>GitHub</span></label>
                    <input
                      type="text" id="github" name="github"
                      value=${formData.github}
                      onInput=${handleChange}
                      class="sh-input"
                      placeholder="github.com/…"
                    />
                  </div>
                </div>

                <div>
                  <label class="sh-label" for="videoUrl"><span>Demo video</span></label>
                  <input
                    type="url" id="videoUrl" name="videoUrl"
                    value=${formData.videoUrl}
                    onInput=${handleChange}
                    class="sh-input${errCls('videoUrl')}"
                    placeholder="https://youtube.com/watch?v=… or https://loom.com/share/…"
                  />
                  <p class="sh-help">Optional. YouTube or Loom URL — it plays on your listing page.</p>
                  ${fieldError('videoUrl')}
                </div>
              </section>

              <!-- ============ Pricing & launch extras ============ -->
              <section class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-6 space-y-5">
                <div>
                  <h3 class="text-lg font-semibold tracking-tight text-gray-900">Pricing & launch extras</h3>
                  <p class="text-sm text-gray-500 mt-0.5">How your product is priced, an optional deal, and your opening comment.</p>
                </div>

                <div>
                  <label class="sh-label" for="pricingModel"><span>Pricing</span></label>
                  <select id="pricingModel" name="pricingModel" value=${formData.pricingModel} onChange=${handleChange} class="sh-select">
                    <option value="">Select pricing…</option>
                    ${PRICING_MODELS.map((p) => html`<option value=${p.value} selected=${formData.pricingModel === p.value}>${p.label}</option>`)}
                  </select>
                  <p class="sh-help">Optional. Shown as a badge so people know what to expect before they click.</p>
                </div>

                <div class="rounded-xl border border-gray-200 overflow-hidden">
                  <label class="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer">
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold text-gray-900">Launch discount</span>
                      <span class="block text-xs text-gray-500 mt-0.5">Offer something to people who find you here.</span>
                    </span>
                    <span class="sh-switch">
                      <input
                        type="checkbox"
                        checked=${!!formData.discount || discountOn}
                        onChange=${(e) => { setDiscountOn(e.target.checked); if (!e.target.checked) setField('discount', ''); }}
                      />
                      <span class="sh-switch-track"></span>
                      <span class="sh-switch-thumb"></span>
                    </span>
                  </label>
                  ${(discountOn || formData.discount) ? html`
                    <div class="px-4 pb-4 pt-1 border-t border-gray-100">
                      <label class="sh-label mt-3" for="discount">
                        <span>Discount badge</span>
                        ${counter(formData.discount, LIMITS.discount)}
                      </label>
                      <input
                        type="text" id="discount" name="discount"
                        value=${formData.discount}
                        onInput=${handleChange}
                        maxlength=${LIMITS.discount}
                        class="sh-input"
                        placeholder="e.g. 30% off for 3 months with code HUNT30"
                      />
                    </div>
                  ` : ''}
                </div>

                <div>
                  <label class="sh-label" for="firstComment">
                    <span>Write the first comment</span>
                    ${counter(formData.firstComment, LIMITS.firstComment)}
                  </label>
                  <textarea
                    id="firstComment" name="firstComment"
                    value=${formData.firstComment}
                    onInput=${handleChange}
                    maxlength=${LIMITS.firstComment}
                    rows="4"
                    class="sh-textarea${errCls('firstComment')}"
                    placeholder="Share why you built this and what you'd love feedback on…"
                  ></textarea>
                  <p class="sh-help">Optional. We post this as your comment the moment your product goes live.</p>
                  ${fieldError('firstComment')}
                </div>
              </section>

              <div class="flex justify-end gap-2">
                <a href="/" class="sh-btn-ghost">Cancel</a>
                <button
                  type="button"
                  onClick=${goToNextPage}
                  class="sh-btn-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled=${loading}
                >
                  Continue to plan & launch <i class="fas fa-arrow-right text-xs"></i>
                </button>
              </div>
            </div>
          ` : html`
            <!-- Page 2: Plan Selection -->
            <div class="space-y-5">
              <!-- ============ Social proof ============
                   Numbers come from LAUNCH_STATS, measured from production.
                   Never add a stat here that isn't actually counted. -->
              <section class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-6">
                <div>
                  <h3 class="text-lg font-semibold tracking-tight text-gray-900">Real users, real traction</h3>
                  <p class="text-sm text-gray-500 mt-0.5">Counted from our own database on 28 July 2026 — no rounded-up vanity numbers.</p>
                </div>
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
                  ${LAUNCH_STATS.map((stat) => html`
                    <div class="rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-4">
                      <p class="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 tabular-nums leading-none">${stat.value}</p>
                      <p class="text-sm font-medium text-gray-700 mt-2">${stat.label}</p>
                      <p class="text-xs text-gray-400 mt-0.5">${stat.hint}</p>
                    </div>
                  `)}
                </div>
              </section>

              <!-- ============ Plans ============ -->
              <section class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-6">
                <div class="mb-5">
                  <h3 class="text-lg font-semibold tracking-tight text-gray-900">Choose how you launch</h3>
                  <p class="text-sm text-gray-500 mt-0.5">Every plan gets you a listing and a backlink. Paid plans skip the queue and the unlock steps.</p>
                </div>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <!-- Free Plan -->
                <div
                  class="bg-white rounded-2xl border ${formData.plan === 'free' ? 'border-gray-900 ring-2 ring-gray-900/10' : 'border-gray-200 hover:border-gray-300'} transition-all flex flex-col overflow-hidden"
                >
                  <div class="px-5 pt-5 pb-4 flex items-center gap-2">
                    <span class="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider text-gray-600 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                      Free
                    </span>
                    ${user && !statusLoading && !freeUnlocked ? html`
                      <span class="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        <i class="fas fa-lock text-[9px]"></i> Unlock below
                      </span>
                    ` : ''}
                  </div>

                  <div class="px-5 pb-5 flex-1 flex flex-col">
                    <div class="text-sm text-gray-500 mb-1">Standard Launch</div>
                    <div class="flex items-baseline gap-1 mb-1">
                      <span class="text-3xl font-semibold tracking-tight text-gray-900">$${PLAN_PRICE_USD.free}</span>
                      <span class="text-gray-500 text-sm">forever</span>
                    </div>
                    <div class="text-xs text-gray-500 mb-5">No payment method needed</div>

                    <button
                      type="button"
                      class="w-full py-2.5 px-4 rounded-xl font-medium text-sm mb-5 flex items-center justify-center gap-2 transition-colors ${formData.plan === 'free' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 hover:border-gray-300'}"
                      onClick=${() => selectPlan('free')}
                    >
                      ${formData.plan === 'free' ? html`<i class="fas fa-check text-xs"></i> Selected` : html`Start with Free <i class="fas fa-arrow-right text-xs"></i>`}
                    </button>

                    <div class="space-y-2.5 flex-1">
                      <div class="flex items-start gap-2.5">
                        <i class="fas fa-check text-gray-400 mt-1 text-xs"></i>
                        <span class="text-gray-700 text-sm">Live on homepage for 7 days</span>
                      </div>
                      <div class="flex items-start gap-2.5">
                        <i class="fas fa-check text-gray-400 mt-1 text-xs"></i>
                        <span class="text-gray-700 text-sm">Badge for top 3 ranking</span>
                      </div>
                      <div class="flex items-start gap-2.5">
                        <i class="fas fa-check text-gray-400 mt-1 text-xs"></i>
                        <span class="text-gray-700 text-sm">Do-follow backlink if you add our badge to your site</span>
                      </div>

                      <!-- The honest trade-off, spelled out rather than buried:
                           these are the real requirements the free path enforces
                           (the unlock checklist and the 6-slots-a-day queue). -->
                      <div class="mt-3 pt-3 border-t border-gray-200 space-y-2">
                        <p class="text-[11px] font-semibold uppercase tracking-wider text-gray-400">What it asks of you</p>
                        <div class="flex items-start gap-2.5">
                          <i class="fas fa-arrow-up text-gray-400 mt-1 text-xs"></i>
                          <span class="text-gray-600 text-sm">Upvote 3 products and comment on 1</span>
                        </div>
                        <div class="flex items-start gap-2.5">
                          <i class="fas fa-clock text-amber-500 mt-1 text-xs"></i>
                          <span class="text-amber-700 text-sm font-medium">Wait for a free slot — ${freeWaitPhrase()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Premium Plan -->
                <div
                  class="bg-white rounded-2xl border ${formData.plan === 'premium' ? 'border-orange-500 ring-2 ring-orange-200' : 'border-orange-300'} transition-all flex flex-col overflow-hidden relative"
                >
                  <div class="absolute -top-2.5 left-1/2 -translate-x-1/2">
                    <!-- "Recommended", not "Most popular": 1,618 of 1,661 launches are free,
                         so a popularity claim on a paid plan would be false. -->
                    <span class="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider text-white bg-orange-600 px-3 py-0.5 rounded-full">
                      Recommended
                    </span>
                  </div>

                  <div class="px-5 pt-7 pb-4">
                    <span class="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                      Premium
                    </span>
                  </div>

                  <div class="px-5 pb-5 flex-1 flex flex-col">
                    <div class="text-sm text-gray-500 mb-1">Premium Launch</div>
                    <div class="flex items-baseline gap-1 mb-1">
                      <span class="text-3xl font-semibold tracking-tight text-gray-900">$${PLAN_PRICE_USD.premium}</span>
                      <span class="text-gray-500 text-sm">/ launch</span>
                    </div>
                    <div class="text-xs text-gray-500 mb-5">One-time payment</div>

                    <button
                      type="button"
                      class="w-full py-2.5 px-4 rounded-xl font-medium text-sm mb-5 flex items-center justify-center gap-2 transition-colors ${formData.plan === 'premium' ? 'bg-orange-700 text-white' : 'bg-orange-600 text-white hover:bg-orange-700'}"
                      onClick=${() => selectPlan('premium')}
                    >
                      ${formData.plan === 'premium' ? html`<i class="fas fa-check text-xs"></i> Selected` : html`Choose Premium <i class="fas fa-arrow-right text-xs"></i>`}
                    </button>

                    <div class="space-y-2.5 flex-1">
                      <div class="flex items-start gap-2.5">
                        <i class="fas fa-check text-orange-600 mt-1 text-xs"></i>
                        <span class="text-gray-700 text-sm">Live on homepage for 14 days</span>
                      </div>
                      <div class="flex items-start gap-2.5">
                        <i class="fas fa-check text-orange-600 mt-1 text-xs"></i>
                        <span class="text-gray-700 text-sm">Badge for top 3 ranking</span>
                      </div>
                      <div class="flex items-start gap-2.5">
                        <i class="fas fa-circle-check text-green-600 mt-1 text-xs"></i>
                        <span class="text-green-700 text-sm font-semibold">Guaranteed dofollow backlink</span>
                      </div>
                      <div class="flex items-start gap-2.5">
                        <i class="fas fa-bolt text-orange-600 mt-1 text-xs"></i>
                        <span class="text-gray-900 text-sm font-bold">Skip queue — launch immediately</span>
                      </div>
                      <div class="flex items-start gap-2.5">
                        <i class="fas fa-envelope text-orange-600 mt-1 text-xs"></i>
                        <span class="text-gray-700 text-sm">Featured in newsletter</span>
                      </div>

                      <!-- Replaces the old "2 of 3 slots left today" + 15-minute
                           countdown. Both were fabricated: the slot count was
                           hardcoded and the timer restarted on every page load.
                           These three lines are the REAL differences vs the free
                           plan, enforced by this very form. -->
                      <div class="mt-3 pt-3 border-t border-orange-100 space-y-2">
                        <p class="text-[11px] font-semibold uppercase tracking-wider text-orange-500">What you skip vs free</p>
                        <div class="flex items-start gap-2.5">
                          <i class="fas fa-xmark text-orange-400 mt-1 text-xs"></i>
                          <span class="text-gray-600 text-sm">No upvote/comment unlock steps</span>
                        </div>
                        <div class="flex items-start gap-2.5">
                          <i class="fas fa-xmark text-orange-400 mt-1 text-xs"></i>
                          <span class="text-gray-600 text-sm">No queue wait — pick any weekday, or launch today</span>
                        </div>
                        <div class="flex items-start gap-2.5">
                          <i class="fas fa-xmark text-orange-400 mt-1 text-xs"></i>
                          <span class="text-gray-600 text-sm">No badge required on your site to keep the link do-follow</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Featured Spot -->
                <div
                  class="bg-white rounded-2xl border ${formData.plan === 'featured' ? 'border-gray-900 ring-2 ring-gray-900/10' : 'border-gray-200 hover:border-gray-300'} transition-all flex flex-col overflow-hidden"
                >
                  <div class="px-5 pt-5 pb-4">
                    <span class="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      Featured spot
                    </span>
                  </div>

                  <div class="px-5 pb-5 flex-1 flex flex-col">
                    <div class="text-sm text-gray-500 mb-1">Premium Placement</div>
                    <div class="flex items-baseline gap-1 mb-1">
                      <span class="text-3xl font-semibold tracking-tight text-gray-900">$${PLAN_PRICE_USD.featured}</span>
                      <span class="text-gray-500 text-sm">one-time</span>
                    </div>
                    <div class="text-xs text-gray-500 mb-5">7 days featured, no subscription</div>

                    <button
                      type="button"
                      class="w-full py-2.5 px-4 rounded-xl font-medium text-sm mb-5 flex items-center justify-center gap-2 transition-colors ${formData.plan === 'featured' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 hover:border-gray-300'}"
                      onClick=${() => selectPlan('featured')}
                    >
                      ${formData.plan === 'featured' ? html`<i class="fas fa-check text-xs"></i> Selected` : html`Choose Featured <i class="fas fa-arrow-right text-xs"></i>`}
                    </button>

                    <div class="space-y-2.5 flex-1">
                      <div class="flex items-start gap-2.5">
                        <i class="fas fa-check text-gray-400 mt-1 text-xs"></i>
                        <span class="text-gray-700 text-sm">Featured placement in feed</span>
                      </div>
                      <div class="flex items-start gap-2.5">
                        <i class="fas fa-check text-gray-400 mt-1 text-xs"></i>
                        <span class="text-gray-700 text-sm">Pinned to the top of the feed for 7 days</span>
                      </div>
                      <div class="flex items-start gap-2.5">
                        <i class="fas fa-circle-check text-green-600 mt-1 text-xs"></i>
                        <span class="text-green-700 text-sm font-semibold">Guaranteed dofollow backlink</span>
                      </div>
                      <div class="flex items-start gap-2.5">
                        <i class="fas fa-check text-gray-400 mt-1 text-xs"></i>
                        <span class="text-gray-700 text-sm">Colorful gradient border</span>
                      </div>
                      <div class="flex items-start gap-2.5">
                        <i class="fas fa-check text-gray-400 mt-1 text-xs"></i>
                        <span class="text-gray-700 text-sm">One-time payment, no subscription</span>
                      </div>

                      <!-- Same honest framing as Premium: only differences this
                           form actually enforces. -->
                      <div class="mt-3 pt-3 border-t border-gray-200 space-y-2">
                        <p class="text-[11px] font-semibold uppercase tracking-wider text-gray-400">What you skip vs free</p>
                        <div class="flex items-start gap-2.5">
                          <i class="fas fa-xmark text-gray-400 mt-1 text-xs"></i>
                          <span class="text-gray-600 text-sm">No unlock steps, no queue, no badge requirement</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

                <p class="text-xs text-gray-400 mt-4">
                  Free is a real option — it stays selectable above and costs nothing.
                  Premium starts selected because it's our recommended plan; you're only
                  charged after you click a priced payment button.
                </p>
              </section>

              ${(formData.plan === 'premium' || formData.plan === 'featured') && paidLaunchDates.length > 0 ? (() => {
    const todayStr = pstDateStr();
    const soonest = paidLaunchDates[0];
    const latest = paidLaunchDates[paidLaunchDates.length - 1];
    const launchesToday = formData.launchDate === todayStr;
    return html`
                <section class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-6">
                  <div class="mb-4">
                    <h3 class="text-lg font-semibold tracking-tight text-gray-900">Choose your launch day</h3>
                    <p class="text-sm text-gray-500 mt-0.5">
                      Your ${formData.plan === 'featured' ? 'Featured Spot' : 'Premium launch'} goes live at <strong>8 AM PST</strong> on the weekday you pick — launch now, or schedule any weekday through ${formatLaunchLabel(latest.value, { month: 'long', day: 'numeric' })}.
                    </p>
                  </div>

                  <div class="grid grid-cols-5 gap-2 mb-4">
                    ${paidLaunchDates.slice(0, 10).map((d, i) => {
      const isSelected = formData.launchDate === d.value;
      const isSoonest = i === 0;
      return html`
                        <button
                          type="button"
                          onClick=${() => selectPaidDate(d.value)}
                          class="relative text-center pt-3 pb-2 px-1 rounded-lg border-2 transition-all ${isSelected ? 'border-orange-500 bg-orange-100' : 'border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50'}"
                        >
                          ${isSoonest ? html`<span class="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-wide bg-orange-500 text-white px-1.5 py-0.5 rounded-full whitespace-nowrap">Soonest</span>` : ''}
                          <div class="text-[11px] font-bold ${isSelected ? 'text-orange-700' : 'text-gray-500'}">${d.short}</div>
                          <div class="text-lg font-bold ${isSelected ? 'text-orange-700' : 'text-gray-900'}">${d.dayNum}</div>
                        </button>`;
    })}
                  </div>

                  <div class="flex flex-wrap items-center gap-2">
                    <label class="text-sm text-gray-600" for="paidLaunchDate">Prefer another day?</label>
                    <input
                      type="date"
                      id="paidLaunchDate"
                      min=${soonest.value}
                      max=${latest.value}
                      value=${formData.launchDate}
                      onChange=${(e) => selectPaidDate(e.target.value)}
                      class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                    <span class="text-xs text-gray-400">Weekdays only</span>
                  </div>

                  ${formData.launchDate ? html`
                    <p class="text-sm text-gray-600 mt-3 pt-3 border-t border-gray-100">
                      Launch day: <span class="text-gray-900 font-semibold">${formatLaunchLabel(formData.launchDate)}, 8:00 AM PST</span>
                      ${launchesToday
        ? html`<span class="block sm:inline sm:ml-1 text-emerald-600 font-medium">— goes live right after payment.</span>`
        : html`<span class="block sm:inline sm:ml-1 text-gray-500">— we'll hold your listing until then, then launch it automatically.</span>`}
                    </p>` : ''}
                </section>
    `;
  })() : ''}

              ${formData.plan === 'free' && statusLoading ? html`
                <div class="text-center py-6">
                  <div class="inline-block animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-gray-900"></div>
                  <p class="text-sm text-gray-500 mt-2">Checking your unlock status…</p>
                </div>
              ` : ''}

              ${formData.plan === 'free' && !statusLoading && !freeUnlocked ? (() => {
    const s = freeStatus || {};
    const upDone = Math.min(s.upvotes_done || 0, s.upvotes_required || 3);
    const upReq = s.upvotes_required || 3;
    const cmDone = Math.min(s.comments_done || 0, s.comments_required || 1);
    const cmReq = s.comments_required || 1;
    const upOk = upDone >= upReq;
    const cmOk = cmDone >= cmReq;
    const stepsDone = (upOk ? 1 : 0) + (cmOk ? 1 : 0);
    const counter = (done, ok) => ok
      ? html`<span class="w-7 h-7 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5"><i class="fas fa-check text-[11px]"></i></span>`
      : html`<span class="text-xs font-semibold text-gray-500 tabular-nums shrink-0 mt-1.5">${done}</span>`;
    return html`
                <!-- Unlock product submission: upvote 3 + comment 1 + verified backlink -->
                <div class="border border-gray-200 rounded-2xl overflow-hidden">
                  <div class="flex items-start gap-4 px-5 sm:px-6 pt-6 pb-5 bg-gradient-to-b from-emerald-50/70 to-white">
                    <div class="w-11 h-11 rounded-xl bg-white border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                      <i class="fas fa-bell"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                      <h3 class="text-lg font-semibold text-gray-900">Unlock product submission</h3>
                      <p class="text-sm text-gray-500 mt-0.5">
                        ${s.is_returning
                          ? `You've launched here before. Support the community again to unlock your next free launch.`
                          : `Complete the quick steps below so the community knows you before you launch.`}
                      </p>
                      <div class="flex items-center gap-3 mt-3">
                        <div class="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div class="h-full bg-emerald-500 transition-all" style="width: ${Math.round((stepsDone / 2) * 100)}%"></div>
                        </div>
                        <span class="text-sm font-semibold text-gray-700 tabular-nums">${stepsDone}/2</span>
                      </div>
                    </div>
                    <a
                      href="/"
                      target="_blank"
                      rel="noopener"
                      class="hidden sm:flex px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors items-center gap-2 shrink-0"
                    >
                      Browse Products <i class="fas fa-arrow-right text-xs"></i>
                    </a>
                  </div>

                  <div class="px-5 sm:px-6 pt-4 pb-1">
                    <span class="text-xs font-semibold uppercase tracking-wider text-emerald-600">Requirements</span>
                  </div>

                  <div class="divide-y divide-gray-100">
                    <!-- 1. Upvote 3 products -->
                    <div class="flex items-start gap-4 px-5 sm:px-6 py-4">
                      <div class="w-10 h-10 rounded-xl border bg-emerald-50 border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                        <i class="fas fa-arrow-up"></i>
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="font-semibold text-gray-900 text-sm">Upvote ${upReq} products</p>
                        <p class="text-sm text-gray-500 mt-0.5">Discover and support products you love.</p>
                      </div>
                      ${upOk ? counter(upDone, true) : html`<span class="text-xs font-semibold text-gray-500 tabular-nums shrink-0 mt-1.5">${upDone}/${upReq}</span>`}
                    </div>

                    <!-- 2. Comment on 1 product -->
                    <div class="flex items-start gap-4 px-5 sm:px-6 py-4">
                      <div class="w-10 h-10 rounded-xl border bg-blue-50 border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                        <i class="fas fa-comment"></i>
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="font-semibold text-gray-900 text-sm">Comment on ${cmReq} product${cmReq > 1 ? 's' : ''}</p>
                        <p class="text-sm text-gray-500 mt-0.5">Share your thoughts with the community.</p>
                      </div>
                      ${cmOk ? counter(cmDone, true) : html`<span class="text-xs font-semibold text-gray-500 tabular-nums shrink-0 mt-1.5">${cmDone}/${cmReq}</span>`}
                    </div>
                  </div>

                  <!-- Phase 4 upsell: keep the paid option visible -->
                  <div class="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-4 border-t border-gray-100 bg-gray-50/60">
                    <p class="text-xs text-gray-500">Not into the steps? <button type="button" onClick=${() => selectPlan('premium')} class="font-semibold text-orange-600 hover:text-orange-700 underline underline-offset-2">Skip the wait with Priority Launch →</button></p>
                    <button
                      type="button"
                      onClick=${() => checkFreeStatus()}
                      disabled=${checkingStatus}
                      class="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      ${checkingStatus ? html`<i class="fas fa-spinner fa-spin text-xs"></i> Checking…` : html`<i class="fas fa-rotate-right text-xs"></i> Refresh status`}
                    </button>
                  </div>
                </div>
    `;
  })() : ''}

              ${formData.plan === 'free' && freeUnlocked && wasLocked ? html`
                <div class="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
                  <i class="fas fa-circle-check text-emerald-600"></i>
                  <p class="text-sm text-emerald-800 font-medium">Unlocked — pick your launch date, then add your backlink to finish.</p>
                </div>
              ` : ''}

              ${formData.plan === 'free' && freeUnlocked ? html`
                <section class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-6">
                  <div class="mb-4">
                    <h3 class="text-lg font-semibold tracking-tight text-gray-900">Choose your launch date</h3>
                    <p class="text-sm text-gray-500 mt-0.5">Startups launch at 8 AM EST, Monday–Friday. Max 6 free slots per day.</p>
                  </div>

                  ${loadingDates ? html`
                    <div class="flex items-center justify-center py-8">
                      <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                      <span class="ml-3 text-gray-600">Loading available dates...</span>
                    </div>
                  ` : html`
                    <div class="grid grid-cols-5 gap-2 mb-4">
                      ${availableLaunchDates.map(date => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayName = dayNames[date.dayOfWeek];
    const dateNum = date.date.split(' ')[2];
    const isSelected = formData.launchDate === date.value;
    const isAvailable = date.freeAvailable;

    return html`
                          <div 
                            class="text-center p-2 rounded-lg border-2 transition-all ${isSelected
        ? 'border-blue-500 bg-blue-100'
        : isAvailable
          ? 'border-black hover:bg-gray-50 cursor-pointer'
          : 'border-gray-300 bg-gray-200 cursor-not-allowed'
      }"
                            onClick=${isAvailable ? () => selectLaunchDate(date.value) : null}
                          >
                            <div class="text-xs font-bold ${isAvailable ? 'text-gray-600' : 'text-gray-400'}">${dayName}</div>
                            <div class="text-lg font-bold ${isSelected ? 'text-blue-700' : isAvailable ? 'text-black' : 'text-gray-400'}">${dateNum}</div>
                            <div class="text-xs ${isAvailable ? 'text-green-600' : 'text-red-500'} font-medium">
                              ${isAvailable ? `${date.slotsRemaining} left` : 'Full / Sold Out'}
                            </div>
                          </div>
                        `;
  })}
                    </div>
                  `}

                  ${availableLaunchDates.some(d => !d.freeAvailable) ? html`
                    <div class="mt-3 rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 p-3 flex flex-wrap items-center justify-between gap-3">
                      <p class="text-sm text-orange-900"><strong>Some upcoming days are already full on the free plan.</strong> Paid launches aren't limited by the free slot queue.</p>
                      <button
                        type="button"
                        onClick=${() => selectPlan('premium')}
                        class="sh-shine shrink-0 px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-sm shadow-md hover:from-orange-600 hover:to-amber-600 transition-colors flex items-center gap-2"
                      >
                        <i class="fas fa-bolt text-xs"></i> Skip the queue — launch today
                      </button>
                    </div>
                  ` : ''}
                </section>
              ` : ''}

              <!-- Optional final step: do-follow backlink (after slot selection).
                   Recommended — earns a DR 37 do-follow backlink — but skippable
                   via the toggle below. The DB gate no longer requires it. -->
              ${formData.plan === 'free' && freeUnlocked ? html`
                <div class="border ${backlinkVerified ? 'border-emerald-200' : (skipBacklink ? 'border-amber-200' : 'border-gray-200')} rounded-2xl overflow-hidden">
                  <div class="flex items-start gap-4 px-5 sm:px-6 pt-5 pb-4 ${backlinkVerified ? 'bg-emerald-50/50' : (skipBacklink ? 'bg-amber-50/40' : 'bg-gray-50/60')}">
                    <div class="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${backlinkVerified ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-amber-50 border-amber-100 text-amber-600'}">
                      <i class="fas fa-link"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="font-semibold text-gray-900 text-sm">Add a do-follow backlink <span class="font-normal text-gray-400">— recommended</span></p>
                      <p class="text-sm text-gray-500 mt-0.5">Place our badge on your homepage or footer to claim a permanent <strong>DR 37 do-follow backlink</strong> — and earn a <span class="inline-flex items-center gap-1 font-semibold text-amber-700"><svg viewBox="0 0 24 24" class="w-[15px] h-[15px]"><circle cx="12" cy="12" r="11" fill="#f59e0b"/><path fill="#fff" d="M10.28 16.4l-3.3-3.3 1.4-1.4 1.9 1.9 4.95-4.95 1.4 1.4z"/></svg>gold verified checkmark</span> next to your listing. Skip it and you launch without either.</p>
                    </div>
                    ${backlinkVerified ? html`<span class="w-7 h-7 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5"><i class="fas fa-check text-[11px]"></i></span>` : ''}
                  </div>

                  <div class="px-5 sm:px-6 pb-5 pt-1">
                    ${backlinkVerified ? html`
                      <p class="text-sm text-emerald-700 font-medium flex items-center gap-1.5">
                        <i class="fas fa-check"></i> Backlink verified — your DR 37 do-follow link is locked in, and your listing now shows the gold verified checkmark.
                      </p>
                    ` : html`
                      <div class="space-y-3 ${skipBacklink ? 'opacity-60 pointer-events-none' : ''}">
                        <div class="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                          <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Embed a badge — pick a style</span>
                          <div class="grid sm:grid-cols-2 gap-3 mt-3">
                            <div class="rounded-lg border border-gray-200 bg-white p-3 flex flex-col items-center gap-3">
                              <img src="/badge-light.svg" alt="Featured on Submit Hunt" class="h-11 w-auto" />
                              <button type="button" onClick=${() => copyEmbed('light')} class="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5">
                                ${copiedEmbed === 'light' ? html`<i class="fas fa-check text-green-600"></i> Copied` : html`<i class="fas fa-copy"></i> Copy light badge`}
                              </button>
                            </div>
                            <div class="rounded-lg border border-gray-800 bg-gray-900 p-3 flex flex-col items-center gap-3">
                              <img src="/badge-dark.svg" alt="Featured on Submit Hunt" class="h-11 w-auto" />
                              <button type="button" onClick=${() => copyEmbed('dark')} class="w-full px-3 py-1.5 rounded-lg border border-gray-700 text-xs font-semibold text-gray-100 hover:bg-gray-800 flex items-center justify-center gap-1.5">
                                ${copiedEmbed === 'dark' ? html`<i class="fas fa-check text-green-400"></i> Copied` : html`<i class="fas fa-copy"></i> Copy dark badge`}
                              </button>
                            </div>
                          </div>
                          <p class="text-[11px] text-gray-400 mt-2">Must stay do-follow — don't add rel="nofollow", "sponsored" or "ugc".</p>
                        </div>

                        <div>
                          <label class="block text-sm font-medium text-gray-700 mb-1" for="backlinkUrl">Enter the exact URL where you placed our link</label>
                          <div class="flex flex-col sm:flex-row gap-2">
                            <input type="url" id="backlinkUrl" value=${backlinkUrl} onInput=${(e) => setBacklinkUrl(e.target.value)} placeholder="https://mystartup.com" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                            <button type="button" onClick=${handleVerifyBacklink} disabled=${verifyingBacklink || !backlinkUrl.trim()} class="shrink-0 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                              ${verifyingBacklink ? html`<i class="fas fa-spinner fa-spin text-xs"></i> Verifying…` : html`<i class="fas fa-shield-halved text-xs"></i> Verify Backlink`}
                            </button>
                          </div>
                          ${backlinkError ? html`<p class="text-sm text-red-600 mt-1">${backlinkError}</p>` : ''}
                        </div>
                      </div>

                      <!-- Live preview: what the listing keeps vs. loses. When the
                           maker toggles "skip", the DR 37 pill and gold checkmark
                           drop away so the trade-off is felt, not just read. -->
                      <div class="mt-4 rounded-xl border ${skipBacklink ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200 bg-white'} p-4 transition-colors overflow-hidden">
                        <p class="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2.5">Preview — your listing on the homepage</p>
                        <div class="flex items-center gap-2 min-h-[36px]">
                          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
                            ${(formData.projectName || 'Y').charAt(0).toUpperCase()}
                          </div>
                          <span class="font-semibold text-gray-900 text-sm truncate">${formData.projectName || 'Your startup'}</span>
                          <span class="sh-drop ${skipBacklink ? 'sh-drop--gone' : 'sh-drop--in'}" aria-hidden="true">
                            <svg viewBox="0 0 24 24" class="w-[18px] h-[18px]">
                              <circle cx="12" cy="12" r="11" fill="#f59e0b"/>
                              <path fill="#fff" d="M10.28 16.4l-3.3-3.3 1.4-1.4 1.9 1.9 4.95-4.95 1.4 1.4z"/>
                            </svg>
                          </span>
                          <span class="sh-drop sh-drop--d1 ${skipBacklink ? 'sh-drop--gone' : 'sh-drop--in'} text-[11px] font-bold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">DR 37</span>
                        </div>
                        <p class="text-xs mt-2.5 ${skipBacklink ? 'text-amber-700' : 'text-gray-400'}">
                          ${skipBacklink
        ? html`<i class="fas fa-arrow-trend-down mr-1"></i> Skipping drops your <strong>DR 37 backlink</strong> and the <strong>gold verified checkmark</strong> — gone from your listing.`
        : html`Verify your badge to keep the DR 37 backlink and the gold verified checkmark on your listing.`}
                        </p>
                      </div>

                      <!-- Skip toggle: continue with a no-follow (or no) backlink -->
                      <label class="mt-4 flex items-start gap-3 rounded-xl border ${skipBacklink ? 'border-amber-300 bg-amber-50/70' : 'border-gray-200 bg-white'} p-3 cursor-pointer transition-colors">
                        <input type="checkbox" checked=${skipBacklink} onChange=${(e) => setSkipBacklink(e.target.checked)} class="mt-0.5 h-5 w-5 rounded-full border-2 border-gray-300 text-amber-600 focus:ring-amber-400 focus:ring-offset-0" />
                        <span class="text-sm text-gray-700">
                          <span class="font-medium text-gray-900">Continue with a no-follow backlink</span> — skip verification and launch now.
                          <span class="block text-xs text-amber-700 mt-0.5">You'll forfeit your free DR 37 do-follow link equity <strong>and the gold verified checkmark</strong> next to your listing. You can still add it later from your dashboard.</span>
                        </span>
                      </label>
                    `}
                  </div>
                </div>
              ` : ''}

              ${formData.plan === 'free' && freeDomainTaken ? html`
                <div class="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <p class="text-amber-800 text-sm">
                    <strong>This website is already submitted on the free plan.</strong>
                    A site — including its subpages and subdomains — gets one free launch.
                    Choose <strong>Premium</strong> or <strong>Featured</strong> above to launch it again.
                  </p>
                </div>
              ` : ''}

              <!-- Cloudflare Turnstile: free-plan bot check only (paid is gated by payment) -->
              ${formData.plan === 'free' && freeUnlocked ? html`
                <div class="flex flex-col items-start gap-2 pt-2">
                  <div id="turnstile-widget"></div>
                  ${turnstileUnavailable ? html`
                    <p class="text-xs text-gray-400">Verification couldn't load — you can still submit.</p>
                  ` : (!turnstileToken ? html`
                    <p class="text-xs text-gray-500">Complete the verification to enable submission.</p>
                  ` : '')}
                </div>
              ` : ''}

              <!-- Maker quotes. Renders NOTHING while TESTIMONIALS is empty —
                   see the constant: real, permissioned quotes only. -->
              ${TESTIMONIALS.length ? html`
                <section class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-6">
                  <div class="mb-4">
                    <h3 class="text-lg font-semibold tracking-tight text-gray-900">What makers say</h3>
                    <p class="text-sm text-gray-500 mt-0.5">From founders who launched here.</p>
                  </div>
                  <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    ${TESTIMONIALS.map((t) => html`
                      <figure class="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                        <blockquote class="text-sm text-gray-700">${t.quote}</blockquote>
                        <figcaption class="text-xs text-gray-500 mt-3">
                          <span class="font-semibold text-gray-700">${t.name}</span>${t.handle ? html` · ${t.handle}` : ''}
                        </figcaption>
                      </figure>
                    `)}
                  </div>
                </section>
              ` : ''}

              <!-- Running total: what this submit click costs, and what it does. -->
              <section class="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 sm:p-6">
                <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span class="text-base font-semibold tracking-tight text-gray-900">Total</span>
                  <span class="flex items-baseline gap-2">
                    <span class="text-2xl font-semibold tracking-tight text-gray-900 tabular-nums">$${selectedPrice}</span>
                    <span class="text-sm text-gray-500">${selectedPrice > 0 ? 'one-time' : 'no charge'} · ${selectedPlanLabel}</span>
                  </span>
                </div>
                <p class="text-sm text-gray-500 mt-2">${submitSummary()}</p>
              </section>

              <div class="flex justify-between items-center pt-6 border-t border-gray-200 mt-6">
                <button
                  type="button"
                  onClick=${goToPreviousPage}
                  class="sh-btn-ghost"
                  disabled=${loading}
                >
                  <i class="fas fa-arrow-left text-xs"></i> Previous
                </button>

                ${formData.plan === 'free' && freeUnlocked && !freeDomainTaken && availableLaunchDates.filter(d => d.freeAvailable).length > 0 ? html`
                  <div class="flex flex-col items-end gap-1">
                    <button
                      type="button"
                      onClick=${() => {
        if (!formData.projectName) { setError('Please enter a startup name.'); return; }
        if (!formData.category) { setError('Please select a category.'); return; }
        if (!formData.launchDate) { setError('Please select a launch date above.'); return; }
        setError(null);
        setShowScheduleConfirm(true);
      }}
                      class="sh-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled=${loading || !formData.launchDate || !(backlinkVerified || skipBacklink) || (!turnstileToken && !turnstileUnavailable)}
                      title=${!formData.launchDate ? 'Select a launch date above to continue' : (!(backlinkVerified || skipBacklink) ? 'Verify your backlink above, or check “Continue with a no-follow backlink” to skip' : '')}
                    >
                      ${loading
                        ? html`<i class="fas fa-spinner fa-spin text-xs"></i> Submitting…`
                        : html`Schedule free launch <i class="fas fa-arrow-right text-xs"></i>`}
                    </button>
                    ${!formData.launchDate ? html`<p class="text-xs text-amber-600">Pick a launch date above to continue.</p>` : ''}
                    ${formData.launchDate && !backlinkVerified && !skipBacklink ? html`<p class="text-xs text-gray-400">Verify your backlink above, or check “Continue with a no-follow backlink” to skip.</p>` : ''}
                    ${!backlinkVerified && skipBacklink ? html`<p class="text-xs text-amber-600">Launching without a do-follow backlink — you'll miss the DR 37 link equity and the gold verified checkmark on your listing.</p>` : ''}
                  </div>
                ` : ''}

                ${formData.plan === 'free' && freeUnlocked && !freeDomainTaken && !loadingDates && availableLaunchDates.length > 0 && availableLaunchDates.filter(d => d.freeAvailable).length === 0 ? html`
                  <div class="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                    All upcoming free slots are full — check back soon, or
                    <button type="button" onClick=${() => selectPlan('premium')} class="font-semibold text-orange-600 hover:text-orange-700 underline underline-offset-2">skip the wait with Priority Launch</button>.
                  </div>
                ` : ''}

                ${formData.plan === 'featured' ? html`
                  <button
                    type="submit"
                    class="sh-btn-accent disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled=${loading}
                  >
                    ${loading ? html`<i class="fas fa-spinner fa-spin text-xs"></i> Redirecting to Stripe…` : html`Continue to payment <i class="fas fa-arrow-right text-xs"></i>`}
                  </button>
                ` : ''}

                ${formData.plan === 'premium' ? html`
                  <button
                    type="submit"
                    class="sh-btn-accent disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled=${loading}
                  >
                    ${loading ? html`<i class="fas fa-spinner fa-spin text-xs"></i> Redirecting to Stripe…` : html`Continue to payment <i class="fas fa-arrow-right text-xs"></i>`}
                  </button>
                ` : ''}
              </div>
            </div>
          `}
        </form>
      </div>

      ${showScheduleConfirm ? html`
        <div class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" onClick=${(e) => { if (e.target === e.currentTarget) setShowScheduleConfirm(false); }}>
          <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div class="flex items-start gap-4 px-6 pt-6 pb-5">
              <div class="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <i class="fas fa-bell"></i>
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="text-lg font-semibold text-gray-900">Schedule this product?</h3>
                <p class="text-sm text-gray-500 mt-0.5">Double-check your listing and launch week before you continue.</p>
              </div>
              <button type="button" onClick=${() => setShowScheduleConfirm(false)} class="text-gray-400 hover:text-gray-600 p-1 -mr-1" aria-label="Close">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <div class="px-6 pb-5 space-y-3 border-t border-gray-100 pt-4">
              <div class="rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3">
                <p class="font-semibold text-gray-900 text-sm">${formData.projectName || 'Your product'}</p>
                ${formData.launchDate
        ? html`<p class="text-sm text-gray-500 mt-0.5">Launch date: <span class="text-gray-700 font-medium">${new Date(formData.launchDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span></p>`
        : html`<p class="text-sm text-gray-500 mt-0.5">Launches on the next available free date.</p>`}
              </div>

              <div class="rounded-xl border border-gray-200 px-4 py-4">
                <p class="font-semibold text-gray-900 text-sm">Launch without Premium?</p>
                <p class="text-sm text-gray-500 mt-1">Free listings wait in the queue and compete for limited daily slots. Premium launches immediately with prominent placement and a guaranteed do-follow backlink — $20 one-time.</p>
                <button type="button" onClick=${() => { setShowScheduleConfirm(false); selectPlan('premium'); }} class="mt-3 w-full sh-btn-primary justify-center">
                  <i class="fas fa-arrow-up text-xs"></i> Review Premium before launch
                </button>
              </div>

              <div class="rounded-xl border border-dashed border-orange-300 bg-orange-50/60 px-4 py-3 flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-orange-900">🎉 50% off Premium or Featured</p>
                  <p class="text-xs text-orange-700 mt-0.5">Apply the code at checkout</p>
                </div>
                <button type="button" onClick=${copyCoupon} class="shrink-0 px-3 py-1.5 rounded-lg border border-orange-300 bg-white font-mono font-bold text-sm text-orange-700 hover:bg-orange-50 flex items-center gap-1.5">
                  ${couponCopied ? html`<i class="fas fa-check text-green-600"></i> Copied` : html`HACK <i class="fas fa-copy text-xs"></i>`}
                </button>
              </div>
            </div>

            <div class="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button type="button" onClick=${() => setShowScheduleConfirm(false)} class="sh-btn-ghost" disabled=${loading}>Cancel</button>
              <button type="button" onClick=${() => { setShowScheduleConfirm(false); handleSubmit(); }} class="sh-btn-primary" disabled=${loading}>
                ${loading ? html`<i class="fas fa-spinner fa-spin text-xs"></i> Scheduling…` : html`Schedule product <i class="fas fa-arrow-right text-xs"></i>`}
              </button>
            </div>
          </div>
        </div>
      ` : ''}
    </div>
  `;
};
