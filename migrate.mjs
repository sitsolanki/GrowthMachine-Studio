import { readFile } from 'node:fs/promises'

const baseUrl = (process.env.WORKER_URL || 'https://growthmachine-studio.sitsolanki.workers.dev').replace(/\/+$/, '')
const password = process.env.ADMIN_PASSWORD

if (!password) {
  throw new Error('Set ADMIN_PASSWORD in this terminal before running the migration.')
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  const body = await response.json()
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed (${response.status}): ${body.error || 'Worker request failed'}`)
  }
  return body
}

await request('/api/admin/auth', {
  method: 'POST',
  body: JSON.stringify({ pin: password }),
})

const headers = { Authorization: `Bearer ${password}` }
const source = JSON.parse(await readFile(new URL('./data/content.json', import.meta.url), 'utf8'))
const profile = source.siteProfile || {}
const pricingPlans = source.pricingPlans || []
const existingListings = await request('/api/listings')
const existingIds = new Set(existingListings.map((listing) => listing.id))

await request('/api/admin/business', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    agency_name: profile.agencyName,
    email: profile.email,
    phone: profile.phone,
    whatsapp: profile.whatsapp,
    tagline: profile.tagline,
    subheadline: profile.subheadline,
    location: profile.location,
    pricing_plans: pricingPlans,
  }),
})

let migrated = 0
for (const project of source.portfolio || []) {
  const listing = {
    id: project.id,
    title: project.title,
    client: project.client,
    category: project.category,
    url: project.url,
    image: project.image,
    description: project.description || project.desc || '',
    tags: project.tags || [],
  }
  const method = existingIds.has(listing.id) ? 'PUT' : 'POST'
  const path = method === 'PUT'
    ? `/api/admin/listings/${encodeURIComponent(listing.id)}`
    : '/api/admin/listings'
  await request(path, {
    method,
    headers,
    body: JSON.stringify(listing),
  })
  migrated += 1
}

console.log(`Migration complete: business profile and ${migrated} portfolio projects synced to ${baseUrl}.`)
