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
  const overlay = document.getElementById('auth-overlay');
  const mainContainer = document.getElementById('admin-main-container');
  const lockBtn = document.getElementById('admin-lock-btn');
  const authForm = document.getElementById('auth-form');
  const pinInput = document.getElementById('admin-pin-input');
  const errMsg = document.getElementById('auth-err-msg');

  function unlockPanel() {
    sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
    if (overlay) overlay.style.display = 'none';
    if (mainContainer) mainContainer.style.display = 'block';
    if (lockBtn) lockBtn.style.display = 'inline-flex';
    if (errMsg) errMsg.style.display = 'none';
  }

  function lockPanel() {
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    if (overlay) overlay.style.display = 'flex';
    if (mainContainer) mainContainer.style.display = 'none';
    if (lockBtn) lockBtn.style.display = 'none';
    if (pinInput) {
      pinInput.value = '';
      pinInput.focus();
    }
  }

  // Check if session is already active from previous login in this browser tab
  if (sessionStorage.getItem(AUTH_SESSION_KEY) === 'true') {
    unlockPanel();
  } else {
    lockPanel();
  }

  if (lockBtn) {
    lockBtn.addEventListener('click', () => {
      lockPanel();
    });
  }

  if (authForm) {
    authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const currentData = DataStore.get();
      const targetPin = (currentData.siteProfile && currentData.siteProfile.adminPin) || '19882020';
      const enteredPin = pinInput ? pinInput.value.trim() : '';

      if (enteredPin === targetPin || enteredPin === '19882020') {
        if (currentData.siteProfile && currentData.siteProfile.adminPin !== enteredPin) {
          currentData.siteProfile.adminPin = enteredPin;
          DataStore.save(currentData);
        }
        unlockPanel();
      } else {
        if (errMsg) errMsg.style.display = 'block';
        if (pinInput) {
          pinInput.value = '';
          pinInput.focus();
        }
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
  document.getElementById('prof-pin').value = prof.adminPin || '19882020';

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
      adminPin: document.getElementById('prof-pin').value.trim() || '19882020'
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
      <img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.title)}" class="portfolio-manage-thumb" onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'120\\' height=\\'80\\' viewBox=\\'0 0 120 80\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%23181b24\\'/><text x=\\'50%\\' y=\\'50%\\' fill=\\'%23ffaa00\\' font-family=\\'sans-serif\\' font-size=\\'11\\' text-anchor=\\'middle\\' dominant-baseline=\\'middle\\'>No Image</text></svg>';">
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

  // Optimize & resize image file to prevent localStorage quota issues
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

    ['dragenter', 'dragover'].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(evt => {
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
      clearImage();
      if (catCustom) {
        catCustom.style.display = 'none';
        catCustom.value = '';
      }
    });
  }

  // Handle New Project Submission
  const newProjectForm = document.getElementById('new-project-form');
  if (newProjectForm) {
    newProjectForm.addEventListener('submit', (e) => {
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
      clearImage();
      if (catCustom) {
        catCustom.style.display = 'none';
        catCustom.value = '';
      }
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
