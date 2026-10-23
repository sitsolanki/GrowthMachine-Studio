// GrowthMachine Studio Main Frontend Logic

document.addEventListener('DOMContentLoaded', () => {
  renderPageContent();
  setupFAQ();
  // Fetch latest content from Cloudflare Worker KV / Server Edge in background
  if (typeof DataStore !== 'undefined' && DataStore.fetchFromServer) {
    DataStore.fetchFromServer(() => {
      renderPageContent();
    });
  }
});

function renderPageContent() {
  const data = DataStore.get();
  const profile = data.siteProfile || {};

  // Update Dynamic Agency Text
  const agencyNameElems = ['nav-agency-name', 'footer-agency-name', 'footer-copy-agency'];
  agencyNameElems.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === 'nav-agency-name') {
        const raw = profile.agencyName || 'GrowthMachine Studio';
        if (raw.toLowerCase().endsWith('studio')) {
          const prefix = raw.slice(0, raw.length - 6).trim();
          el.innerHTML = `${escapeHTML(prefix)} <span class="logo-text-accent">Studio</span>`;
        } else {
          el.textContent = raw;
        }
      } else {
        el.textContent = profile.agencyName || 'GrowthMachine Studio';
      }
    }
  });

  const subheadline = document.getElementById('hero-subheadline');
  if (subheadline && profile.subheadline) subheadline.textContent = profile.subheadline;

  const footerTagline = document.getElementById('footer-tagline');
  if (footerTagline && profile.tagline) footerTagline.textContent = profile.tagline;

  const footerLoc = document.getElementById('footer-location');
  if (footerLoc && profile.location) footerLoc.textContent = `📍 ${profile.location}`;

  // WhatsApp link generator
  const cleanPhone = (profile.whatsapp || '917557575514').replace(/[^0-9]/g, '');
  const defaultMsg = encodeURIComponent(`Hi ${profile.agencyName || 'GrowthMachine Studio'}, I want to build a website/landing page for my business. Can we discuss?`);
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${defaultMsg}`;

  // Bind WhatsApp buttons
  ['header-whatsapp-btn', 'hero-whatsapp-btn', 'cta-whatsapp-btn', 'footer-whatsapp-link', 'floating-whatsapp-btn'].forEach(id => {
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

  // Render Stats
  const statsContainer = document.getElementById('stats-container');
  if (statsContainer && data.stats) {
    statsContainer.innerHTML = data.stats.map(s => `
      <div class="stat-item">
        <h3>${escapeHTML(s.value)}</h3>
        <p>${escapeHTML(s.label)}</p>
      </div>
    `).join('');
  }

  // Render Portfolio Case Studies
  const portfolioContainer = document.getElementById('portfolio-container');
  if (portfolioContainer && data.portfolio) {
    portfolioContainer.innerHTML = data.portfolio.map(item => `
      <div class="portfolio-card">
        <div class="portfolio-preview">
          <img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.title)}" loading="lazy" onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'800\\' height=\\'500\\' viewBox=\\'0 0 800 500\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%23181b24\\'/><text x=\\'50%\\' y=\\'50%\\' fill=\\'%23ffaa00\\' font-family=\\'sans-serif\\' font-size=\\'22\\' text-anchor=\\'middle\\' dominant-baseline=\\'middle\\'>${escapeHTML(item.title)}</text></svg>';">
          <div class="portfolio-badge">${escapeHTML(item.category || 'Live Project')}</div>
        </div>
        <div class="portfolio-body">
          <h3 class="portfolio-title">${escapeHTML(item.title)}</h3>
          <div class="portfolio-client">Client: ${escapeHTML(item.client || 'Verified Client')}</div>
          <p class="portfolio-desc">${escapeHTML(item.desc)}</p>
          <div class="portfolio-tags">
            ${(item.tags || []).map(t => `<span class="portfolio-tag">${escapeHTML(t)}</span>`).join('')}
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

  // Render Services
  const servicesContainer = document.getElementById('services-container');
  if (servicesContainer && data.services) {
    servicesContainer.innerHTML = data.services.map(srv => `
      <div class="service-card">
        <div class="service-icon">${escapeHTML(srv.icon || '⚡')}</div>
        <h3 class="service-title">${escapeHTML(srv.title)}</h3>
        <p class="service-desc">${escapeHTML(srv.desc)}</p>
      </div>
    `).join('');
  }

  // Render Pricing Packages
  const pricingContainer = document.getElementById('pricing-container');
  if (pricingContainer && data.pricingPlans) {
    pricingContainer.innerHTML = data.pricingPlans.map(plan => `
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
          ${(plan.features || []).map(f => `<li>${escapeHTML(f)}</li>`).join('')}
        </ul>
        <a href="${whatsappUrl}&text=${encodeURIComponent('Hi, I am interested in the "' + plan.name + ' (' + plan.price + ')" package for my business.')}" target="_blank" class="btn ${plan.popular ? 'btn-primary' : 'btn-outline'}" style="width: 100%;">
          <span>⚡ Select Package & WhatsApp</span>
        </a>
      </div>
    `).join('');
  }

  // Render FAQ
  const faqContainer = document.getElementById('faq-container');
  if (faqContainer && data.faq) {
    faqContainer.innerHTML = data.faq.map((item, idx) => `
      <div class="faq-item ${idx === 0 ? 'active' : ''}">
        <button class="faq-question">
          <span>${escapeHTML(item.q)}</span>
          <span class="faq-icon">+</span>
        </button>
        <div class="faq-answer">
          <p>${escapeHTML(item.a)}</p>
        </div>
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
