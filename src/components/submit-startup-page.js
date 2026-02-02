import { supabaseClient } from '../lib/supabase-client.js';
import { captureScreenshot, uploadScreenshot } from '../lib/screenshot-service.js';
import { Confetti } from './confetti.js';
import { createCheckoutSession } from '../lib/stripe.js';

/* global html, useState, useEffect */

export const SubmitStartupPage = ({ user, authLoading, onLoginRequired }) => {
  const [formData, setFormData] = useState({
    url: "",
    xProfile: "",
    projectName: "",
    description: "",
    slug: "",
    category: "",
    plan: "free",
    launchDate: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showSuccessPage, setShowSuccessPage] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [availableLaunchDates, setAvailableLaunchDates] = useState([]);
  const [userHasPreviousSubmissions, setUserHasPreviousSubmissions] = useState(false);
  const [checkingPreviousSubmissions, setCheckingPreviousSubmissions] = useState(false);
  const [loadingDates, setLoadingDates] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15 * 60); // Urgency timer: 15 minutes in seconds

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

  const checkUserPreviousSubmissions = async () => {
    if (!window.auth || !window.auth.isAuthenticated()) {
      setUserHasPreviousSubmissions(false);
      return;
    }

    const authUser = window.auth.getCurrentUser();
    if (!authUser || !authUser.email) {
      setUserHasPreviousSubmissions(false);
      return;
    }

    setCheckingPreviousSubmissions(true);
    try {
      const supabase = supabaseClient();
      const { data, error } = await supabase
        .from('startups')
        .select('id')
        .eq('author->>email', authUser.email)
        .limit(1);

      if (error) {
        setUserHasPreviousSubmissions(false);
      } else {
        setUserHasPreviousSubmissions(data && data.length > 0);
        if (data && data.length > 0) {
          setFormData(prev => ({ ...prev, plan: 'premium' }));
        }
      }
    } catch (err) {
      setUserHasPreviousSubmissions(false);
    } finally {
      setCheckingPreviousSubmissions(false);
    }
  };


  // Check for plan query parameter from URL (e.g., /submit?plan=premium)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const planParam = urlParams.get('plan');
    if (planParam && ['free', 'premium', 'featured'].includes(planParam)) {
      setFormData(prev => ({ ...prev, plan: planParam }));
    }
  }, []);

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

  // Check user previous submissions when user changes
  useEffect(() => {
    if (user) {
      checkUserPreviousSubmissions();
    }
  }, [user]);

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

  const checkDuplicateUrl = async () => {
    if (!formData.url) return;

    try {
      const normalizeUrl = (url) => {
        let normalized = url.trim().replace(/^(https?:\/\/)?(www\.)?/, '');
        if (normalized.endsWith('/')) {
          normalized = normalized.slice(0, -1);
        }
        return normalized;
      };

      const normalizedUrl = normalizeUrl(formData.url);
      const supabase = supabaseClient();
      const { data, error } = await supabase.rpc('check_duplicate_url', { p_url: normalizedUrl });

      if (!error && data) {
        setError('This URL has already been submitted. If you want to upgrade it, please visit your dashboard.');
        setIsDuplicate(true);
      } else {
        setIsDuplicate(false);
      }
    } catch (error) {
      console.error('Error in checkDuplicateUrl:', error);
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

      if (!formData.slug) {
        setError("Please enter a slug for your product");
        return;
      }
      if (!formData.xProfile) {
        setError("Please enter your X username");
        return;
      }

      await checkDuplicateUrl();
      if (isDuplicate) {
        return;
      }

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

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user) {
      onLoginRequired();
      return;
    }

    setLoading(true);
    setError(null);

    window.trackEvent('form_submit');

    try {
      if (!formData.url) throw new Error("Please enter a valid URL");
      if (!formData.url.startsWith('http://') && !formData.url.startsWith('https://')) {
        throw new Error("Please enter a valid URL starting with http:// or https://");
      }
      if (!formData.projectName) throw new Error("Please enter a project name");
      if (!formData.slug) throw new Error("Please enter a slug for your project");
      if (!formData.category) throw new Error("Please select a category for your startup");

      const supabase = supabaseClient();

      let screenshotUrl = null;
      try {
        const capturedScreenshotUrl = await captureScreenshot(formData.url, {
          width: 1280,
          height: 800,
          waitUntil: 'networkidle2'
        });

        if (capturedScreenshotUrl) {
          screenshotUrl = await uploadScreenshot(supabase, capturedScreenshotUrl, formData.slug);
        }
      } catch (screenshotError) {
        console.error('Error capturing/uploading screenshot:', screenshotError);
      }

      const authUser = window.auth.getCurrentUser();
      let authorInfo = {
        name: formData.xProfile.replace('@', ''),
        profile_url: `https://x.com/${formData.xProfile.replace('@', '')}`,
        avatar: `https://unavatar.io/twitter/${formData.xProfile.replace('@', '')}`,
        email: authUser?.email
      };

      const { data, error } = await supabase
        .from('startups')
        .insert([{
          title: formData.projectName,
          url: formData.url,
          description: formData.description,
          slug: formData.slug,
          category: formData.category,
          author: authorInfo,
          screenshot_url: screenshotUrl,
          plan: formData.plan,
          launch_date: formData.launchDate || await (async () => {
            const { data: nextDate, error: dateError } = await supabase.rpc('get_next_launch_date');
            if (dateError) {
              const pdt = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
              let nextDay = new Date(pdt);
              nextDay.setDate(pdt.getDate() + 1);
              while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
                nextDay.setDate(nextDay.getDate() + 1);
              }
              return nextDay.getFullYear() + '-' +
                String(nextDay.getMonth() + 1).padStart(2, '0') + '-' +
                String(nextDay.getDate()).padStart(2, '0');
            }
            return nextDate;
          })()
        }])
        .select('id, title, url, description, slug, author, screenshot_url, plan, launch_date')
        .single();

      if (error) {
        if (error.code === '23505' && error.message?.includes('startups_slug_key')) {
          const uniqueSlug = makeUniqueSlug(formData.slug);
          const { data: retryData, error: retryError } = await supabase
            .from('startups')
            .insert([{
              title: formData.projectName,
              url: formData.url,
              description: formData.description,
              slug: uniqueSlug,
              category: formData.category,
              author: authorInfo,
              screenshot_url: screenshotUrl,
              plan: formData.plan,
              launch_date: formData.launchDate
            }])
            .select()
            .single();

          if (retryError) {
            throw new Error('Unable to generate a unique slug. Please try again.');
          }
        } else if (error.code === '23505' && error.message?.includes('startups_url_key')) {
          throw new Error('This URL has already been submitted.');
        } else {
          throw new Error(error.message || 'Failed to submit startup');
        }
      }

      setSuccess(true);
      setShowSuccessPage(true);
      window.trackEvent('form_submit_success', { plan: formData.plan });
      window.dispatchEvent(new Event("refresh-startups"));

      // If premium plan, redirect to Stripe checkout
      if (formData.plan === 'premium' && data?.id) {
        setTimeout(() => {
          createCheckoutSession('premium', {
            startupId: data.id,
            startupTitle: formData.projectName,
            userEmail: user?.email
          });
        }, 2000); // Show success briefly then redirect to payment
      }

    } catch (err) {
      setError(err.message);
      window.trackEvent('form_submit_error', { error: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while checking auth - login modal will auto-appear if not authenticated
  if (!user && !authLoading) {
    // Trigger login modal and show a simple loading state
    // The login modal is shown automatically by the parent component
    return html`
      <div class="max-w-4xl mx-auto px-4 py-8 md:py-12 text-center">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <p class="mt-4 text-gray-600">Please sign in to continue...</p>
      </div>
    `;
  }

  // Show loading state
  if (authLoading) {
    return html`
      <div class="max-w-4xl mx-auto px-4 py-8 md:py-12 text-center">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <p class="mt-4 text-gray-600">Loading...</p>
      </div>
    `;
  }

  // Success page
  if (showSuccessPage) {
    return html`
      <div class="max-w-4xl mx-auto px-4 py-6 md:py-8">
        <div class="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4 md:p-8 rounded-lg">
          <h2 class="text-2xl font-bold mb-4 text-black">Startup Submitted Successfully! 🚀</h2>
          
          <div class="mb-6 p-4 bg-green-100 border-2 border-green-500 rounded text-center">
            <p class="text-green-700 font-bold text-xl mb-2">Congratulations!</p>
            ${formData.plan === 'premium' ? '' : html`
              <p class="text-green-700">Your startup will be featured on the Home Page shortly.</p>
            `}
          </div>
          
          ${formData.plan === 'premium' ? html`
            <div class="mb-4 bg-yellow-300 p-3 border border-black rounded">
              <div class="flex items-center gap-3">
                <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div>
                <div>
                  <p class="font-bold mb-1">Redirecting to payment...</p>
                  <p class="text-sm">You'll be redirected to Stripe to complete your $5 payment.</p>
                </div>
              </div>
            </div>
          ` : html`
            <div class="mb-4 bg-blue-100 p-3 border border-black rounded">
              <p>Your submission has been added to the queue and will be featured soon.</p>
            </div>
          `}
          
          <div class="mt-6 p-4 border-2 border-black rounded bg-orange-50">
            <h3 class="font-bold text-lg mb-2 flex items-center">
              <i class="fas fa-award mr-2 text-orange-600"></i>
              Get Your Badge & Keep Your 37+ DR Backlink!
            </h3>
            <div class="mb-4 p-3 bg-yellow-100 border border-yellow-400 rounded">
              <p class="text-sm text-yellow-800">Add our badge to your website to make your listing <strong>permanent</strong> and keep your backlink as <strong>dofollow</strong>.</p>
            </div>
            
            <div class="border border-gray-300 rounded p-3">
              <h4 class="font-bold mb-2">🔗 Embed Code</h4>
              <div class="bg-gray-100 p-3 rounded text-xs font-mono mb-3 overflow-x-auto">
                <code id="embed-code">&lt;a href="https://submithunt.com" target="_blank" rel="noopener"&gt;&lt;img src="https://submithunt.com/badge.png" alt="Featured on SubmitHunt" width="150" height="45" /&gt;&lt;/a&gt;</code>
              </div>
              <button 
                onClick=${() => {
        const embedCode = document.getElementById('embed-code').textContent;
        navigator.clipboard.writeText(embedCode);
      }}
                class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 font-bold"
              >
                Copy Embed Code
              </button>
            </div>
          </div>
          
          <div class="mt-6 flex flex-col items-center">
            <p class="mb-3 font-bold">Share your launch:</p>
            <div class="flex space-x-4">
              <a href="https://twitter.com/intent/tweet?text=I%20just%20launched%20my%20startup%20on%20submithunt.com%21" target="_blank" class="p-2 bg-blue-400 hover:bg-blue-500 rounded-full">
                <i class="fab fa-twitter text-white text-xl"></i>
              </a>
              <a href="https://www.linkedin.com/sharing/share-offsite/?url=https://submithunt.com" target="_blank" class="p-2 bg-blue-700 hover:bg-blue-800 rounded-full">
                <i class="fab fa-linkedin-in text-white text-xl"></i>
              </a>
            </div>
          </div>
          
          <${Confetti} />
          
          <div class="flex justify-center mt-6">
            <a
              href="/"
              class="px-6 py-2 bg-blue-400 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-blue-500 font-bold"
            >
              Back to Home
            </a>
          </div>
        </div>
      </div>
    `;
  }

  // Main form
  return html`
    <div class="max-w-4xl mx-auto px-4 py-6 md:py-8">
      <div class="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-4 md:p-8 rounded-lg">
        <h2 class="text-2xl font-bold mb-2 text-black">Submit Your Startup</h2>
        <p class="text-gray-700 mb-4">Launch your project on the best Product Hunt alternative.</p>
        
        <div class="mb-4 bg-yellow-300 p-3 border border-black rounded">
          <p class="font-bold flex items-center">
            <span class="mr-2">🚀</span> Submit Your Startup, Get a 37+ DR Backlink
          </p>
          <p class="text-sm mt-1">Join hundreds of founders who chose SubmitHunt</p>
        </div>

        ${error && html`
          <div class="mb-4 p-3 bg-red-100 border-2 border-red-500 rounded">
            <p class="text-red-700">${error}</p>
          </div>
        `}

        <form onSubmit=${handleSubmit}>
          ${currentPage === 1 ? html`
            <div class="space-y-4">
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
                <label class="block text-black font-bold mb-2" for="url">Startup URL</label>
                <input
                  type="url"
                  id="url"
                  name="url"
                  value=${formData.url}
                  onInput=${handleChange}
                  class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="https://mystartup.com"
                  required
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
                <label class="block text-black font-bold mb-2" for="xProfile">X Username</label>
                <input
                  type="text"
                  id="xProfile"
                  name="xProfile"
                  value=${formData.xProfile}
                  onInput=${handleChange}
                  class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="jack"
                  required
                />
                <p class="text-sm text-gray-500 mt-1">Your X username for attribution</p>
              </div>

              <div class="flex justify-end pt-4">
                <a
                  href="/"
                  class="mr-2 px-4 py-2 bg-gray-200 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-300 font-bold"
                >
                  Cancel
                </a>
                <button
                  type="button"
                  onClick=${goToNextPage}
                  class="neo-button px-4 py-2 bg-blue-400 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-blue-500 font-bold"
                  disabled=${loading}
                >
                  Next
                </button>
              </div>
            </div>
          ` : html`
            <!-- Page 2: Plan Selection -->
            <div class="space-y-6">
              <h3 class="text-xl font-bold text-black">Choose Your Launch Plan</h3>
              
              ${checkingPreviousSubmissions ? html`
                <div class="text-center py-4">
                  <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                  <p class="text-sm text-gray-600 mt-2">Checking submission history...</p>
                </div>
              ` : ''}
              
              ${userHasPreviousSubmissions ? html`
                <div class="p-4 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
                  <p class="text-yellow-700 text-sm">
                    You have already submitted a startup for free. Please choose the Premium plan for additional submissions.
                  </p>
                </div>
              ` : ''}
              
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                <!-- Free Plan -->
                ${!userHasPreviousSubmissions ? html`
                  <div 
                    class="bg-white rounded-xl overflow-hidden transition-all flex flex-col ${formData.plan === 'free' ? 'ring-4 ring-blue-500 shadow-xl' : 'border-2 border-gray-200 hover:shadow-lg'}"
                  >
                    <div class="bg-gray-100 px-5 py-3 border-b-4 border-gray-300">
                      <span class="text-gray-700 text-xs font-bold uppercase tracking-wide">FREE</span>
                    </div>
                    
                    <div class="p-5 flex-1 flex flex-col">
                      <div class="mb-1 text-gray-500 text-sm">Standard Launch</div>
                      <div class="flex items-baseline mb-4">
                        <span class="text-4xl font-bold text-gray-900">Free</span>
                      </div>
                      <div class="text-xs text-gray-500 mb-4">no payment method needed</div>
                      
                      <button
                        type="button"
                        class="w-full py-3 px-4 rounded-lg font-bold text-sm mb-6 flex items-center justify-center gap-2 transition-all ${formData.plan === 'free' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}"
                        onClick=${() => selectPlan('free')}
                      >
                        ${formData.plan === 'free' ? html`<i class="fas fa-check"></i> Selected` : html`Start with Free <i class="fas fa-arrow-right"></i>`}
                      </button>
                      
                      <div class="space-y-3 flex-1">
                        <div class="flex items-start gap-2">
                          <span class="text-green-500 mt-0.5"><i class="fas fa-check-circle"></i></span>
                          <span class="text-gray-700 text-sm">Live on homepage for 7 days</span>
                        </div>
                        <div class="flex items-start gap-2">
                          <span class="text-green-500 mt-0.5"><i class="fas fa-check-circle"></i></span>
                          <span class="text-gray-700 text-sm">Badge for top 3 ranking</span>
                        </div>
                        <div class="flex items-start gap-2">
                          <span class="text-green-500 mt-0.5"><i class="fas fa-check-circle"></i></span>
                          <span class="text-gray-700 text-sm">Backlink for top 3 ranking</span>
                        </div>
                        <div class="flex items-start gap-2 mt-4 pt-3 border-t border-gray-200">
                          <span class="text-amber-500 mt-0.5"><i class="fas fa-clock"></i></span>
                          <span class="text-amber-600 text-sm font-medium">Launch in ${getDelayText()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ` : ''}
                
                <!-- Premium Plan -->
                <div 
                  class="bg-white rounded-xl overflow-hidden transition-all flex flex-col ${formData.plan === 'premium' ? 'ring-4 ring-orange-500 shadow-xl' : 'border-4 border-orange-400 hover:shadow-lg'}"
                >
                  <div class="bg-orange-400 px-5 py-3 border-b-4 border-orange-500">
                    <span class="text-white text-xs font-bold uppercase tracking-wide">MOST POPULAR</span>
                  </div>
                  
                  <div class="p-5 flex-1 flex flex-col">
                    <div class="mb-1 text-gray-500 text-sm">Premium Launch</div>
                    <div class="flex items-baseline mb-4">
                      <span class="text-4xl font-bold text-gray-900">$5</span>
                      <span class="text-gray-500 ml-1 text-sm">/launch</span>
                    </div>
                    <div class="text-xs text-gray-500 mb-4">one-time payment</div>
                    
                    <button
                      type="button"
                      class="w-full py-3 px-4 rounded-lg font-bold text-sm mb-6 flex items-center justify-center gap-2 transition-all ${formData.plan === 'premium' ? 'bg-orange-500 text-white' : 'bg-orange-400 text-white hover:bg-orange-500'}"
                      onClick=${() => selectPlan('premium')}
                    >
                      ${formData.plan === 'premium' ? html`<i class="fas fa-check"></i> Selected` : html`Choose Premium <i class="fas fa-arrow-right"></i>`}
                    </button>
                    
                    ${formData.plan === 'premium' ? html`
                      <!-- Early Bird Urgency Section -->
                      <div class="mb-4 p-3 bg-gradient-to-r from-orange-100 to-yellow-100 border-2 border-orange-400 rounded-lg">
                        <div class="flex items-center gap-2 mb-2">
                          <span class="text-orange-700 font-bold text-sm">🔥 Early Bird Special</span>
                        </div>
                        <div class="flex items-center justify-between gap-3 mb-2">
                          <div class="flex gap-1">
                            <!-- Slot 1: Taken -->
                            <div class="w-10 h-10 bg-gray-400 border-2 border-gray-600 rounded flex items-center justify-center" title="Taken">
                              <i class="fas fa-check text-white text-sm"></i>
                            </div>
                            <!-- Slot 2: Available -->
                            <div class="w-10 h-10 bg-yellow-300 border-2 border-orange-500 rounded flex items-center justify-center animate-pulse" title="Available">
                              <i class="fas fa-star text-orange-600 text-sm"></i>
                            </div>
                            <!-- Slot 3: Available -->
                            <div class="w-10 h-10 bg-yellow-300 border-2 border-orange-500 rounded flex items-center justify-center animate-pulse" title="Available">
                              <i class="fas fa-star text-orange-600 text-sm"></i>
                            </div>
                          </div>
                          <div class="flex-1">
                            <div class="text-orange-800 font-bold text-xs">2 of 3 slots left today</div>
                            <div class="text-orange-700 text-xs">Offer expires soon!</div>
                          </div>
                        </div>
                        <div class="bg-white border border-orange-300 rounded px-2 py-1 text-center">
                          <div class="text-xs font-bold text-orange-600">
                            ⏰ ${String(Math.floor(timeLeft / 60)).padStart(2, '0')}:${String(timeLeft % 60).padStart(2, '0')}
                          </div>
                        </div>
                      </div>
                    ` : ''}
                    
                    <div class="space-y-3 flex-1">
                      <div class="flex items-start gap-2">
                        <span class="text-green-500 mt-0.5"><i class="fas fa-check-circle"></i></span>
                        <span class="text-gray-700 text-sm">Live on homepage for 14 days</span>
                      </div>
                      <div class="flex items-start gap-2">
                        <span class="text-green-500 mt-0.5"><i class="fas fa-check-circle"></i></span>
                        <span class="text-gray-700 text-sm">Badge for top 3 ranking</span>
                      </div>
                      <div class="flex items-start gap-2">
                        <span class="text-green-500 mt-0.5"><i class="fas fa-check-circle"></i></span>
                        <span class="text-gray-700 text-sm font-semibold">Guaranteed backlink (37+ DR)</span>
                      </div>
                      <div class="flex items-start gap-2">
                        <span class="text-green-500 mt-0.5"><i class="fas fa-check-circle"></i></span>
                        <span class="text-gray-700 text-sm">Skip queue - launch immediately</span>
                      </div>
                      <div class="flex items-start gap-2">
                        <span class="text-green-500 mt-0.5"><i class="fas fa-check-circle"></i></span>
                        <span class="text-gray-700 text-sm">Featured in newsletter</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <!-- Featured Spot -->
                <div 
                  class="bg-white rounded-xl overflow-hidden transition-all flex flex-col border-2 border-purple-300 hover:shadow-lg"
                >
                  <div class="bg-purple-500 px-5 py-3 border-b-4 border-purple-600">
                    <span class="text-white text-xs font-bold uppercase tracking-wide">FEATURED SPOT</span>
                  </div>
                  
                  <div class="p-5 flex-1 flex flex-col">
                    <div class="mb-1 text-gray-500 text-sm">Premium Placement</div>
                    <div class="flex items-baseline mb-4">
                      <span class="text-4xl font-bold text-gray-900">$20</span>
                      <span class="text-gray-500 ml-1 text-sm">/week</span>
                    </div>
                    <div class="text-xs text-gray-500 mb-4">recurring subscription</div>
                    
                    <button
                      type="button"
                      class="w-full py-3 px-4 bg-purple-500 text-white rounded-lg font-bold text-sm mb-6 flex items-center justify-center gap-2 hover:bg-purple-600 transition-all"
                      onClick=${() => createCheckoutSession('featured', { userEmail: user?.email })}
                    >
                      Get Featured <i class="fas fa-arrow-right"></i>
                    </button>
                    
                    <div class="space-y-3 flex-1">
                      <div class="flex items-start gap-2">
                        <span class="text-green-500 mt-0.5"><i class="fas fa-check-circle"></i></span>
                        <span class="text-gray-700 text-sm">Featured placement in feed</span>
                      </div>
                      <div class="flex items-start gap-2">
                        <span class="text-green-500 mt-0.5"><i class="fas fa-check-circle"></i></span>
                        <span class="text-gray-700 text-sm">High visibility to daily visitors</span>
                      </div>
                      <div class="flex items-start gap-2">
                        <span class="text-green-500 mt-0.5"><i class="fas fa-check-circle"></i></span>
                        <span class="text-gray-700 text-sm">Colorful gradient border</span>
                      </div>
                      <div class="flex items-start gap-2">
                        <span class="text-green-500 mt-0.5"><i class="fas fa-check-circle"></i></span>
                        <span class="text-gray-700 text-sm">Cancel anytime</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              ${formData.plan === 'free' ? html`
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
                </div>
              ` : ''}
              
              <div class="flex justify-between items-center pt-6 border-t border-gray-200 mt-6">
                <button
                  type="button"
                  onClick=${goToPreviousPage}
                  class="px-6 py-3 bg-gray-200 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-300 font-bold rounded-lg"
                  disabled=${loading}
                >
                  <i class="fas fa-arrow-left mr-2"></i>Previous
                </button>
                
                ${formData.plan === 'free' && availableLaunchDates.filter(d => d.freeAvailable).length > 0 ? html`
                  <button
                    type="submit"
                    class="px-6 py-3 bg-blue-500 text-white border-2 border-blue-600 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-blue-600 font-bold rounded-lg disabled:opacity-50"
                    disabled=${loading}
                  >
                    ${loading ? html`<i class="fas fa-spinner fa-spin mr-2"></i>Submitting...` : html`Submit Free Launch <i class="fas fa-arrow-right ml-2"></i>`}
                  </button>
                ` : ''}
                
                ${formData.plan === 'premium' ? html`
                  <button
                    type="submit"
                    class="px-6 py-3 bg-orange-500 text-white border-2 border-orange-600 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-orange-600 font-bold rounded-lg disabled:opacity-50"
                    disabled=${loading}
                  >
                    ${loading ? html`<i class="fas fa-spinner fa-spin mr-2"></i>Submitting...` : html`Continue to Payment <i class="fas fa-arrow-right ml-2"></i>`}
                  </button>
                ` : ''}
              </div>
            </div>
          `}
        </form>
      </div>
    </div>
  `;
};
