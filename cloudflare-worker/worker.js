/**
 * Cloudflare Worker for GrowthMachine Studio
 * Universal Server-Side API with KV Storage
 * 
 * Provides real-time server-side synchronization across all devices:
 * - GET  / -> Returns latest content & active admin PIN
 * - POST / -> Saves updated content & admin PIN across all devices
 * - OPTIONS * -> CORS preflight
 */

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // GET: Fetch server-side content & password
    if (request.method === 'GET') {
      try {
        let content = null;
        if (env && env.GMS_KV) {
          content = await env.GMS_KV.get('gms_site_content', { type: 'json' });
        }
        return new Response(JSON.stringify(content || {}), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            ...corsHeaders
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // POST: Save content & password from any device
    if (request.method === 'POST') {
      try {
        const body = await request.json();
        if (!body || typeof body !== 'object') {
          return new Response(JSON.stringify({ success: false, error: 'Invalid JSON payload' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        if (env && env.GMS_KV) {
          await env.GMS_KV.put('gms_site_content', JSON.stringify(body));
        }

        return new Response(JSON.stringify({ success: true, message: 'Saved and synced universally to Cloudflare Edge!' }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
};
