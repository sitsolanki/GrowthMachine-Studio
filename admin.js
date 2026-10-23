// GrowthMachine Studio Admin Panel Logic
// Universal synchronization powered by Cloudflare Workers & D1 SQL Database

const API_BASE = '';
let adminToken = null; // Stored in memory only during active session
let currentListings = [];

async function apiRequest(path, opts = {}) {
  const headers = new Headers(opts.headers || {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (adminToken) {
    headers.set('Authorization', `Bearer ${adminToken}`);
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
  });
  if (res.status === 401) {
    adminToken = null;
    lockAdmin();
    throw new Error('Session locked or invalid PIN. Please unlock again.');
  }
  return res;
}

async function apiJson(path, opts = {}) {
  const res = await apiRequest(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function lockAdmin() {
  const overlay = document.getElementById('auth-overlay');
  const mainContainer = document.getElementById('admin-main-container');
  const pinInput = document.getElementById('admin-pin-input');
  const errMsg = document.getElementById('auth-err-msg');

  if (overlay) overlay.style.display = 'flex';
  if (mainContainer) mainContainer.style.display = 'none';
  if (errMsg) errMsg.style.display = 'none';
  if (pinInput) {
    pinInput.value = '';
    pinInput.focus();
  }
  adminToken = null;
}

function unlockAdmin() {
  const overlay = document.getElementById('auth-overlay');
  const mainContainer = document.getElementById('admin-main-container');
  const errMsg = document.getElementById('auth-err-msg');

  if (overlay) overlay.style.display = 'none';
  if (mainContainer) mainContainer.style.display = 'block';
  if (errMsg) errMsg.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  bindEvents();
  lockAdmin(); // Always strictly locked on initial page load / refresh
});

// Auto-lock when navigating away, switching tabs, or restoring from BFCache
window.addEventListener('beforeunload', lockAdmin);
window.addEventListener('pagehide', lockAdmin);
window.addEventListener('pageshow', (e) => {
  if (e.persisted || !adminToken) {
    lockAdmin();
  }
});

// Authentication Handling — Verified against Cloudflare D1 Server Database
function initAuth() {
  const authForm = document.getElementById('auth-form');
  const pinInput = document.getElementById('admin-pin-input');
  const errMsg = document.getElementById('auth-err-msg');

  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const enteredPin = pinInput ? pinInput.value.trim() : '';
      if (!enteredPin) return;

      try {
        const res = await fetch('/api/admin/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: enteredPin }),
        });
        const data = await res.json();

        if (res.ok && data.ok) {
          adminToken = enteredPin;
          unlockAdmin();
          await loadAll();
        } else {
          if (errMsg) {
            errMsg.textContent = data.error || 'Incorrect PIN. Please try again.';
            errMsg.style.display = 'block';
          }
          if (pinInput) {
            pinInput.value = '';
            pinInput.focus();
          }
        }
      } catch (err) {
        if (errMsg) {
          errMsg.textContent = 'Server connection error. Please try again.';
          errMsg.style.display = 'block';
        }
        if (pinInput) {
          pinInput.value = '';
          pinInput.focus();
        }
      }
    });
  }
}

// Load all data from Cloudflare D1
async function loadAll() {
  try {
    await populateProfileForm();
    await populatePortfolioList();
    await populatePricingForm();
  } catch (err) {
    console.error('Error loading admin data:', err);
    showToast('Notice: ' + err.message);
  }
}

// Populate and Save Profile Form
async function populateProfileForm() {
  let prof = {};
  try {
    prof = await apiJson('/api/business');
  } catch (e) {
    console.warn('Could not fetch business info:', e);
  }

  document.getElementById('prof-agency-name').value = prof.agency_name || 'GrowthMachine Studio';
  document.getElementById('prof-email').value = prof.email || '';
  document.getElementById('prof-phone').value = prof.phone || '';
  document.getElementById('prof-whatsapp').value = prof.whatsapp || '';
  document.getElementById('prof-tagline').value = prof.tagline || '';
  document.getElementById('prof-subheadline').value = prof.subheadline || '';
  document.getElementById('prof-location').value = prof.location || '';
  
  // Set current PIN from session token
  const pinField = document.getElementById('prof-pin');
  if (pinField) {
    pinField.value = adminToken || '';
  }

  // Cache pricing plans in memory for the profile save payload
  if (prof.pricing_plans && Array.isArray(prof.pricing_plans)) {
    window.__pricingPlans = prof.pricing_plans;
  }

  const form = document.getElementById('profile-form');
  if (form && form.dataset.listener !== '1') {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPin = (document.getElementById('prof-pin').value || '').trim();
      if (!newPin) {
        alert('Admin Security PIN cannot be empty.');
        return;
      }

      const payload = {
        agency_name: document.getElementById('prof-agency-name').value.trim(),
        email: document.getElementById('prof-email').value.trim(),
        phone: document.getElementById('prof-phone').value.trim(),
        whatsapp: document.getElementById('prof-whatsapp').value.trim().replace(/[^0-9]/g, ''),
        tagline: document.getElementById('prof-tagline').value.trim(),
        subheadline: document.getElementById('prof-subheadline').value.trim(),
        location: document.getElementById('prof-location').value.trim(),
        pricing_plans: window.__pricingPlans || [],
        admin_pin: newPin,
      };

      try {
        await apiJson('/api/admin/business', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        // Update in-memory session token to the new PIN
        adminToken = newPin;

        // Keep local store in sync if present
        if (typeof DataStore !== 'undefined') {
          const local = DataStore.get();
          local.siteProfile = {
            agencyName: payload.agency_name,
            email: payload.email,
            phone: payload.phone,
            whatsapp: payload.whatsapp,
            tagline: payload.tagline,
            subheadline: payload.subheadline,
            location: payload.location,
            adminPin: newPin,
          };
          DataStore.save(local);
        }

        showToast('Business Profile and Admin PIN permanently saved to Cloudflare database!');
      } catch (err) {
        showToast('Failed to save profile: ' + err.message);
      }
    });
    form.dataset.listener = '1';
  }
}

// Portfolio Projects Management
async function populatePortfolioList() {
  const listEl = document.getElementById('admin-portfolio-list');
  if (!listEl) return;

  try {
    const projects = await apiJson('/api/listings');
    currentListings = Array.isArray(projects) ? projects : [];
  } catch (e) {
    console.warn('Could not fetch listings:', e);
    currentListings = [];
  }

  if (currentListings.length === 0) {
    listEl.innerHTML = `<p style="color: var(--text-dim); font-size: 14px;">No projects added yet. Click "+ Add New Client Project" to showcase your first client.</p>`;
    return;
  }

  listEl.innerHTML = currentListings.map((p) => `
    <div class="portfolio-manage-item">
      <img src="${escapeHTML(p.image || '')}" alt="${escapeHTML(p.title || '')}" class="portfolio-manage-thumb" onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'120\\' height=\\'80\\' viewBox=\\'0 0 120 80\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%23181b24\\'/><text x=\\'50%\\' y=\\'50%\\' fill=\\'%23ffaa00\\' font-family=\\'sans-serif\\' font-size=\\'11\\' text-anchor=\\'middle\\' dominant-baseline=\\'middle\\'>No Image</text></svg>';">
      <div class="portfolio-manage-info">
        <h4>${escapeHTML(p.title || '')}</h4>
        <div style="font-size: 13px; color: #ffaa00; margin-bottom: 4px;">Client: ${escapeHTML(p.client || '')} • <span style="color: var(--text-dim);">${escapeHTML(p.category || '')}</span></div>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">${escapeHTML(p.description || p.desc || '')}</p>
        <div>
          <a href="${escapeHTML(p.url || '')}" target="_blank" style="font-size: 12px; color: var(--text-main); text-decoration: underline;">
            🔗 ${escapeHTML(p.url || '')}
          </a>
        </div>
      </div>
      <div class="portfolio-manage-actions">
        <button type="button" class="btn btn-outline btn-sm" onclick="editPortfolioItem('${escapeJS(p.id)}')" style="padding: 6px 14px; font-size: 12px; color: #ffaa00; border-color: rgba(255, 170, 0, 0.4);">✏️ Edit</button>
        <button type="button" class="btn-danger" onclick="deletePortfolioItem('${escapeJS(p.id)}')">Delete</button>
      </div>
    </div>
  `).join('');
}

// Edit Portfolio Item
window.editPortfolioItem = function (id) {
  const p = currentListings.find((item) => String(item.id) === String(id));
  if (!p) {
    alert('Project not found');
    return;
  }

  const addBox = document.getElementById('add-project-box');
  const titleHeader = document.getElementById('project-form-title');
  const submitText = document.getElementById('proj-submit-text');
  const editIdInput = document.getElementById('proj-edit-id');

  if (titleHeader) titleHeader.textContent = '✏️ Edit Project: ' + (p.title || '');
  if (submitText) submitText.textContent = '💾 Save Project Changes';
  if (editIdInput) editIdInput.value = p.id;

  document.getElementById('proj-title').value = p.title || '';
  document.getElementById('proj-client').value = p.client || '';
  document.getElementById('proj-url').value = p.url || '';
  document.getElementById('proj-desc').value = p.description || p.desc || '';
  
  const tagsArr = Array.isArray(p.tags) ? p.tags : [];
  document.getElementById('proj-tags').value = tagsArr.join(', ');

  // Category handling
  const catSelect = document.getElementById('proj-category');
  const catCustom = document.getElementById('proj-category-custom');
  if (catSelect) {
    let matched = false;
    for (let i = 0; i < catSelect.options.length; i++) {
      if (catSelect.options[i].value === p.category) {
        catSelect.selectedIndex = i;
        matched = true;
        break;
      }
    }

    if (matched) {
      if (catCustom) {
        catCustom.style.display = 'none';
        catCustom.value = '';
      }
    } else {
      catSelect.value = '__custom__';
      if (catCustom) {
        catCustom.style.display = 'block';
        catCustom.value = p.category || '';
      }
    }
  }

  // Preview Image handling
  if (p.image) {
    if (typeof window.setProjectImage === 'function') {
      window.setProjectImage(p.image, 'Current Project Screenshot', 'Ready to update or keep current');
    }
    const urlInput = document.getElementById('proj-image-url-input');
    if (urlInput && !p.image.startsWith('data:')) {
      urlInput.value = p.image;
    }
  }

  if (addBox) {
    addBox.style.display = 'block';
    addBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('proj-title').focus();
  }
};

// Delete Portfolio Item
window.deletePortfolioItem = async function (id) {
  if (!confirm('Are you sure you want to remove this project from your portfolio?')) return;
  try {
    await apiRequest(`/api/admin/listings/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showToast('Project removed successfully from Cloudflare database.');
    await populatePortfolioList();
  } catch (err) {
    showToast('Failed to delete: ' + err.message);
  }
};

function bindEvents() {
  const toggleBtn = document.getElementById('toggle-add-project-btn');
  const cancelBtn = document.getElementById('cancel-add-project');
  const addBox = document.getElementById('add-project-box');

  // Category custom handler
  const catSelect = document.getElementById('proj-category');
  const catCustom = document.getElementById('proj-category-custom');
  if (catSelect && catCustom) {
    catSelect.addEventListener('change', () => {
      if (catSelect.value === '__custom__') {
        catCustom.style.display = 'block';
        catCustom.focus();
        catCustom.setAttribute('required', 'required');
      } else {
        catCustom.style.display = 'none';
        catCustom.removeAttribute('required');
        catCustom.value = '';
      }
    });
  }

  // Image Upload / URL Controls
  const tabUpload = document.getElementById('img-tab-upload');
  const tabUrl = document.getElementById('img-tab-url');
  const panelUpload = document.getElementById('img-panel-upload');
  const panelUrl = document.getElementById('img-panel-url');
  const fileInput = document.getElementById('proj-image-file');
  const dropzone = document.getElementById('img-dropzone');
  const urlInput = document.getElementById('proj-image-url-input');
  const hiddenImageInput = document.getElementById('proj-image');
  const previewCard = document.getElementById('img-preview-card');
  const previewThumb = document.getElementById('img-preview-thumb');
  const previewName = document.getElementById('img-preview-name');
  const previewMeta = document.getElementById('img-preview-meta');
  const removeBtn = document.getElementById('img-remove-btn');

  function setImage(src, nameText, metaText) {
    if (!src) return;
    if (hiddenImageInput) hiddenImageInput.value = src;
    if (previewThumb) previewThumb.src = src;
    if (previewName) previewName.textContent = nameText || 'Image Selected';
    if (previewMeta) previewMeta.textContent = metaText || '✓ Ready to Publish';
    if (previewCard) previewCard.style.display = 'flex';
  }

  function clearImage() {
    if (hiddenImageInput) hiddenImageInput.value = '';
    if (fileInput) fileInput.value = '';
    if (urlInput) urlInput.value = '';
    if (previewThumb) previewThumb.src = '';
    if (previewCard) previewCard.style.display = 'none';
  }

  window.setProjectImage = setImage;
  window.clearProjectImage = clearImage;

  // Optimize & resize image file to keep payload fast and snappy
  function handleImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      alert('Please select a valid image file (JPG, PNG, WebP, SVG, GIF, etc.).');
      return;
    }

    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImage(e.target.result, file.name, `SVG Vector • ${(file.size / 1024).toFixed(1)} KB`);
      };
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1200;
        const maxH = 900;
        let w = img.width;
        let h = img.height;

        if (w > maxW || h > maxH) {
          if (w / h > maxW / maxH) {
            h = Math.round((h * maxW) / w);
            w = maxW;
          } else {
            w = Math.round((w * maxH) / h);
            h = maxH;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const approxKb = Math.round((compressedDataUrl.length * 3) / 4 / 1024);
        setImage(compressedDataUrl, file.name, `${w}×${h}px • ~${approxKb} KB`);
      };
      img.onerror = () => {
        setImage(e.target.result, file.name, `${(file.size / 1024).toFixed(1)} KB`);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  if (tabUpload && tabUrl && panelUpload && panelUrl) {
    tabUpload.addEventListener('click', () => {
      tabUpload.classList.add('active');
      tabUrl.classList.remove('active');
      panelUpload.style.display = 'block';
      panelUrl.style.display = 'none';
    });

    tabUrl.addEventListener('click', () => {
      tabUrl.classList.add('active');
      tabUpload.classList.remove('active');
      panelUrl.style.display = 'block';
      panelUpload.style.display = 'none';
      if (urlInput) urlInput.focus();
    });
  }

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleImageFile(e.target.files[0]);
      }
    });

    ['dragenter', 'dragover'].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleImageFile(e.dataTransfer.files[0]);
      }
    });
  }

  if (urlInput) {
    urlInput.addEventListener('input', () => {
      const val = urlInput.value.trim();
      if (val) {
        setImage(val, 'Web Image URL', val.length > 40 ? val.slice(0, 37) + '...' : val);
      } else {
        clearImage();
      }
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', clearImage);
  }

  function resetProjectForm() {
    const newProjectForm = document.getElementById('new-project-form');
    if (newProjectForm) newProjectForm.reset();
    clearImage();
    const editIdInput = document.getElementById('proj-edit-id');
    if (editIdInput) editIdInput.value = '';
    const titleHeader = document.getElementById('project-form-title');
    const submitText = document.getElementById('proj-submit-text');
    if (titleHeader) titleHeader.textContent = 'Add New Live Project';
    if (submitText) submitText.textContent = '✓ Add & Publish Project';
    if (catCustom) {
      catCustom.style.display = 'none';
      catCustom.value = '';
    }
  }

  if (toggleBtn && addBox) {
    toggleBtn.addEventListener('click', () => {
      const isOpening = addBox.style.display === 'none';
      if (isOpening) {
        resetProjectForm();
        addBox.style.display = 'block';
        document.getElementById('proj-title').focus();
      } else {
        addBox.style.display = 'none';
      }
    });
  }

  if (cancelBtn && addBox) {
    cancelBtn.addEventListener('click', () => {
      addBox.style.display = 'none';
      resetProjectForm();
    });
  }

  // Handle New or Edited Project Submission
  const newProjectForm = document.getElementById('new-project-form');
  if (newProjectForm && newProjectForm.dataset.listener !== '1') {
    newProjectForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('proj-title').value.trim();
      const client = document.getElementById('proj-client').value.trim();

      let category = document.getElementById('proj-category').value;
      if (category === '__custom__') {
        const customCatVal = (document.getElementById('proj-category-custom').value || '').trim();
        category = customCatVal || 'Custom Project';
      }

      const url = document.getElementById('proj-url').value.trim();
      const image = (document.getElementById('proj-image').value || '').trim();

      if (!image) {
        alert('Please provide a preview image: upload an image file or paste an image URL.');
        return;
      }

      const desc = document.getElementById('proj-desc').value.trim();
      const rawTags = document.getElementById('proj-tags').value.trim();
      const tags = rawTags ? rawTags.split(',').map((t) => t.trim()).filter(Boolean) : ['Live Website'];

      const editId = (document.getElementById('proj-edit-id').value || '').trim();

      const payload = {
        title,
        client,
        category,
        url,
        image,
        description: desc,
        tags,
      };

      try {
        if (editId) {
          // Update existing project in D1
          await apiJson(`/api/admin/listings/${encodeURIComponent(editId)}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
          showToast('Project updated successfully in Cloudflare database!');
        } else {
          // Add new project in D1
          await apiJson('/api/admin/listings', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
          showToast('New project published to live showcase!');
        }

        resetProjectForm();
        addBox.style.display = 'none';
        await populatePortfolioList();
      } catch (err) {
        showToast('Error saving project: ' + err.message);
      }
    });
    newProjectForm.dataset.listener = '1';
  }
}

// Pricing Form Manager
async function populatePricingForm() {
  const container = document.getElementById('pricing-fields-container');
  if (!container) return;

  let prof = {};
  try {
    prof = await apiJson('/api/business');
  } catch (e) {
    console.warn('Could not load pricing plans:', e);
  }

  const plans = (prof && Array.isArray(prof.pricing_plans) && prof.pricing_plans.length > 0)
    ? prof.pricing_plans
    : [
        {
          id: 'starter',
          name: 'Starter Landing Page',
          price: '₹2,999',
          desc: 'Ideal for local businesses, ad campaigns, and single-service lead funnels.',
        },
        {
          id: 'business',
          name: 'Complete Business Suite',
          price: '₹6,499',
          desc: 'Full multi-section website for law chambers, clinics, real estate, and agencies.',
        },
        {
          id: 'ecommerce',
          name: 'Catalog / D2C Store',
          price: '₹11,999',
          desc: 'Tailored for beauty products, clothing, and retail catalog businesses.',
        },
      ];

  window.__pricingPlans = plans;

  container.innerHTML = plans.map((plan, idx) => `
    <div class="form-group" style="background: var(--bg-card); padding: 16px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
      <label style="color: #ffaa00; margin-bottom: 8px;">${escapeHTML(plan.name || `Plan ${idx + 1}`)}</label>
      <div style="margin-bottom: 8px;">
        <label style="font-size: 11px;">Package Price</label>
        <input type="text" id="plan-price-${idx}" value="${escapeHTML(plan.price || '')}" placeholder="₹3,999" required>
      </div>
      <div>
        <label style="font-size: 11px;">Brief Description</label>
        <input type="text" id="plan-desc-${idx}" value="${escapeHTML(plan.desc || '')}" required>
      </div>
    </div>
  `).join('');

  const pricingForm = document.getElementById('pricing-form');
  if (pricingForm && pricingForm.dataset.listener !== '1') {
    pricingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const updatedPlans = (window.__pricingPlans || []).map((plan, idx) => {
        const priceInput = document.getElementById(`plan-price-${idx}`);
        const descInput = document.getElementById(`plan-desc-${idx}`);
        return {
          ...plan,
          price: priceInput ? priceInput.value.trim() : plan.price,
          desc: descInput ? descInput.value.trim() : plan.desc,
        };
      });

      window.__pricingPlans = updatedPlans;

      try {
        await apiJson('/api/admin/business', {
          method: 'POST',
          body: JSON.stringify({ pricing_plans: updatedPlans }),
        });
        showToast('Pricing plans updated successfully in Cloudflare database!');
      } catch (err) {
        showToast('Failed to save pricing: ' + err.message);
      }
    });
    pricingForm.dataset.listener = '1';
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

function escapeJS(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
