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

async function buildSystemPrompt(env) {
  let business = {};
  let listings = [];
  try {
    const bizRes = await env.DB.prepare('SELECT * FROM business_info WHERE id = 1').all();
    if (bizRes.results && bizRes.results[0]) {
      business = bizRes.results[0];
      if (business.pricing_plans) {
        try { business.pricing_plans = JSON.parse(business.pricing_plans); } catch { business.pricing_plans = []; }
      }
      delete business.admin_pin;
    }
  } catch (e) { console.error('Failed to load business info for chat:', e); }

  try {
    const listRes = await env.DB.prepare('SELECT title, client, category, url, description FROM listings ORDER BY created_at DESC LIMIT 10').all();
    listings = listRes.results || [];
  } catch (e) { console.error('Failed to load listings for chat:', e); }

  const agencyName = business.agency_name || 'GrowthMachine Studio';
  const email = business.email || 'studio.growthmachine@gmail.com';
  const phone = business.phone || '+91 75575 75514';
  const whatsapp = business.whatsapp || '917557575514';
  const tagline = business.tagline || 'High-Converting Websites & Growth Landing Pages';
  const location = business.location || 'Vishnu Garden, West Delhi 110018, India';

  let plansText = '';
  if (Array.isArray(business.pricing_plans) && business.pricing_plans.length > 0) {
    plansText = business.pricing_plans.map(p =>
      `• ${p.name} — ${p.price} (${p.period || 'one-time'}): ${p.desc || ''}\n  Features: ${(p.features || []).join(', ')}\n  Badge: ${p.badge || 'Standard'}${p.popular ? ' [POPULAR/BEST SELLER]' : ''}`
    ).join('\n\n');
  } else {
    plansText = `• Starter Landing Page — ₹2,999 (one-time)
• Complete Business Suite — ₹6,499 (one-time) [BEST SELLER]
• Catalog / D2C Store — ₹11,999 (one-time)`;
  }

  let portfolioText = '';
  if (listings.length > 0) {
    portfolioText = listings.map(l =>
      `• ${l.title} — Client: ${l.client || 'N/A'} | Category: ${l.category || 'N/A'} | ${l.url || ''}`
    ).join('\n');
  } else {
    portfolioText = `• Kanooni Salah — Advocate Asif Ali (Legal consultation website)
• BeautyBlushers — Luxury Bridal Makeup & Hair Studio (Booking platform)`;
  }

  return `You are "MachineBot", the expert AI Growth Consultant for ${agencyName}.

Your mission: Help visitors by answering questions thoroughly, qualifying their needs, and guiding them to the right package. You have LIVE access to the studio's current data — use it to give accurate, up-to-date answers.

LIVE BUSINESS PROFILE:
• Name: ${agencyName}
• Tagline: ${tagline}
• Email: ${email}
• Phone: ${phone}
• WhatsApp: ${whatsapp}
• Location: ${location}
• Service Area: Worldwide

CURRENT PACKAGES & PRICING:
${plansText}

CORE SERVICES:
• Landing Page Design: Conversion-focused pages for local services, campaigns, product launches.
• Business Website Development: Custom websites for advocates, clinics, consultants, real estate.
• E-commerce Catalog Websites: Product catalogues with WhatsApp purchase workflows.
• Website Launch Support: Domain, hosting, and launch setup guidance.

LIVE PORTFOLIO:
${portfolioText}

We serve: Healthcare, Legal, Beauty & Bridal, E-Commerce, Real Estate, Education, Fitness, Restaurants, CA & Finance, Corporate, Tech & SaaS, Logistics, Interior Design, Photography, Travel, Automobile, Personal Branding.

WHY CHOOSE US:
• Turnaround: 24-72 hours (vs 3-6 weeks for typical agencies)
• You own 100% of domain, code, and files. No vendor lock-in.
• Global edge CDN with sub-second loading
• Direct 1-click WhatsApp & call triggers
• Built-in admin portal to edit content anytime

FAQ:
Q: Will my website rank on Google?
A: No one can guarantee rankings. We build SEO-ready sites with clean structure and speed.
Q: Are domain and hosting included?
A: No — you purchase them in your own name. We guide you through setup.
Q: How long does delivery take?
A: 24-72 hours after scope is agreed.
Q: Can I update the website after launch?
A: Yes — admin portal lets you edit business details, portfolio, and pricing.
Q: Who owns the website?
A: You do. 100% yours after payment.

CONVERSATION & LEAD QUALIFICATION RULES:
Follow this natural flow:
1. GREET & UNDERSTAND: Ask what kind of business they have and what they need.
2. QUALIFY: Naturally ask about their business type, website type needed, number of pages, specific features, rough budget, and timeline. Ask 1-2 questions at a time, not all at once.
3. RECOMMEND: Based on answers, recommend the best-fit package:
   - Single service/campaign, tight budget → Starter Landing Page (₹2,999)
   - Professional business, multiple services → Complete Business Suite (₹6,499) [BEST SELLER]
   - Product-based business, needs catalog → Catalog/D2C Store (₹11,999)
4. COLLECT CONTACT: Ask for name, phone/WhatsApp, email so team can send custom quote. Confirm contact within 24 hours.
5. CLOSE: Thank them, confirm next steps, mention WhatsApp (${whatsapp}) or email (${email}).

STYLE: Be warm, conversational, helpful — NOT pushy. Ask one or two questions at a time. Keep responses 2-5 sentences typically. Always move the conversation forward.`;
}

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
              { role: 'system', content: await buildSystemPrompt(env) },
              ...conversationHistory,
            ],
            max_tokens: 800,
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
                { role: 'system', content: await buildSystemPrompt(env) },
                ...conversationHistory,
              ],
              max_tokens: 800,
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
  if (m.includes('price') || m.includes('cost') || m.includes('package') || m.includes('rate') || m.includes('plan')) {
    return "Our packages are 100% transparent:\n\n• Starter Landing Page: ₹2,999 (single-page launch)\n• Complete Business Suite: ₹6,499 (up to 5 pages) [BEST SELLER]\n• Product Catalog / D2C: ₹11,999 (full showcase)\n\nTo recommend the best fit, could you tell me what type of business you have and what you're looking for?";
  }
  if (m.includes('portfolio') || m.includes('work') || m.includes('sample') || m.includes('example') || m.includes('demo')) {
    return "We've built real client websites across healthcare, legal, beauty, and D2C — all loading in under 0.8 seconds! Would you like a live demo tailored to your industry? What's your business name or sector?";
  }
  if (m.includes('time') || m.includes('duration') || m.includes('delivery') || m.includes('how long') || m.includes('fast')) {
    return "We deliver fast! Landing pages and business suites are ready in 24 to 72 hours. When are you looking to go live?";
  }
  if (m.includes('domain') || m.includes('hosting')) {
    return "You buy your own domain and hosting directly in your own name — we guide you through setup step-by-step. You own everything, no agency markups. Want me to explain the process?";
  }
  if (m.includes('seo') || m.includes('google') || m.includes('rank')) {
    return "Every site we build is SEO-ready with clean structure and fast loading. No one can guarantee Google rankings though — that depends on competition and ongoing work. Would you like to know what's included?";
  }
  if (m.includes('own') || m.includes('ownership') || m.includes('lock')) {
    return "You own 100% of everything — domain, files, source code, accounts. No vendor lock-in. Once paid for, it's all yours. What kind of website are you planning?";
  }
  return "Hi! I'm the GrowthMachine Studio AI assistant. We build high-converting websites starting from ₹2,999 with 48-hour delivery.\n\nTo help you best:\n• What type of business do you have?\n• What kind of website do you need (landing page, business site, or catalog)?\n• What's your rough budget range?";
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

