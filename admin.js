// GrowthMachine Studio Admin Panel Logic

const AUTH_SESSION_KEY = 'gms_admin_auth_active';

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  populateProfileForm();
  populatePortfolioList();
  populatePricingForm();
  bindEvents();
});

// Authentication Handling
function initAuth() {
  // Always default lock on load so unauthorized visitors cannot see contents
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.style.display = 'flex';

  const authForm = document.getElementById('auth-form');
  const pinInput = document.getElementById('admin-pin-input');
  const errMsg = document.getElementById('auth-err-msg');

  if (authForm) {
    authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const currentData = DataStore.get();
      const targetPin = (currentData.siteProfile && currentData.siteProfile.adminPin) || '1234';

      if (pinInput.value.trim() === targetPin) {
        if (overlay) overlay.style.display = 'none';
        if (errMsg) errMsg.style.display = 'none';
      } else {
        if (errMsg) errMsg.style.display = 'block';
        pinInput.value = '';
        pinInput.focus();
      }
    });
  }
}

// Populate and Save Profile Form
function populateProfileForm() {
  const data = DataStore.get();
  const prof = data.siteProfile || {};

  document.getElementById('prof-agency-name').value = prof.agencyName || '';
  document.getElementById('prof-email').value = prof.email || '';
  document.getElementById('prof-phone').value = prof.phone || '';
  document.getElementById('prof-whatsapp').value = prof.whatsapp || '';
  document.getElementById('prof-tagline').value = prof.tagline || '';
  document.getElementById('prof-subheadline').value = prof.subheadline || '';
  document.getElementById('prof-location').value = prof.location || '';
  document.getElementById('prof-pin').value = prof.adminPin || '1234';

  const form = document.getElementById('profile-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const currentData = DataStore.get();
    currentData.siteProfile = {
      agencyName: document.getElementById('prof-agency-name').value.trim(),
      email: document.getElementById('prof-email').value.trim(),
      phone: document.getElementById('prof-phone').value.trim(),
      whatsapp: document.getElementById('prof-whatsapp').value.trim().replace(/[^0-9]/g, ''),
      tagline: document.getElementById('prof-tagline').value.trim(),
      subheadline: document.getElementById('prof-subheadline').value.trim(),
      location: document.getElementById('prof-location').value.trim(),
      adminPin: document.getElementById('prof-pin').value.trim() || '1234'
    };

    DataStore.save(currentData);
    showToast('Business details updated successfully!');
  });
}

// Portfolio Projects Management
function populatePortfolioList() {
  const data = DataStore.get();
  const listEl = document.getElementById('admin-portfolio-list');
  if (!listEl) return;

  const projects = data.portfolio || [];
  if (projects.length === 0) {
    listEl.innerHTML = `<p style="color: var(--text-dim); font-size: 14px;">No projects added yet. Click "+ Add New Client Project" to showcase your first client.</p>`;
    return;
  }

  listEl.innerHTML = projects.map((p, idx) => `
    <div class="portfolio-manage-item">
      <img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.title)}" class="portfolio-manage-thumb">
      <div class="portfolio-manage-info">
        <h4>${escapeHTML(p.title)}</h4>
        <div style="font-size: 13px; color: #ffaa00; margin-bottom: 4px;">Client: ${escapeHTML(p.client || '')} • <span style="color: var(--text-dim);">${escapeHTML(p.category || '')}</span></div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">${escapeHTML(p.desc || '')}</p>
        <div>
          <a href="${escapeHTML(p.url)}" target="_blank" style="font-size: 12px; color: var(--text-main); text-decoration: underline;">
            🔗 ${escapeHTML(p.url)}
          </a>
        </div>
      </div>
      <div class="portfolio-manage-actions">
        <button class="btn-danger" onclick="deletePortfolioItem(${idx})">Delete</button>
      </div>
    </div>
  `).join('');
}

window.deletePortfolioItem = function(index) {
  if (confirm('Are you sure you want to remove this project from your portfolio?')) {
    const data = DataStore.get();
    data.portfolio.splice(index, 1);
    DataStore.save(data);
    populatePortfolioList();
    showToast('Project removed successfully.');
  }
};

function bindEvents() {
  // Toggle Add Project Box
  const toggleBtn = document.getElementById('toggle-add-project-btn');
  const cancelBtn = document.getElementById('cancel-add-project');
  const addBox = document.getElementById('add-project-box');

  if (toggleBtn && addBox) {
    toggleBtn.addEventListener('click', () => {
      addBox.style.display = addBox.style.display === 'none' ? 'block' : 'none';
      if (addBox.style.display === 'block') {
        document.getElementById('proj-title').focus();
      }
    });
  }

  if (cancelBtn && addBox) {
    cancelBtn.addEventListener('click', () => {
      addBox.style.display = 'none';
    });
  }

  // Handle New Project Submission
  const newProjectForm = document.getElementById('new-project-form');
  if (newProjectForm) {
    newProjectForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = document.getElementById('proj-title').value.trim();
      const client = document.getElementById('proj-client').value.trim();
      const category = document.getElementById('proj-category').value;
      const url = document.getElementById('proj-url').value.trim();
      const image = document.getElementById('proj-image').value.trim();
      const desc = document.getElementById('proj-desc').value.trim();
      const rawTags = document.getElementById('proj-tags').value.trim();
      const tags = rawTags ? rawTags.split(',').map(t => t.trim()) : ['Live Website'];

      const newProj = {
        id: 'proj-' + Date.now(),
        title,
        client,
        category,
        url,
        image,
        desc,
        tags
      };

      const data = DataStore.get();
      if (!data.portfolio) data.portfolio = [];
      data.portfolio.unshift(newProj); // Add to top
      DataStore.save(data);

      newProjectForm.reset();
      addBox.style.display = 'none';
      populatePortfolioList();
      showToast('New project published to live showcase!');
    });
  }

  // Export JSON
  const exportBtn = document.getElementById('export-json-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      DataStore.exportJSON();
    });
  }

  // Reset to Defaults
  const resetBtn = document.getElementById('reset-defaults-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all data back to factory defaults? Any custom projects will be reset.')) {
        DataStore.reset();
        window.location.reload();
      }
    });
  }
}

// Pricing Form Manager
function populatePricingForm() {
  const data = DataStore.get();
  const container = document.getElementById('pricing-fields-container');
  if (!container || !data.pricingPlans) return;

  container.innerHTML = data.pricingPlans.map((plan, idx) => `
    <div class="form-group" style="background: var(--bg-card); padding: 16px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
      <label style="color: #ffaa00; margin-bottom: 8px;">${escapeHTML(plan.name)}</label>
      <div style="margin-bottom: 8px;">
        <label style="font-size: 11px;">Package Price</label>
        <input type="text" id="plan-price-${idx}" value="${escapeHTML(plan.price)}" placeholder="₹3,999" required>
      </div>
      <div>
        <label style="font-size: 11px;">Brief Description</label>
        <input type="text" id="plan-desc-${idx}" value="${escapeHTML(plan.desc)}" required>
      </div>
    </div>
  `).join('');

  const pricingForm = document.getElementById('pricing-form');
  if (pricingForm) {
    pricingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const currentData = DataStore.get();
      currentData.pricingPlans.forEach((plan, idx) => {
        const priceInput = document.getElementById(`plan-price-${idx}`);
        const descInput = document.getElementById(`plan-desc-${idx}`);
        if (priceInput) plan.price = priceInput.value.trim();
        if (descInput) plan.desc = descInput.value.trim();
      });

      DataStore.save(currentData);
      showToast('Pricing plans updated successfully!');
    });
  }
}

function showToast(msg) {
  const toast = document.getElementById('status-toast');
  if (toast) {
    toast.textContent = `✓ ${msg}`;
    toast.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      toast.style.display = 'none';
    }, 4000);
  }
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
