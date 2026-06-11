import { auth } from './lib/auth.js';
import { supabaseClient } from './lib/supabase-client.js';

class Dashboard {
    constructor() {
        this.currentUser = null;
        this.listings = [];
        this.upvotedStartups = [];
        this.unlockStatus = null;
        this.editingListing = null;
        this.init();
    }

    async init() {
        // Wait for auth to initialize
        await this.checkAuthentication();
        this.setupEventListeners();
        
        // Listen for auth state changes
        auth.onAuthStateChange((user) => {
            this.currentUser = user;
            if (user) {
                this.showDashboard();
                this.loadUserListings();
            } else {
                this.showNotAuthenticated();
            }
        });
    }

    async checkAuthentication() {
        try {
            const user = await auth.getCurrentUser();
            this.currentUser = user;
            
            if (user) {
                this.showDashboard();
                await this.loadUserListings();
            } else {
                this.showNotAuthenticated();
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            this.showNotAuthenticated();
        }
    }

    showDashboard() {
        document.getElementById('auth-loading').classList.add('hidden');
        document.getElementById('not-authenticated').classList.add('hidden');
        document.getElementById('dashboard-content').classList.remove('hidden');
        
        // Show user email in nav
        if (this.currentUser?.email) {
            document.getElementById('user-email').textContent = this.currentUser.email;
        }
    }

    showNotAuthenticated() {
        document.getElementById('auth-loading').classList.add('hidden');
        document.getElementById('dashboard-content').classList.add('hidden');
        document.getElementById('not-authenticated').classList.remove('hidden');
    }

    async loadUserListings() {
        try {
            document.getElementById('listings-loading').classList.remove('hidden');
            document.getElementById('no-listings').classList.add('hidden');
            document.getElementById('listings-grid').classList.add('hidden');

            const supabase = supabaseClient();
            
            // Get user's listings based on their email
            console.log('Loading listings for user:', this.currentUser.email);
            const { data, error } = await supabase
                .from('startups')
                .select('*')
                .contains('author', { email: this.currentUser.email })
                .order('created_at', { ascending: false });
            
            console.log('Listings query result:', { data, error });

            if (error) {
                console.error('Error fetching listings:', error);
                throw error;
            }

            this.listings = data || [];
            
            // Also load upvoted startups
            await this.loadUpvotedStartups();

            this.updateStats();
            this.renderListings();
            this.renderUpvotedStartups();

            // Free-launch unlock progress (engagement resets after each launch)
            await this.loadUnlockStatus();

        } catch (error) {
            console.error('Failed to load listings:', error);
            this.showError('Failed to load your listings. Please try again.');
        } finally {
            document.getElementById('listings-loading').classList.add('hidden');
        }
    }

    updateStats() {
        const totalListings = this.listings.length;
        const featuredListings = this.listings.filter(listing => listing.plan === 'premium').length;
        
        // Calculate monthly listings (current month)
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        const monthlyListings = this.listings.filter(listing => {
            const listingDate = new Date(listing.created_at);
            return listingDate.getMonth() === currentMonth && listingDate.getFullYear() === currentYear;
        }).length;

        document.getElementById('total-listings').textContent = totalListings;
        document.getElementById('featured-listings').textContent = featuredListings;
        document.getElementById('monthly-listings').textContent = monthlyListings;
        
        // Update upvoted count
        const upvotedCount = this.upvotedStartups.length;
        const upvotedElement = document.getElementById('upvoted-count');
        if (upvotedElement) {
            upvotedElement.textContent = upvotedCount;
        }
    }

    // Engagement progress toward the user's NEXT free launch. Uses an empty
    // product URL so the RPC returns just the upvote/comment counts (which reset
    // after each free submission); the per-product backlink is verified at
    // submit time, so it's only noted here.
    async loadUnlockStatus() {
        try {
            const supabase = supabaseClient();
            const { data, error } = await supabase.rpc('get_free_submission_status', { p_product_url: '' });
            this.unlockStatus = (!error && data) ? data : null;
            if (error) console.warn('Unlock status error:', error);
        } catch (e) {
            console.warn('Failed to load unlock status:', e);
            this.unlockStatus = null;
        }
        this.renderUnlockStatus();
    }

    renderUnlockStatus() {
        const body = document.getElementById('unlock-status-body');
        const section = document.getElementById('unlock-status-section');
        if (!body) return;

        const s = this.unlockStatus;
        // Hide the card entirely if the RPC isn't available (fail soft).
        if (!s) {
            if (section) section.classList.add('hidden');
            return;
        }
        if (section) section.classList.remove('hidden');

        const upReq = s.upvotes_required || 3;
        const cmReq = s.comments_required || 1;
        const upDone = Math.min(s.upvotes_done || 0, upReq);
        const cmDone = Math.min(s.comments_done || 0, cmReq);
        const upOk = upDone >= upReq;
        const cmOk = cmDone >= cmReq;
        const engagementReady = upOk && cmOk;

        const row = (ok, done, req, icon, title, hint) => `
            <div class="flex items-center gap-3 p-3 rounded-xl border ${ok ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-200'}">
                <div class="w-9 h-9 rounded-lg flex items-center justify-center ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}">
                    <i class="fas ${icon} text-sm"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-gray-900">${title}</p>
                    <p class="text-xs text-gray-500">${ok ? 'Done' : hint}</p>
                </div>
                ${ok
                    ? '<span class="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0"><i class="fas fa-check text-[10px]"></i></span>'
                    : `<span class="text-sm font-semibold tabular-nums text-gray-500 shrink-0">${done}/${req}</span>`}
            </div>`;

        body.innerHTML = `
            <div class="flex flex-wrap items-start justify-between gap-3 mb-1">
                <div>
                    <h2 class="text-lg sm:text-xl font-semibold tracking-tight text-gray-900">Unlock your next free launch</h2>
                    <p class="text-sm text-gray-500 mt-0.5">Each new free product needs a fresh set of community engagement${s.is_returning ? ' — progress resets after every launch' : ''}.</p>
                </div>
                <a href="/" class="sh-btn-ghost text-sm shrink-0"><i class="fas fa-arrow-up-right-from-square text-xs"></i> Browse products</a>
            </div>

            <div class="mt-4 grid gap-3 sm:grid-cols-2">
                ${row(upOk, upDone, upReq, 'fa-arrow-up', `Upvote ${upReq} products`, 'Discover and support products you love')}
                ${row(cmOk, cmDone, cmReq, 'fa-comment', `Comment on ${cmReq} product${cmReq > 1 ? 's' : ''}`, 'Share your thoughts with the community')}
            </div>

            <div class="mt-3 flex items-start gap-2 text-xs text-gray-500">
                <i class="fas fa-link mt-0.5"></i>
                <span>Plus a do-follow SubmitHunt backlink on each product's own site — verified when you submit it.</span>
            </div>

            ${engagementReady
                ? `<div class="mt-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800 font-medium flex items-center gap-2">
                       <i class="fas fa-circle-check"></i> Engagement complete — add your backlink at submission to launch free.
                       <a href="/submit" class="ml-auto underline underline-offset-2 whitespace-nowrap">Submit a product</a>
                   </div>`
                : `<div class="mt-4 flex flex-wrap items-center gap-2">
                       <a href="/" class="sh-btn-primary text-sm"><i class="fas fa-arrow-up text-xs"></i> Go engage</a>
                       <span class="text-xs text-gray-400">Only upvotes & comments after your last launch count toward the next one.</span>
                   </div>`}
        `;
    }

    async loadUpvotedStartups() {
        try {
            const supabase = supabaseClient();
            
            // Check if user is authenticated
            if (!this.currentUser || !this.currentUser.email) {
                console.log('No authenticated user for upvoted startups');
                this.upvotedStartups = [];
                return;
            }
            
            console.log('Loading upvoted startups for user:', this.currentUser.email);
            const { data, error } = await supabase.rpc('get_user_upvoted_startups');

            if (error) {
                console.error('Error fetching upvoted startups:', error);
                console.error('Error details:', JSON.stringify(error, null, 2));
                return;
            }

            console.log('Upvoted startups data:', data);
            this.upvotedStartups = data || [];
        } catch (error) {
            console.error('Failed to load upvoted startups:', error);
        }
    }

    renderUpvotedStartups() {
        const container = document.getElementById('upvoted-startups-grid');
        if (!container) return;

        if (this.upvotedStartups.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-10">
                    <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-rose-50 border border-rose-200 text-rose-500 mb-3">
                        <i class="fas fa-heart text-sm"></i>
                    </div>
                    <p class="text-sm font-medium text-gray-900">You haven't upvoted any startups yet</p>
                    <p class="text-xs text-gray-500 mt-1">Visit the homepage to discover and upvote startups.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.upvotedStartups.map(startup => this.createUpvotedStartupCard(startup)).join('');
    }

    createUpvotedStartupCard(startup) {
        const votedDate = new Date(startup.voted_at).toLocaleDateString();

        return `
            <div class="sh-card p-5">
                <div class="flex items-start justify-between gap-2 mb-2">
                    <h3 class="font-semibold text-base text-gray-900 flex-1 min-w-0 truncate">${startup.name}</h3>
                    ${startup.daily_rank && startup.daily_rank <= 3 ? `
                        <span class="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
                            <i class="fas fa-trophy text-[10px]"></i>#${startup.daily_rank}
                        </span>
                    ` : ''}
                </div>

                <p class="text-sm text-gray-600 leading-relaxed line-clamp-2 mb-4">
                    ${startup.tagline || 'No tagline provided'}
                </p>

                <div class="flex items-center gap-4 text-xs text-gray-500 mb-4">
                    <span class="inline-flex items-center gap-1.5">
                        <i class="fas fa-heart text-rose-500 text-[11px]"></i>
                        <span class="tabular-nums">${startup.upvote_count}</span> upvotes
                    </span>
                    <span class="text-gray-300">·</span>
                    <span>Upvoted ${votedDate}</span>
                </div>

                <div class="flex gap-2">
                    <a href="/startup/${startup.slug}" target="_blank" class="sh-btn-ghost text-sm flex-1 justify-center">
                        <i class="fas fa-eye text-xs"></i> View
                    </a>
                    <a href="${startup.url}" target="_blank" class="sh-btn-primary text-sm flex-1 justify-center">
                        <i class="fas fa-external-link-alt text-xs"></i> Visit
                    </a>
                </div>
            </div>
        `;
    }

    renderListings() {
        const grid = document.getElementById('listings-grid');
        const noListings = document.getElementById('no-listings');

        if (this.listings.length === 0) {
            noListings.classList.remove('hidden');
            grid.classList.add('hidden');
            return;
        }

        noListings.classList.add('hidden');
        grid.classList.remove('hidden');

        grid.innerHTML = this.listings.map(listing => this.createListingCard(listing)).join('');
    }

    createListingCard(listing) {
        const createdDate = new Date(listing.created_at).toLocaleDateString();
        const launchDate = listing.launch_date ? new Date(listing.launch_date).toLocaleDateString() : 'Not set';
        const isPremium = listing.plan === 'premium';
        const isFeatured = listing.plan === 'featured';
        const isLive = listing.is_live;
        
        // Determine plan badge
        let badge = '';
        if (isFeatured) {
            badge = `<span class="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full shrink-0">
                <i class="fas fa-crown text-[9px]"></i> Featured
            </span>`;
        } else if (isPremium) {
            badge = `<span class="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
                <i class="fas fa-star text-[9px]"></i> Premium
            </span>`;
        } else {
            badge = `<span class="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider text-gray-600 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full shrink-0">
                Free
            </span>`;
        }

        // Status indicator
        const statusBadge = isLive
            ? `<span class="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Live
            </span>`
            : `<span class="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                <i class="fas fa-clock text-[9px]"></i> Pending
            </span>`;

        return `
            <div class="sh-card p-0 overflow-hidden ${isFeatured ? 'ring-1 ring-orange-200' : ''}">
                ${listing.screenshot_url ? `
                    <img src="${listing.screenshot_url}" alt="${listing.title}"
                         class="w-full h-36 object-cover border-b border-gray-200">
                ` : `
                    <div class="w-full h-36 bg-gray-50 border-b border-gray-200 flex items-center justify-center text-gray-400">
                        <i class="fas fa-image text-2xl"></i>
                    </div>
                `}

                <div class="p-5">
                    <div class="flex items-start justify-between gap-2 mb-2">
                        <h3 class="font-semibold text-base text-gray-900 flex-1 min-w-0 truncate">${listing.title}</h3>
                        ${badge}
                    </div>

                    <div class="flex items-center gap-2 mb-3">
                        ${statusBadge}
                    </div>

                    <p class="text-sm text-gray-600 leading-relaxed line-clamp-2 mb-4">
                        ${listing.description || 'No description provided'}
                    </p>

                    <div class="space-y-1.5 mb-4 text-xs text-gray-500">
                        <div class="flex items-center gap-1.5">
                            <i class="fas fa-link text-[10px] text-gray-400"></i>
                            <a href="${listing.url}" target="_blank" class="hover:text-gray-900 truncate">
                                ${listing.url}
                            </a>
                        </div>
                        <div class="flex items-center gap-1.5">
                            <i class="fas fa-calendar text-[10px] text-gray-400"></i>
                            <span>Created ${createdDate}</span>
                        </div>
                        <div class="flex items-center gap-1.5">
                            <i class="fas fa-rocket text-[10px] text-gray-400"></i>
                            <span>Launch ${launchDate}</span>
                        </div>
                    </div>

                    <div class="flex gap-2">
                        <button onclick="dashboard.editListing('${listing.id}')" class="sh-btn-ghost text-sm flex-1 justify-center">
                            <i class="fas fa-edit text-xs"></i> Edit
                        </button>
                        <a href="/startup/${listing.slug}" target="_blank" class="sh-btn-primary text-sm flex-1 justify-center">
                            <i class="fas fa-eye text-xs"></i> View
                        </a>
                    </div>

                    ${!isPremium && !isFeatured ? `
                    <div class="border-t border-gray-200 pt-4 mt-4">
                        <p class="text-[11px] uppercase tracking-wider font-semibold text-gray-500 mb-2">Boost your listing</p>
                        <div class="flex gap-2">
                            <button onclick="dashboard.showUpgradeModal('${listing.id}', '${listing.title.replace(/'/g, "\\'")}', 'premium')"
                                    class="sh-btn-ghost text-xs flex-1 justify-center">
                                <i class="fas fa-star text-[10px]"></i> Premium $20
                            </button>
                            <button onclick="dashboard.showUpgradeModal('${listing.id}', '${listing.title.replace(/'/g, "\\'")}', 'featured')"
                                    class="sh-btn-accent text-xs flex-1 justify-center">
                                <i class="fas fa-crown text-[10px]"></i> Featured $50/wk
                            </button>
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    showUpgradeModal(listingId, listingTitle, productType) {
        const listing = this.listings.find(l => l.id === listingId);
        if (!listing) return;

        const isPremium = productType === 'premium';
        const accentText = isPremium ? 'text-amber-700' : 'text-orange-700';
        const accentBg = isPremium ? 'bg-amber-50 border-amber-200' : 'bg-orange-50 border-orange-200';
        const checks = isPremium
            ? [
                ['<strong>Guaranteed high-authority backlink</strong>'],
                ['14 days on homepage (vs. 7 days)'],
                ['Featured in our newsletter'],
                ['Re-launch to the feed today'],
              ]
            : [
                ['<strong>Guaranteed high-authority backlink</strong>'],
                ['Featured placement at top of feed'],
                ['Colorful gradient border'],
                ['FEATURED badge on listing'],
                ['Re-launch to the feed today'],
              ];
        const featureList = checks.map(([txt]) => `
            <li class="flex items-start gap-2.5">
                <i class="fas fa-check ${isPremium ? 'text-amber-600' : 'text-orange-600'} mt-1 text-xs"></i>
                <span class="text-gray-700">${txt}</span>
            </li>
        `).join('');

        const modalHtml = `
            <div id="upgrade-modal" class="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div class="bg-white border border-gray-200 rounded-2xl shadow-xl max-w-md w-full">
                    <div class="flex justify-between items-start px-6 py-5 border-b border-gray-200">
                        <div>
                            <span class="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${accentText} ${accentBg} border px-2 py-0.5 rounded-full mb-2">
                                <i class="fas ${isPremium ? 'fa-star' : 'fa-crown'} text-[9px]"></i>
                                ${isPremium ? 'Premium' : 'Featured'}
                            </span>
                            <h2 class="text-lg font-semibold text-gray-900">${isPremium ? 'Upgrade to Premium' : 'Get Featured'}</h2>
                        </div>
                        <button onclick="dashboard.closeUpgradeModal()" class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div class="px-6 py-5">
                        <div class="mb-5 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
                            <p class="text-xs text-gray-500">Listing</p>
                            <p class="font-medium text-gray-900 truncate">${listingTitle}</p>
                        </div>

                        <div class="mb-6">
                            <div class="flex items-baseline gap-1 mb-4">
                                <span class="text-3xl font-semibold tracking-tight text-gray-900">${isPremium ? '$20' : '$50'}</span>
                                <span class="text-sm text-gray-500">${isPremium ? 'one-time' : '/ week'}</span>
                            </div>
                            <ul class="space-y-2.5 text-sm">
                                ${featureList}
                            </ul>
                        </div>

                        <div class="flex gap-2 pt-4 border-t border-gray-200">
                            <button onclick="dashboard.closeUpgradeModal()" class="sh-btn-ghost flex-1 justify-center">
                                Cancel
                            </button>
                            <button onclick="dashboard.processUpgrade('${listingId}', '${listingTitle.replace(/'/g, "\\'")}', '${productType}')"
                                    class="sh-btn-accent flex-1 justify-center">
                                <i class="fas fa-credit-card text-xs"></i> Pay now
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        this.closeUpgradeModal();
        
        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    closeUpgradeModal() {
        const modal = document.getElementById('upgrade-modal');
        if (modal) {
            modal.remove();
        }
    }

    async processUpgrade(listingId, listingTitle, productType) {
        const listing = this.listings.find(l => l.id === listingId);
        if (!listing) return;

        // Track upgrade attempt
        if (typeof window.gtag === 'function') {
            window.gtag('event', 'upgrade_attempt', {
                event_category: 'listing',
                event_label: listing.title,
                listing_id: listingId,
                product_type: productType
            });
        }

        // Create Stripe checkout session via Edge Function
        try {
            const response = await fetch('https://lbayphzxmdtdmrqmeomt.supabase.co/functions/v1/create-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    product: productType,
                    startupId: listingId,
                    startupTitle: listingTitle || listing.title,
                    userEmail: this.currentUser?.email,
                    successUrl: `${window.location.origin}/payment-success`,
                    cancelUrl: window.location.href
                })
            });

            if (!response.ok) {
                throw new Error('Failed to create checkout session');
            }

            const { url } = await response.json();
            if (url) {
                window.location.href = url;
            }
        } catch (error) {
            console.error('Checkout error:', error);
            this.showError('Failed to start checkout. Please try again.');
        }
    }

    async upgradeListing(listingId, listingTitle) {
        // Legacy method - redirect to showUpgradeModal
        this.showUpgradeModal(listingId, listingTitle, 'featured');
    }

    editListing(listingId) {
        const listing = this.listings.find(l => l.id === listingId);
        if (!listing) return;

        this.editingListing = listing;
        
        // Populate form
        document.getElementById('edit-id').value = listing.id;
        document.getElementById('edit-title').value = listing.title;
        document.getElementById('edit-url').value = listing.url;
        document.getElementById('edit-description').value = listing.description || '';
        document.getElementById('edit-slug').value = listing.slug;
        
        // Show modal
        document.getElementById('edit-modal').classList.remove('hidden');
    }

    closeEditModal() {
        document.getElementById('edit-modal').classList.add('hidden');
        this.editingListing = null;
    }

    async saveChanges(formData) {
        try {
            const supabase = supabaseClient();
            
            const { data, error } = await supabase
                .from('startups')
                .update({
                    title: formData.title,
                    url: formData.url,
                    description: formData.description,
                    slug: formData.slug,
                    updated_at: new Date().toISOString()
                })
                .eq('id', this.editingListing.id)
                .select()
                .single();

            if (error) {
                if (error.code === '23505' && error.message.includes('startups_slug_key')) {
                    throw new Error('This slug is already taken. Please choose a different one.');
                }
                throw error;
            }

            // Update local listing
            const index = this.listings.findIndex(l => l.id === this.editingListing.id);
            if (index !== -1) {
                this.listings[index] = { ...this.listings[index], ...data };
                this.renderListings();
            }

            this.closeEditModal();
            this.showSuccess('Listing updated successfully!');

        } catch (error) {
            console.error('Error updating listing:', error);
            this.showError(error.message || 'Failed to update listing. Please try again.');
        }
    }

    async logout() {
        try {
            await auth.signOut();
            window.location.href = '/';
        } catch (error) {
            console.error('Logout failed:', error);
            this.showError('Failed to logout. Please try again.');
        }
    }

    setupEventListeners() {
        // Logout button
        document.getElementById('logout-btn').addEventListener('click', () => {
            this.logout();
        });

        // Modal close buttons
        document.getElementById('close-modal').addEventListener('click', () => {
            this.closeEditModal();
        });
        
        document.getElementById('cancel-edit').addEventListener('click', () => {
            this.closeEditModal();
        });

        // Click outside modal to close
        document.getElementById('edit-modal').addEventListener('click', (e) => {
            if (e.target.id === 'edit-modal') {
                this.closeEditModal();
            }
        });

        // Edit form submission
        document.getElementById('edit-form').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const formData = {
                title: document.getElementById('edit-title').value.trim(),
                url: document.getElementById('edit-url').value.trim(),
                description: document.getElementById('edit-description').value.trim(),
                slug: document.getElementById('edit-slug').value.trim()
            };

            // Basic validation
            if (!formData.title || !formData.url || !formData.slug) {
                this.showError('Please fill in all required fields.');
                return;
            }

            // URL validation
            try {
                new URL(formData.url);
            } catch {
                this.showError('Please enter a valid URL.');
                return;
            }

            // Slug validation
            if (!/^[a-z0-9-]+$/.test(formData.slug)) {
                this.showError('Slug can only contain lowercase letters, numbers, and hyphens.');
                return;
            }

            this.saveChanges(formData);
        });

        // Auto-generate slug from title
        document.getElementById('edit-title').addEventListener('input', (e) => {
            const title = e.target.value;
            const slugField = document.getElementById('edit-slug');
            
            // Only auto-generate if slug is empty or matches the previous title
            if (!slugField.value || slugField.value === this.generateSlug(this.editingListing?.title || '')) {
                slugField.value = this.generateSlug(title);
            }
        });
    }

    generateSlug(title) {
        return title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 50);
    }

    showError(message) {
        const notification = document.createElement('div');
        notification.className = 'fixed top-4 right-4 bg-white border border-red-200 rounded-xl shadow-lg px-4 py-3 z-50 max-w-sm';
        notification.innerHTML = `
            <div class="flex items-start gap-3">
                <i class="fas fa-exclamation-triangle text-red-500 text-sm mt-0.5"></i>
                <span class="text-sm text-gray-900 flex-1">${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" class="text-gray-400 hover:text-gray-900 transition-colors -mr-1">
                    <i class="fas fa-times text-xs"></i>
                </button>
            </div>
        `;
        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentElement) notification.remove();
        }, 5000);
    }

    showSuccess(message) {
        const notification = document.createElement('div');
        notification.className = 'fixed top-4 right-4 bg-white border border-emerald-200 rounded-xl shadow-lg px-4 py-3 z-50 max-w-sm';
        notification.innerHTML = `
            <div class="flex items-start gap-3">
                <i class="fas fa-check-circle text-emerald-500 text-sm mt-0.5"></i>
                <span class="text-sm text-gray-900 flex-1">${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" class="text-gray-400 hover:text-gray-900 transition-colors -mr-1">
                    <i class="fas fa-times text-xs"></i>
                </button>
            </div>
        `;
        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentElement) notification.remove();
        }, 3000);
    }
}

// Initialize dashboard
const dashboard = new Dashboard();

// Make dashboard available globally for onclick handlers
window.dashboard = dashboard;
