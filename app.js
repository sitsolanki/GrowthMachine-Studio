// GrowthMachine Studio Main Frontend Logic
// Fetches live data from the Worker API (/api/business, /api/listings)

const API_BASE = '';

async function fetchJSON(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Request failed for ${path}: ${res.status}`);
  return res.json();
}

document.addEventListener('DOMContentLoaded', () => {
  renderPageContent();
  setupFAQ();
});

async function renderPageContent() {
  const [profileResult, listingsResult] = await Promise.allSettled([
    fetchJSON('/api/business'),
    fetchJSON('/api/listings'),
  ]);
  const defaults = typeof DataStore !== 'undefined' ? DataStore.get() : {};
  const remoteProfile = profileResult.status === 'fulfilled' && profileResult.value
    ? profileResult.value
    : {};
  const profile = {
    agency_name: defaults.siteProfile?.agencyName || 'GrowthMachine Studio',
    email: defaults.siteProfile?.email || 'studio.growthmachine@gmail.com',
    phone: defaults.siteProfile?.phone || '+91 75575 75514',
    whatsapp: defaults.siteProfile?.whatsapp || '917557575514',
    tagline: defaults.siteProfile?.tagline || '',
    subheadline: defaults.siteProfile?.subheadline || '',
    location: defaults.siteProfile?.location || '',
    ...remoteProfile,
  };
  const remoteListings = listingsResult.status === 'fulfilled' && Array.isArray(listingsResult.value)
    ? listingsResult.value
    : [];
  const listings = remoteListings.length ? remoteListings : (defaults.portfolio || []);
  if (profileResult.status === 'rejected') console.error('Could not load business profile:', profileResult.reason);
  if (listingsResult.status === 'rejected') console.error('Could not load portfolio listings:', listingsResult.reason);

  // WhatsApp link built from profile
  const cleanPhone = (profile.whatsapp || '917557575514').replace(/[^0-9]/g, '');
  const defaultMsg = encodeURIComponent(`Hi ${profile.agency_name || 'GrowthMachine Studio'}, I want to build a website/landing page for my business. Can we discuss?`);
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${defaultMsg}`;

  // Update Dynamic Agency Text
  const agencyNameElems = ['nav-agency-name', 'footer-agency-name', 'footer-copy-agency'];
  agencyNameElems.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const raw = profile.agency_name || 'GrowthMachine Studio';
    if (id === 'nav-agency-name') {
      if (raw.toLowerCase().endsWith('studio')) {
        const prefix = raw.slice(0, raw.length - 6).trim();
        el.innerHTML = `${escapeHTML(prefix)} <span class="logo-text-accent">Studio</span>`;
      } else {
        el.textContent = raw;
      }
    } else {
      el.textContent = raw;
    }
  });

  const subheadline = document.getElementById('hero-subheadline');
  if (subheadline && profile.subheadline) subheadline.textContent = profile.subheadline;

  const footerTagline = document.getElementById('footer-tagline');
  if (footerTagline && profile.tagline) footerTagline.textContent = profile.tagline;

  const footerLoc = document.getElementById('footer-location');
  if (footerLoc && profile.location) footerLoc.textContent = `📍 ${profile.location}`;

  // Bind WhatsApp buttons
  ['hero-whatsapp-btn', 'cta-whatsapp-btn', 'footer-whatsapp-link', 'floating-whatsapp-btn'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.href = whatsappUrl;
  });

  // Phone and Email links
  const emailLink = document.getElementById('footer-email-link');
  const emailText = document.getElementById('footer-email-text');
  if (emailLink && emailText) {
    emailLink.href = `mailto:${profile.email || 'studio.growthmachine@gmail.com'}`;
    emailText.textContent = profile.email || 'studio.growthmachine@gmail.com';
  }

  const phoneLink = document.getElementById('footer-phone-link');
  const phoneText = document.getElementById('footer-phone-text');
  if (phoneLink && phoneText) {
    phoneLink.href = `tel:${(profile.phone || '+91 75575 75514').replace(/\s+/g, '')}`;
    phoneText.textContent = profile.phone || '+91 75575 75514';
  }

  // Render Stats (static)
  const stats = [
    { value: '24-48h', label: 'Superfast Turnaround' },
    { value: '100%', label: 'Ownership Belongs To You' },
    { value: 'SEO-Ready', label: 'Built for Google Visibility' },
    { value: 'Full Guide', label: 'Domain & Hosting Assistance' },
  ];
  const statsContainer = document.getElementById('stats-container');
  if (statsContainer) {
    statsContainer.innerHTML = stats.map((s) => `
      <div class="stat-item">
        <h3>${escapeHTML(s.value)}</h3>
        <p>${escapeHTML(s.label)}</p>
      </div>
    `).join('');
  }

  // Render Portfolio Case Studies from listings API
  const portfolioContainer = document.getElementById('portfolio-container');
  if (portfolioContainer) {
    portfolioContainer.innerHTML = listings.map((item) => `
      <div class="portfolio-card">
        <div class="portfolio-preview">
          <img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.title)}" loading="lazy">
          <div class="portfolio-badge">${escapeHTML(item.category || 'Live Project')}</div>
        </div>
        <div class="portfolio-body">
          <h3 class="portfolio-title">${escapeHTML(item.title)}</h3>
          <div class="portfolio-client">Client: ${escapeHTML(item.client || 'Verified Client')}</div>
          <p class="portfolio-desc">${escapeHTML(item.description || item.desc || '')}</p>
          <div class="portfolio-tags">
            ${(item.tags || []).map((t) => `<span class="portfolio-tag">${escapeHTML(t)}</span>`).join('')}
          </div>
          <div class="portfolio-footer">
            <a href="${escapeHTML(item.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" style="flex: 1;">
              <span>🌐 Visit Live Website</span>
            </a>
            <a href="${whatsappUrl}&text=${encodeURIComponent('Hi, I saw your live project "' + item.title + '" and want something similar for my business.')}" target="_blank" class="btn btn-outline btn-sm">
              <span>💬 Clone Similar</span>
            </a>
          </div>
        </div>
      </div>
    `).join('');
  }

  // Render Services (static)
  const services = [
    {
      icon: '⚡',
      title: 'Landing Page Design',
      desc: 'Conversion-focused landing pages for local services, campaigns and product launches, with mobile-friendly layouts and direct call or WhatsApp actions.',
    },
    {
      icon: '🏛️',
      title: 'Business Website Development',
      desc: 'Custom websites for professionals and local businesses, including advocates, clinics, consultants and real estate services.',
    },
    {
      icon: '🛍️',
      title: 'E-commerce Catalog Websites',
      desc: 'Product catalogues and lightweight online storefronts that help customers explore products and contact your business to order.',
    },
    {
      icon: '⚙️',
      title: 'Website Launch Support',
      desc: 'Practical help with domain, hosting and launch setup, plus a responsive website designed to work across phones, tablets and desktops.',
    },
  ];
  const servicesContainer = document.getElementById('services-container');
  if (servicesContainer) {
    servicesContainer.innerHTML = services.map((srv) => `
      <div class="service-card">
        <div class="service-icon">${escapeHTML(srv.icon || '⚡')}</div>
        <h3 class="service-title">${escapeHTML(srv.title)}</h3>
        <p class="service-desc">${escapeHTML(srv.desc)}</p>
      </div>
    `).join('');
  }

  // Render Pricing Packages from business_info.pricing_plans
  const pricingContainer = document.getElementById('pricing-container');
  if (pricingContainer) {
    const plans = Array.isArray(profile.pricing_plans) && profile.pricing_plans.length
      ? profile.pricing_plans
      : (defaults.pricingPlans || []);
    if (plans.length) pricingContainer.innerHTML = plans.map((plan) => `
      <div class="pricing-card ${plan.popular ? 'featured' : ''}">
        ${plan.badge ? `<div class="pricing-pill">${escapeHTML(plan.badge)}</div>` : ''}
        <div class="pricing-header">
          <h3 class="plan-name">${escapeHTML(plan.name)}</h3>
          <p class="plan-desc">${escapeHTML(plan.desc)}</p>
          <div class="plan-price-wrap">
            <div class="plan-price">${escapeHTML(plan.price)}</div>
            <div class="plan-period">/ ${escapeHTML(plan.period || 'one-time')}</div>
          </div>
        </div>
        <ul class="plan-features">
          ${(plan.features || []).map((f) => `<li>${escapeHTML(f)}</li>`).join('')}
        </ul>
        <a href="${whatsappUrl}&text=${encodeURIComponent('Hi, I am interested in the "' + plan.name + ' (' + plan.price + ')" package for my business.')}" target="_blank" class="btn ${plan.popular ? 'btn-primary' : 'btn-outline'}" style="width: 100%;">
          <span>⚡ Select Package & WhatsApp</span>
        </a>
      </div>
    `).join('');
  }

}

function setupFAQ() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.faq-question');
    if (!btn) return;
    const item = btn.closest('.faq-item');
    if (item) {
      item.classList.toggle('active');
      btn.setAttribute('aria-expanded', String(item.classList.contains('active')));
    }
  });
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
