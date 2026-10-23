export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (url.hostname === 'growthmachinestudio.com' && (request.method === 'GET' || request.method === 'HEAD')) {
      url.hostname = 'www.growthmachinestudio.com';
      return Response.redirect(url.toString(), 301);
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // Public read endpoints - no auth required
    if (path === '/api/business' && request.method === 'GET') {
      return handleGetBusiness(env);
    }
    if (path === '/api/listings' && request.method === 'GET') {
      return handleGetListings(env);
    }
    const listingMatch = path.match(/^\/api\/listings\/([^/]+)$/);
    if (listingMatch && request.method === 'GET') {
      return handleGetListing(env, listingMatch[1]);
    }
    if (path === '/api/admin/auth' && request.method === 'POST') {
      return handleAuth(request, env);
    }

    if (path.startsWith('/api/admin/')) {
      const authorized = await checkAuth(request, env);
      if (!authorized) {
        return json({ error: 'Unauthorized' }, 401);
      }

      if (path === '/api/admin/business' && request.method === 'POST') {
        return handleUpdateBusiness(request, env);
      }
      if (path === '/api/admin/listings' && request.method === 'POST') {
        return handleCreateListing(request, env);
      }
      const listingUpdateMatch = path.match(/^\/api\/admin\/listings\/([^/]+)$/);
      if (listingUpdateMatch && request.method === 'PUT') {
        return handleUpdateListing(request, env, listingUpdateMatch[1]);
      }
      if (listingUpdateMatch && request.method === 'DELETE') {
        return handleDeleteListing(env, listingUpdateMatch[1]);
      }
      return json({ error: 'Not found' }, 404);
    }

    if (path.startsWith('/api/')) {
      return json({ error: 'Not found' }, 404);
    }

    if (path === '/launch' || path.startsWith('/launch/')) {
      return new Response('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>404 - Page Not Found</title><style>body{background:#0a0b0e;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}.box{max-width:480px;padding:40px}h1{font-size:4rem;margin:0 0 10px;color:#ffaa00}p{color:#94a3b8;font-size:1.1rem;margin-bottom:24px}a{color:#ff6a13;text-decoration:none;font-weight:600}a:hover{text-decoration:underline}</style></head><body><div class="box"><h1>404</h1><p>This page has been removed.</p><a href="/">← Return to GrowthMachine Studio</a></div></body></html>', {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return env.ASSETS.fetch(request);
  },
};

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...extra,
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(extraHeaders),
    },
  });
}

async function getStoredPin(env) {
  try {
    const { results } = await env.DB
      .prepare('SELECT admin_pin FROM business_info WHERE id = 1')
      .all();
    if (results && results[0] && results[0].admin_pin) {
      return String(results[0].admin_pin).trim();
    }
  } catch (err) {
    console.error('Error reading admin_pin from D1:', err);
  }
  return String(env.ADMIN_PASSWORD || '19882020').trim();
}

async function checkAuth(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth) return false;
  const token = auth.replace(/^Bearer\s/i, '').trim();
  const validPin = await getStoredPin(env);
  return constantTimeEqual(token, validPin);
}

function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return difference === 0 && rightBytes.length > 0;
}

async function handleGetBusiness(env) {
  const { results } = await env.DB
    .prepare('SELECT * FROM business_info WHERE id = 1')
    .all();
  const row = results[0];
  if (!row) return json({});
  if (row.pricing_plans) {
    try {
      row.pricing_plans = JSON.parse(row.pricing_plans);
    } catch (e) {
      row.pricing_plans = [];
    }
  }
  delete row.updated_at;
  delete row.admin_pin; // Never leak admin PIN in public API
  return json(row);
}

async function handleGetListings(env) {
  const { results } = await env.DB
    .prepare('SELECT * FROM listings ORDER BY created_at DESC')
    .all();
  results.forEach((r) => {
    if (r.tags) {
      try {
        r.tags = JSON.parse(r.tags);
      } catch (e) {
        r.tags = [];
      }
    }
  });
  return json(results);
}

async function handleGetListing(env, id) {
  const { results } = await env.DB
    .prepare('SELECT * FROM listings WHERE id = ?')
    .bind(id)
    .all();
  const row = results[0];
  if (!row) return json({ error: 'Not found' }, 404);
  if (row.tags) {
    try {
      row.tags = JSON.parse(row.tags);
    } catch (e) {
      row.tags = [];
    }
  }
  return json(row);
}

async function handleAuth(request, env) {
  let pin = '';
  try {
    const body = await request.json();
    pin = typeof body.pin === 'string' ? body.pin.trim() : '';
  } catch {
    return json({ ok: false, error: 'Invalid request body' }, 400);
  }
  const validPin = await getStoredPin(env);
  const ok = constantTimeEqual(pin, validPin);
  if (ok) return json({ ok: true, pin });
  return json({ ok: false, error: 'Invalid credentials' }, 401);
}

async function handleUpdateBusiness(request, env) {
  const body = await request.json();
  const {
    agency_name,
    email,
    phone,
    whatsapp,
    tagline,
    subheadline,
    location,
    pricing_plans,
    admin_pin,
  } = body;

  await env.DB
    .prepare(
      `INSERT INTO business_info (id, agency_name, email, phone, whatsapp, tagline, subheadline, location, pricing_plans, admin_pin, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         agency_name = COALESCE(excluded.agency_name, business_info.agency_name),
         email = COALESCE(excluded.email, business_info.email),
         phone = COALESCE(excluded.phone, business_info.phone),
         whatsapp = COALESCE(excluded.whatsapp, business_info.whatsapp),
         tagline = COALESCE(excluded.tagline, business_info.tagline),
         subheadline = COALESCE(excluded.subheadline, business_info.subheadline),
         location = COALESCE(excluded.location, business_info.location),
         pricing_plans = COALESCE(excluded.pricing_plans, business_info.pricing_plans),
         admin_pin = COALESCE(excluded.admin_pin, business_info.admin_pin),
         updated_at = CURRENT_TIMESTAMP`
    )
    .bind(
      agency_name || null,
      email || null,
      phone || null,
      whatsapp || null,
      tagline || null,
      subheadline || null,
      location || null,
      pricing_plans ? JSON.stringify(pricing_plans) : null,
      admin_pin ? String(admin_pin).trim() : null
    )
    .run();

  return json({ ok: true });
}

async function handleCreateListing(request, env) {
  const body = await request.json();
  const id = body.id || `listing-${Date.now()}`;
  const {
    title,
    client,
    category,
    url,
    image,
    description,
    tags,
  } = body;
  const imageUrl = validateImageUrl(image);
  if (!imageUrl.ok) return json({ error: 'Image must be a valid image URL or uploaded image' }, 400);

  await env.DB
    .prepare(
      `INSERT INTO listings (id, title, client, category, url, image, description, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    )
    .bind(id, title, client || null, category || null, url || null, imageUrl.value, description || null, tags ? JSON.stringify(tags) : null)
    .run();

  return json({ ok: true, id });
}

async function handleUpdateListing(request, env, id) {
  const body = await request.json();
  const { title, client, category, url, image, description, tags } = body;
  const imageUrl = validateImageUrl(image);
  if (!imageUrl.ok) return json({ error: 'Image must be a valid image URL or uploaded image' }, 400);

  const { results } = await env.DB
    .prepare('SELECT id FROM listings WHERE id = ?')
    .bind(id)
    .all();
  if (!results.length) return json({ error: 'Not found' }, 404);

  await env.DB
    .prepare(
      `UPDATE listings SET
         title = COALESCE(?, title),
         client = COALESCE(?, client),
         category = COALESCE(?, category),
         url = COALESCE(?, url),
         image = COALESCE(?, image),
         description = COALESCE(?, description),
         tags = COALESCE(?, tags),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .bind(
      title ?? null,
      client ?? null,
      category ?? null,
      url ?? null,
      image === undefined ? null : imageUrl.value,
      description ?? null,
      tags ? JSON.stringify(tags) : null,
      id
    )
    .run();

  return json({ ok: true, id });
}

async function handleDeleteListing(env, id) {
  const { results } = await env.DB
    .prepare('SELECT id FROM listings WHERE id = ?')
    .bind(id)
    .all();
  if (!results.length) return json({ error: 'Not found' }, 404);

  await env.DB.prepare('DELETE FROM listings WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

function validateImageUrl(value) {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: null };
  }
  if (typeof value !== 'string') return { ok: false, value: null };

  const trimmed = value.trim();
  // Support Base64 data URLs (uploaded file images)
  if (trimmed.startsWith('data:image/')) {
    return { ok: true, value: trimmed };
  }
  // Support relative paths
  if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('assets/') || trimmed.startsWith('images/')) {
    return { ok: true, value: trimmed };
  }

  try {
    const parsed = new URL(trimmed);
    if ((parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.hostname && !parsed.username && !parsed.password) {
      return { ok: true, value: parsed.href };
    }
    return { ok: false, value: null };
  } catch {
    if (trimmed.length > 0 && trimmed.length < 5000000) {
      return { ok: true, value: trimmed };
    }
    return { ok: false, value: null };
  }
}
