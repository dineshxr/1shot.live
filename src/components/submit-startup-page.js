import { supabaseClient } from '../lib/supabase-client.js';
import { captureScreenshot, uploadScreenshot } from '../lib/screenshot-service.js';
import { Confetti } from './confetti.js';
import { createCheckoutSession } from '../lib/stripe.js';
import { config } from '../config.js';
import { getFreeSubmissionStatus, verifyBacklink, BADGE_LIGHT_EMBED, BADGE_DARK_EMBED } from '../lib/backlink.js';
import { aiPrefill, fetchDomainRating, uploadAsset } from '../lib/prefill.js';

/* global html, useState, useEffect, useRef */

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

export const SubmitStartupPage = ({ user, authLoading, onLoginRequired }) => {
  const [formData, setFormData] = useState({
    url: "",
    xProfile: "",
    contactEmail: "",
    projectName: "",
    tagline: "",
    description: "",
    slug: "",
    category: "",
    tags: "",        // comma-separated in the form, split to array on insert
    linkedin: "",
    github: "",
    logoUrl: "",     // public URL (AI-extracted or uploaded)
    coverUrl: "",    // cover/screenshot public URL
    plan: "free",
    launchDate: ""
  });
  const [aiDetails, setAiDetails] = useState(null); // extra AI fields (pricing, audience, tech stack, faq, seo)
  const [prefillError, setPrefillError] = useState(null);
  const [drValue, setDrValue] = useState(null);     // Ahrefs Domain Rating
  const [drLoading, setDrLoading] = useState(false);
  const [drAnim, setDrAnim] = useState(0);          // 0..1 count-up progress
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showSuccessPage, setShowSuccessPage] = useState(false);
  const [availableLaunchDates, setAvailableLaunchDates] = useState([]);
  // Combined free-plan unlock status from get_free_submission_status — null
  // until loaded. Shape: {eligible, upvotes_done, upvotes_required,
  // comments_done, comments_required, backlink_verified, is_returning}.
  const [freeStatus, setFreeStatus] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [wasLocked, setWasLocked] = useState(false); // saw the unlock panel this visit
  // Backlink verification (requirement #3)
  const [backlinkUrl, setBacklinkUrl] = useState('');
  const [verifyingBacklink, setVerifyingBacklink] = useState(false);
  const [backlinkError, setBacklinkError] = useState(null);
  const [copiedEmbed, setCopiedEmbed] = useState(''); // '' | 'light' | 'dark'
  // Phase 1 auto-fill (scrape metadata from the URL)
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [loadingDates, setLoadingDates] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15 * 60); // Urgency timer: 15 minutes in seconds
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
      setFormData(prev => ({ ...prev, ...(restored || {}), ...(validPlan ? { plan: validPlan } : {}) }));
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

  // Countdown timer effect for urgency
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => prev > 0 ? prev - 1 : 0);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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
        if (data.name && !prev.projectName) next.projectName = String(data.name).slice(0, 80);
        if (data.tagline && !prev.tagline) next.tagline = String(data.tagline).slice(0, 80);
        if (data.description && !prev.description) next.description = String(data.description).slice(0, 280);
        if (data.category && !prev.category) next.category = data.category;
        if (Array.isArray(data.tags) && data.tags.length && !prev.tags) next.tags = data.tags.slice(0, 5).join(', ');
        if (data.logo && !prev.logoUrl) next.logoUrl = data.logo;
        if (data.cover && !prev.coverUrl) next.coverUrl = data.cover;
        const s = data.socialLinks || {};
        if (s.x && !prev.xProfile) {
          const handle = String(s.x).replace(/\/+$/, '').split('/').pop();
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

  // Upload a logo or cover image the user picked; store the public URL.
  const handleAssetUpload = async (e, kind) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const setBusy = kind === 'logo' ? setUploadingLogo : setUploadingCover;
    setBusy(true);
    setPrefillError(null);
    try {
      const res = await uploadAsset(file, kind);
      if (res.error) { setPrefillError(res.error); return; }
      setFormData((prev) => ({ ...prev, [kind === 'logo' ? 'logoUrl' : 'coverUrl']: res.url }));
    } finally {
      setBusy(false);
    }
  };

  // Projected DR with a SubmitHunt do-follow backlink (marketing estimate).
  const projectedDr = drValue != null ? Math.min(98, drValue + Math.max(6, Math.round((100 - drValue) * 0.18))) : null;

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

  // "Week NN — Mon D – Mon D, YYYY" for the Mon–Sun week containing a launch
  // date — used in the schedule-confirmation modal.
  const getLaunchWeek = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return null;
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const t = new Date(d);
    t.setHours(0, 0, 0, 0);
    t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
    const week1 = new Date(t.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((t - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    const left = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const right = sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return { weekNum, label: `${left} – ${right}` };
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

      if (!formData.url) {
        setError("Please enter a valid URL");
        return;
      }

      if (!formData.url.startsWith('http://') && !formData.url.startsWith('https://')) {
        setError("Please enter a valid URL starting with http:// or https://");
        return;
      }

      if (!formData.xProfile) {
        setError("Please enter your X username");
        return;
      }

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
    setFormData(prev => ({ ...prev, plan }));
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

    // Free launches must be unlocked first: upvote 3 + comment 1 + a verified
    // do-follow backlink. The DB trigger enforces this regardless; this just
    // catches it early with a friendlier message.
    if (formData.plan === 'free' && freeStatus && !freeStatus.eligible) {
      setError('Complete the unlock steps first — upvote 3 products, comment on 1, and verify your backlink.');
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
      try {
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
      let authorInfo = {
        name: formData.xProfile.replace('@', ''),
        profile_url: `https://x.com/${formData.xProfile.replace('@', '')}`,
        avatar: `https://unavatar.io/twitter/${formData.xProfile.replace('@', '')}`,
        email: contactEmail
      };

      const resolvedLaunchDate = formData.launchDate || await (async () => {
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
          screenshot_url: formData.coverUrl || screenshotUrl || '',
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
      const coverImage = formData.coverUrl || screenshotUrl || null;
      const detailsObj = {
        ...(aiDetails || {}),
        socialLinks: {
          ...((aiDetails && aiDetails.socialLinks) || {}),
          ...(formData.xProfile ? { x: `https://x.com/${formData.xProfile.replace('@', '')}` } : {}),
          ...(formData.linkedin ? { linkedin: formData.linkedin } : {}),
          ...(formData.github ? { github: formData.github } : {}),
        },
      };
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
        images: coverImage ? [coverImage] : null,
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
          throw new Error('Almost there — finish the unlock steps (upvote 3, comment 1, verify your backlink), then try again.');
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
              Get your badge & keep your 37+ DR backlink
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

  // Main form
  return html`
    <div class="max-w-5xl mx-auto px-4 py-10 md:py-14">
      <div class="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 md:p-10">
        <div class="mb-6">
          <h2 class="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 mb-2">Submit your startup</h2>
          <p class="text-gray-500">Launch your project on the best Product Hunt alternative.</p>
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
            <p class="font-medium text-gray-900">Submit your startup, get a 37+ DR backlink</p>
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
            <div class="max-w-2xl mx-auto space-y-4">
              <!-- AI-Powered Form Prefill -->
              <div class="rounded-2xl border border-indigo-200 bg-gradient-to-b from-indigo-50/70 to-white p-4 sm:p-5">
                <div class="flex items-start gap-3 mb-3">
                  <div class="w-9 h-9 rounded-xl bg-white border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
                    <i class="fas fa-wand-magic-sparkles"></i>
                  </div>
                  <div>
                    <p class="font-semibold text-gray-900 text-sm">AI-Powered Form Prefill</p>
                    <p class="text-xs text-gray-600 mt-0.5">Enter your website URL. AI fills almost every field — name, tagline, description, categories, tags, pricing, target audience, tech stack, social links, SEO metadata, FAQ, and more. Logo & cover come from your site icons / structured data; social links are extracted from the page.</p>
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
                        class="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        placeholder="https://mystartup.com"
                        required
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
                    ${autoFilled ? html`<p class="text-xs text-emerald-600 mt-1.5 flex items-center gap-1"><i class="fas fa-check"></i> Prefilled from your site — review and edit below.</p>` : ''}
                    ${prefillError ? html`<p class="text-xs text-red-600 mt-1.5">${prefillError}</p>` : ''}
                  </div>

                  <!-- Domain Rating: current → projected, animated -->
                  ${(drLoading || drValue != null) ? html`
                    <div class="flex items-stretch gap-2 shrink-0">
                      ${drLoading && drValue == null ? html`
                        <div class="rounded-xl border border-gray-200 bg-white px-3 py-2 flex items-center gap-2 text-xs text-gray-500"><i class="fas fa-spinner fa-spin"></i> Checking DR…</div>
                      ` : html`
                        <div class="rounded-xl border border-gray-200 bg-white px-3 py-2 text-center w-[80px]">
                          <p class="text-[9px] font-semibold uppercase tracking-wider text-gray-400">DR now</p>
                          <p class="text-2xl font-bold text-gray-900 tabular-nums leading-tight">${Math.round((drValue || 0) * drAnim)}</p>
                          <div class="h-1 rounded-full bg-gray-100 mt-1 overflow-hidden"><div class="h-full bg-gray-400" style="width:${(drValue || 0) * drAnim}%"></div></div>
                        </div>
                        <div class="flex flex-col items-center justify-center text-emerald-600 px-0.5">
                          <i class="fas fa-arrow-trend-up text-sm"></i>
                          <span class="text-[10px] font-bold tabular-nums">+${(projectedDr || 0) - (drValue || 0)}</span>
                        </div>
                        <div class="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-center w-[80px]">
                          <p class="text-[9px] font-semibold uppercase tracking-wider text-emerald-600">With us</p>
                          <p class="text-2xl font-bold text-emerald-700 tabular-nums leading-tight">${Math.round((projectedDr || 0) * drAnim)}</p>
                          <div class="h-1 rounded-full bg-emerald-100 mt-1 overflow-hidden"><div class="h-full bg-emerald-500" style="width:${(projectedDr || 0) * drAnim}%"></div></div>
                        </div>
                      `}
                    </div>
                  ` : ''}
                </div>
              </div>

              <div>
                <label class="block text-black font-bold mb-2" for="projectName">Startup Name</label>
                <input
                  type="text"
                  id="projectName"
                  name="projectName"
                  placeholder="My Awesome Startup"
                  value=${formData.projectName}
                  onInput=${handleChange}
                  class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400"
                  required
                />
              </div>

              <div>
                <label class="block text-black font-bold mb-2" for="tagline">Tagline</label>
                <input
                  type="text"
                  id="tagline"
                  name="tagline"
                  placeholder="One-line pitch for your product"
                  value=${formData.tagline}
                  onInput=${handleChange}
                  maxlength="80"
                  class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label class="block text-black font-bold mb-2" for="slug">Slug</label>
                <input
                  type="text"
                  id="slug"
                  name="slug"
                  value=${formData.slug}
                  onInput=${handleChange}
                  class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="my-awesome-startup"
                  required
                />
                <p class="text-sm text-gray-500 mt-1">URL identifier for your startup</p>
              </div>

              <div>
                <label class="block text-black font-bold mb-2" for="description">Description</label>
                <input
                  type="text"
                  id="description"
                  name="description"
                  value=${formData.description}
                  onInput=${handleChange}
                  class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="A short description of the startup"
                />
              </div>

              <div>
                <label class="block text-black font-bold mb-2" for="category">Category</label>
                <select
                  id="category"
                  name="category"
                  value=${formData.category}
                  onChange=${handleChange}
                  class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                  required
                >
                  <option value="">Select a category</option>
                  <option value="AI/ML">🤖 AI/ML</option>
                  <option value="Other">📦 Other</option>
                  <option value="Design">🎨 Design</option>
                  <option value="Web App">🌐 Web App</option>
                  <option value="SaaS">⚡ SaaS</option>
                  <option value="Gaming">🎮 Gaming</option>
                  <option value="Developer Tools">👨‍💻 Developer Tools</option>
                  <option value="Productivity">📊 Productivity</option>
                  <option value="Social">👥 Social</option>
                  <option value="API/Service">🔗 API/Service</option>
                  <option value="Marketing">📈 Marketing</option>
                  <option value="E-commerce">🛒 E-commerce</option>
                  <option value="Health & Fitness">🏃‍♂️ Health & Fitness</option>
                  <option value="Education">📚 Education</option>
                  <option value="Chrome Extension">🧩 Chrome Extension</option>
                  <option value="Mobile App">📱 Mobile App</option>
                </select>
              </div>

              <div>
                <label class="block text-black font-bold mb-2" for="tags">Tags</label>
                <input
                  type="text"
                  id="tags"
                  name="tags"
                  value=${formData.tags}
                  onInput=${handleChange}
                  class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="ai, productivity, saas"
                />
                <p class="text-sm text-gray-500 mt-1">Comma-separated, up to 5 — shown on your card.</p>
              </div>

              <!-- Logo & cover upload (saved and used on the listing card) -->
              <div class="grid sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-black font-bold mb-2">Logo</label>
                  <div class="flex items-center gap-3">
                    <div class="w-14 h-14 rounded-xl border-2 border-black bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                      ${formData.logoUrl ? html`<img src=${formData.logoUrl} alt="Logo preview" class="w-full h-full object-contain" />` : html`<i class="fas fa-image text-gray-300"></i>`}
                    </div>
                    <label class="cursor-pointer px-3 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-1.5">
                      ${uploadingLogo ? html`<i class="fas fa-spinner fa-spin"></i> Uploading…` : html`<i class="fas fa-upload"></i> ${formData.logoUrl ? 'Replace' : 'Upload logo'}`}
                      <input type="file" accept="image/*" class="hidden" onChange=${(e) => handleAssetUpload(e, 'logo')} />
                    </label>
                  </div>
                </div>
                <div>
                  <label class="block text-black font-bold mb-2">Cover / screenshot</label>
                  <div class="flex items-center gap-3">
                    <div class="w-20 h-14 rounded-xl border-2 border-black bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                      ${formData.coverUrl ? html`<img src=${formData.coverUrl} alt="Cover preview" class="w-full h-full object-cover" />` : html`<i class="fas fa-image text-gray-300"></i>`}
                    </div>
                    <label class="cursor-pointer px-3 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-1.5">
                      ${uploadingCover ? html`<i class="fas fa-spinner fa-spin"></i> Uploading…` : html`<i class="fas fa-upload"></i> ${formData.coverUrl ? 'Replace' : 'Upload cover'}`}
                      <input type="file" accept="image/*" class="hidden" onChange=${(e) => handleAssetUpload(e, 'cover')} />
                    </label>
                  </div>
                  <p class="text-sm text-gray-500 mt-1">Shown as your listing image.</p>
                </div>
              </div>

              <!-- Socials -->
              <div class="grid sm:grid-cols-3 gap-4">
                <div>
                  <label class="block text-black font-bold mb-2" for="xProfile">X Username</label>
                  <input
                    type="text" id="xProfile" name="xProfile"
                    value=${formData.xProfile}
                    onInput=${handleChange}
                    class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="jack"
                    required
                  />
                </div>
                <div>
                  <label class="block text-black font-bold mb-2" for="linkedin">LinkedIn</label>
                  <input
                    type="text" id="linkedin" name="linkedin"
                    value=${formData.linkedin}
                    onInput=${handleChange}
                    class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="linkedin.com/company/…"
                  />
                </div>
                <div>
                  <label class="block text-black font-bold mb-2" for="github">GitHub</label>
                  <input
                    type="text" id="github" name="github"
                    value=${formData.github}
                    onInput=${handleChange}
                    class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="github.com/…"
                  />
                </div>
              </div>

              <div class="flex justify-end gap-2 pt-4">
                <a href="/" class="sh-btn-ghost">Cancel</a>
                <button
                  type="button"
                  onClick=${goToNextPage}
                  class="sh-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled=${loading}
                >
                  Continue to Publication <i class="fas fa-arrow-right text-xs"></i>
                </button>
              </div>
            </div>
          ` : html`
            <!-- Page 2: Plan Selection -->
            <div class="space-y-6">
              <div>
                <h3 class="text-xl font-semibold tracking-tight text-gray-900">Choose your launch plan</h3>
                <p class="text-sm text-gray-500 mt-1">Every plan comes with a high-authority dofollow backlink.</p>
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
                    <div class="flex items-baseline mb-1">
                      <span class="text-3xl font-semibold tracking-tight text-gray-900">Free</span>
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
                        <i class="fas fa-circle-check text-green-600 mt-1 text-xs"></i>
                        <span class="text-green-700 text-sm font-semibold">Guaranteed dofollow backlink</span>
                      </div>
                      <div class="flex items-start gap-2.5 mt-3 pt-3 border-t border-gray-200">
                        <i class="fas fa-clock text-amber-500 mt-1 text-xs"></i>
                        <span class="text-amber-700 text-sm font-medium">Launch in ${getDelayText()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Premium Plan -->
                <div
                  class="bg-white rounded-2xl border ${formData.plan === 'premium' ? 'border-orange-500 ring-2 ring-orange-200' : 'border-orange-300'} transition-all flex flex-col overflow-hidden relative"
                >
                  <div class="absolute -top-2.5 left-1/2 -translate-x-1/2">
                    <span class="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider text-white bg-orange-600 px-3 py-0.5 rounded-full">
                      Most popular
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
                      <span class="text-3xl font-semibold tracking-tight text-gray-900">$20</span>
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

                    ${formData.plan === 'premium' ? html`
                      <!-- Early Bird Urgency Section -->
                      <div class="mb-4 p-3 bg-orange-50/60 border border-orange-200 rounded-xl">
                        <div class="flex items-center gap-2 mb-2">
                          <span class="text-orange-800 font-semibold text-xs">🔥 Early Bird Special</span>
                        </div>
                        <div class="flex items-center justify-between gap-3 mb-2">
                          <div class="flex gap-1">
                            <div class="w-8 h-8 bg-gray-200 border border-gray-300 rounded-md flex items-center justify-center" title="Taken">
                              <i class="fas fa-check text-gray-500 text-xs"></i>
                            </div>
                            <div class="w-8 h-8 bg-white border border-orange-300 rounded-md flex items-center justify-center animate-pulse" title="Available">
                              <i class="fas fa-star text-orange-600 text-xs"></i>
                            </div>
                            <div class="w-8 h-8 bg-white border border-orange-300 rounded-md flex items-center justify-center animate-pulse" title="Available">
                              <i class="fas fa-star text-orange-600 text-xs"></i>
                            </div>
                          </div>
                          <div class="flex-1 min-w-0">
                            <div class="text-orange-800 font-semibold text-xs">2 of 3 slots left today</div>
                            <div class="text-orange-700 text-[11px]">Offer expires soon</div>
                          </div>
                        </div>
                        <div class="bg-white border border-orange-200 rounded-md px-2 py-1 text-center">
                          <div class="text-xs font-semibold text-orange-700 tabular-nums">
                            ⏰ ${String(Math.floor(timeLeft / 60)).padStart(2, '0')}:${String(timeLeft % 60).padStart(2, '0')}
                          </div>
                        </div>
                      </div>
                    ` : ''}

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
                      <span class="text-3xl font-semibold tracking-tight text-gray-900">$50</span>
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
                        <span class="text-gray-700 text-sm">High visibility to daily visitors</span>
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
                    </div>
                  </div>
                </div>
              </div>
              
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
                <div>
                  <h3 class="text-xl font-bold text-black mb-2">📅 Choose Your Launch Date</h3>
                  <p class="text-gray-600 text-sm mb-4">Startups launch at 8 AM EST, Monday-Friday. Max 6 free slots per day.</p>
                  
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
                      <p class="text-sm text-orange-900"><strong>Some days are sold out.</strong> Don't wait in the free queue.</p>
                      <button
                        type="button"
                        onClick=${() => selectPlan('premium')}
                        class="sh-shine shrink-0 px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-sm shadow-md hover:from-orange-600 hover:to-amber-600 transition-colors flex items-center gap-2"
                      >
                        <i class="fas fa-bolt text-xs"></i> Skip the queue — launch today
                      </button>
                    </div>
                  ` : ''}
                </div>
              ` : ''}

              <!-- Final step: do-follow backlink (after slot selection; gates submit, not unlock) -->
              ${formData.plan === 'free' && freeUnlocked ? html`
                <div class="border ${backlinkVerified ? 'border-emerald-200' : 'border-gray-200'} rounded-2xl overflow-hidden">
                  <div class="flex items-start gap-4 px-5 sm:px-6 pt-5 pb-4 ${backlinkVerified ? 'bg-emerald-50/50' : 'bg-gray-50/60'}">
                    <div class="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${backlinkVerified ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-amber-50 border-amber-100 text-amber-600'}">
                      <i class="fas fa-link"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="font-semibold text-gray-900 text-sm">Final step — add a do-follow backlink</p>
                      <p class="text-sm text-gray-500 mt-0.5">Place our badge on your homepage or footer, then verify it to finish your free launch.</p>
                    </div>
                    ${backlinkVerified ? html`<span class="w-7 h-7 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5"><i class="fas fa-check text-[11px]"></i></span>` : ''}
                  </div>

                  <div class="px-5 sm:px-6 pb-5 pt-1">
                    ${!backlinkVerified ? html`
                      <div class="space-y-3">
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
                    ` : html`
                      <p class="text-sm text-emerald-700 font-medium flex items-center gap-1.5">
                        <i class="fas fa-check"></i> Backlink verified — you're ready to submit.
                      </p>
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
        setError(null);
        setShowScheduleConfirm(true);
      }}
                      class="sh-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled=${loading || !backlinkVerified || (!turnstileToken && !turnstileUnavailable)}
                      title=${!backlinkVerified ? 'Verify your backlink above to enable submission' : ''}
                    >
                      ${loading
                        ? html`<i class="fas fa-spinner fa-spin text-xs"></i> Submitting…`
                        : html`${formData.launchDate ? 'Schedule free launch' : 'Submit free launch'} <i class="fas fa-arrow-right text-xs"></i>`}
                    </button>
                    ${!backlinkVerified ? html`<p class="text-xs text-gray-400">Verify your backlink above to enable submission.</p>` : ''}
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
                ${(() => {
        const w = getLaunchWeek(formData.launchDate);
        return w
          ? html`<p class="text-sm text-gray-500 mt-0.5">Launch week: <span class="text-gray-700 font-medium">Week ${w.weekNum} — ${w.label}</span></p>`
          : html`<p class="text-sm text-gray-500 mt-0.5">Launches on the next available free date.</p>`;
      })()}
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
