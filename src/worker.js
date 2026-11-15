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

    // Public AI Chatbot endpoint
    if (path === '/api/chat' && request.method === 'POST') {
      return handleChat(request, env);
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

      // Admin Leads management endpoints
      if (path === '/api/admin/leads' && request.method === 'GET') {
        return handleGetLeads(env);
      }
      const leadDeleteMatch = path.match(/^\/api\/admin\/leads\/(\d+)$/);
      if (leadDeleteMatch && request.method === 'DELETE') {
        return handleDeleteLead(env, leadDeleteMatch[1]);
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

// ============================================================================
// AI Chatbot & Lead Automation Engine
// ============================================================================

const SYSTEM_PROMPT = `You are "MachineBot", the friendly and expert AI Growth Consultant for GrowthMachine Studio (growthmachinestudio.com).
Your mission is to provide helpful, rapid, and trustworthy guidance to business owners seeking high-converting websites and digital growth.

STUDIO PACKAGES & PRICING:
1. Starter Landing Page: ₹2,999 (one-time). Conversion-focused single page, mobile responsive, WhatsApp/call CTAs, enquiry capture. Delivered in 24-48 hrs.
2. Complete Business Suite: ₹6,499 (one-time). Up to 5 custom sections/pages, tailored copywriting, portfolio, SEO structure, in-house admin portal. Best seller for clinics, advocates, consultants, real estate.
3. Catalog / D2C Store: ₹11,999 (one-time). Up to 10 pages, product catalogue showcase, category filters, direct WhatsApp ordering.
4. Custom Web Platform: ₹19,999+. Advanced custom web apps, specialized integrations.
5. Enterprise Cloud Setup: ₹999 one-time (SSL, global CDN, zero separate server fee architecture).
6. Ongoing Cloud Maintenance: Basic ₹499/mo | Business ₹999/mo | Enterprise ₹1,999/mo.

STUDIO ADVANTAGES:
- 24 to 72 hours rapid delivery.
- Clients own 100% of domain, code, and files. No vendor lock-in.
- Next-Gen global edge cloud hosting with 99.9% uptime and sub-second speed (<0.8s).
- Direct WhatsApp communication and free live mockups.

COMMUNICATION STYLE:
- Warm, professional, concise, and conversion-focused.
- Highlight package prices transparently when asked.
- In every conversation, gently encourage the visitor to share their business name, what type of website they need, their phone number or WhatsApp, or their email so the studio director can provide a custom quote or free mockup.
- If they provide contact info, thank them warmly and confirm our team will reach out within 24 hours.

CONTACT:
Email: studio.growthmachine@gmail.com
Studio Location: Vishnu Garden, West Delhi 110018, India (Serving clients worldwide).`;

async function handleChat(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { message, session_id } = body;
  if (!message || typeof message !== 'string' || !message.trim()) {
    return json({ error: 'Message is required' }, 400);
  }

  const cleanMessage = message.trim().slice(0, 2000);
  const sessionId = typeof session_id === 'string' && session_id.trim()
    ? session_id.trim().slice(0, 100)
    : 'sess_' + Date.now();

  try {
    // 1. Ensure chat session exists
    await env.DB.prepare(
      `INSERT INTO chat_sessions (id, last_active) VALUES (?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET last_active = CURRENT_TIMESTAMP`
    ).bind(sessionId).run();

    // 2. Save user message
    await env.DB.prepare(
      `INSERT INTO chat_messages (session_id, role, content) VALUES (?, 'user', ?)`
    ).bind(sessionId, cleanMessage).run();

    // 3. Fetch recent history for context
    const historyRes = await env.DB.prepare(
      `SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY id ASC LIMIT 16`
    ).bind(sessionId).all();

    const conversationHistory = (historyRes.results || []).map(row => ({
      role: row.role,
      content: row.content,
    }));

    // 4. Call OpenRouter API
    let botReply = '';
    const openRouterKey = env.OPENROUTER_API_KEY;

    if (openRouterKey) {
      try {
        const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://www.growthmachinestudio.com',
            'X-Title': 'GrowthMachine Studio AI Chat',
          },
          body: JSON.stringify({
            model: 'meta-llama/llama-3.3-70b-instruct:free',
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              ...conversationHistory,
            ],
            max_tokens: 450,
            temperature: 0.7,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          if (aiData.choices && aiData.choices[0] && aiData.choices[0].message) {
            botReply = aiData.choices[0].message.content.trim();
          }
        } else {
          console.error('OpenRouter error status:', aiResponse.status);
          // Fallback to fast secondary free model
          const fallbackResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openRouterKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.0-flash-exp:free',
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...conversationHistory,
              ],
              max_tokens: 400,
            }),
          });
          if (fallbackResp.ok) {
            const fallbackData = await fallbackResp.json();
            if (fallbackData.choices && fallbackData.choices[0]) {
              botReply = fallbackData.choices[0].message.content.trim();
            }
          }
        }
      } catch (aiErr) {
        console.error('OpenRouter fetch failed:', aiErr);
      }
    }

    // High quality intelligent fallback if OpenRouter key is not set or network fails
    if (!botReply) {
      botReply = generateIntelligentFallback(cleanMessage);
    }

    // 5. Save assistant reply
    await env.DB.prepare(
      `INSERT INTO chat_messages (session_id, role, content) VALUES (?, 'assistant', ?)`
    ).bind(sessionId, botReply).run();

    // 6. Lead extraction & automated alerts
    const lead = extractLeadInfo(cleanMessage, conversationHistory);
    if (lead.hasLead) {
      try {
        await env.DB.prepare(
          `INSERT INTO leads (session_id, name, phone, email, service, budget, message)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          sessionId,
          lead.name || null,
          lead.phone || null,
          lead.email || null,
          lead.service || null,
          lead.budget || null,
          cleanMessage
        ).run();

        // Send instant Telegram alert (non-blocking)
        await sendTelegramAlert(env, lead, cleanMessage);
      } catch (leadDbErr) {
        console.error('Failed to save or alert lead:', leadDbErr);
      }
    }

    return json({
      reply: botReply,
      session_id: sessionId,
      lead_detected: lead.hasLead,
    });
  } catch (err) {
    console.error('handleChat error:', err);
    return json({
      reply: 'Thanks for reaching out! We are ready to help build your website. Would you like to share your project requirements or business details so our team can provide a free quote?',
      session_id: sessionId,
    }, 200);
  }
}

function extractLeadInfo(userMessage, history) {
  const combined = (history.map(h => h.content).join('\n') + '\n' + userMessage);

  // Phone match (Indian & International formats)
  const phoneMatch = combined.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b[6-9]\d{9}\b/);
  
  // Email match
  const emailMatch = combined.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

  // Name match
  const nameMatch = userMessage.match(/(?:my name is|i am|i'm|this is|call me)\s+([a-zA-Z\s]{2,25})/i);

  // Service detection
  let detectedService = null;
  const msgLower = combined.toLowerCase();
  if (msgLower.includes('landing') || msgLower.includes('2999') || msgLower.includes('starter')) {
    detectedService = 'Starter Landing Page (₹2,999)';
  } else if (msgLower.includes('catalog') || msgLower.includes('ecommerce') || msgLower.includes('store') || msgLower.includes('11999')) {
    detectedService = 'Catalog / D2C Store (₹11,999)';
  } else if (msgLower.includes('business') || msgLower.includes('6499') || msgLower.includes('suite') || msgLower.includes('website')) {
    detectedService = 'Complete Business Suite (₹6,499)';
  } else if (msgLower.includes('seo') || msgLower.includes('maintenance') || msgLower.includes('hosting')) {
    detectedService = 'Cloud Care / SEO Growth';
  }

  // Budget detection
  const budgetMatch = combined.match(/(?:₹|rs\.?|inr|budget\s*(?:is|of)?)\s*([\d,]+)/i);

  const hasLead = Boolean(phoneMatch || emailMatch);

  return {
    hasLead,
    phone: phoneMatch ? phoneMatch[0].trim() : null,
    email: emailMatch ? emailMatch[0].trim() : null,
    name: nameMatch ? nameMatch[1].trim() : null,
    service: detectedService,
    budget: budgetMatch ? budgetMatch[1] : null,
  };
}

async function sendTelegramAlert(env, lead, originalMessage) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;

  const text = `🎯 *New Website Lead Captured!*\n\n` +
    `👤 *Name:* ${lead.name || 'Not provided'}\n` +
    `📞 *Phone:* ${lead.phone || 'Not provided'}\n` +
    `✉️ *Email:* ${lead.email || 'Not provided'}\n` +
    `🏷️ *Service:* ${lead.service || 'Website Project'}\n` +
    `💰 *Budget:* ${lead.budget ? '₹' + lead.budget : 'Standard'}\n` +
    `💬 *Recent Message:* _${originalMessage.replace(/([_*[\]()~`>#+-=|{}.!])/g, '\\$1')}_\n\n` +
    `⚡ *Source:* GrowthMachine Studio AI Chatbot`;

  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: 'Markdown',
      }),
    });
  } catch (err) {
    console.error('Telegram notification error:', err);
  }
}

function generateIntelligentFallback(msg) {
  const m = msg.toLowerCase();
  if (m.includes('price') || m.includes('cost') || m.includes('package') || m.includes('rate')) {
    return "Our packages are 100% transparent with zero hidden fees:\n\n• Starter Landing Page: ₹2,999 (1-page rapid launch)\n• Complete Business Suite: ₹6,499 (up to 5 pages, custom design)\n• Product Catalog / D2C: ₹11,999 (full product showcase)\n\nWhat kind of business or website are you planning to build?";
  }
  if (m.includes('portfolio') || m.includes('work') || m.includes('sample') || m.includes('example')) {
    return "We have built real client websites across healthcare, real estate, legal consulting, logistics, and D2C brands that load in under 0.8 seconds! Would you like a live demo tailored to your specific industry? What is your business name or sector?";
  }
  if (m.includes('time') || m.includes('duration') || m.includes('delivery') || m.includes('how long')) {
    return "We deliver fast! Standard landing pages and business suites are built, reviewed, and ready for launch in 24 to 72 hours. When are you looking to go live?";
  }
  return "Hello! I'm the GrowthMachine Studio assistant. We build high-converting, mobile-friendly business websites and landing pages starting from ₹2,999 with 48-hour delivery. Would you like to share what kind of website you're looking for?";
}

async function handleGetLeads(env) {
  try {
    const { results } = await env.DB.prepare(
      'SELECT * FROM leads ORDER BY created_at DESC LIMIT 100'
    ).all();
    return json(results || []);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

async function handleDeleteLead(env, id) {
  try {
    await env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(id).run();
    return json({ ok: true });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

