import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { URL, fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

// section: paths & defaults
const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url))
const DEFAULT_TOKEN_FILE = SCRIPT_DIR + '.tokens.json'
const DEFAULT_REDIRECT_PORT = 8976
const DESCRIPTION_MAX = 750
const DESCRIPTION_PREVIEW = 100
const REFRESH_SKEW_MS = 60000
const OAUTH_TIMEOUT_MS = 180000
const OAUTH_DEFAULT_BASE = 'https://oauth2.googleapis.com'
const AUTH_DEFAULT_BASE = 'https://accounts.google.com'
const ACCOUNT_API_DEFAULT_BASE = 'https://mybusinessaccountmanagement.googleapis.com/v1'
const BUSINESS_INFO_API_DEFAULT_BASE = 'https://mybusinessbusinessinformation.googleapis.com/v1'
const SCOPE_BUSINESS = 'https://www.googleapis.com/auth/business.manage'
const SCOPE_EMAIL = 'https://www.googleapis.com/auth/userinfo.email'
const USERINFO_URL = process.env.GBP_USERINFO_URL || 'https://www.googleapis.com/oauth2/v3/userinfo'

// section: errors
function gapiError(status, code, message, gstatus) {
  const err = new Error(`Google API error (${status}): ${code} ${message}`)
  err.status = status
  err.code = code
  err.gstatus = gstatus
  return err
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function hintForError(err) {
  if (err.status === 403) {
    return 'Hint: Business Profile API access may not be granted, this Google account may not be an owner/manager of the profile, or Google Workspace may have Business Profile turned off.'
  }
  if (err.status === 404) {
    return 'Hint: Wrong location ID. Run `list` to pick a valid location.'
  }
  if (err.status === 429) {
    return 'Hint: Quota or rate limit exceeded. Try again later.'
  }
  return null
}

// section: env & config
function loadEnv(scriptDir) {
  const env = {}
  const path = scriptDir + '.env'
  if (!existsSync(path)) {
    return env
  }
  const text = readFileSync(path, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }
    const eq = trimmed.indexOf('=')
    if (eq === -1) {
      continue
    }
    let key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function buildConfig(cli, envFromFile) {
  const env = { ...envFromFile, ...process.env }
  return {
    clientId: env.GBP_CLIENT_ID || '',
    clientSecret: env.GBP_CLIENT_SECRET || '',
    redirectPort: env.GBP_REDIRECT_PORT || String(DEFAULT_REDIRECT_PORT),
    tokenFile: env.GBP_TOKEN_FILE || DEFAULT_TOKEN_FILE,
    accountName: cli.account || env.GBP_ACCOUNT_NAME || '',
    oauthBase: env.GBP_OAUTH_BASE || OAUTH_DEFAULT_BASE,
    authBase: env.GBP_AUTH_BASE || AUTH_DEFAULT_BASE,
    accountApiBase: env.GBP_ACCOUNT_API_BASE || ACCOUNT_API_DEFAULT_BASE,
    businessInfoApiBase: env.GBP_BUSINESS_INFO_API_BASE || BUSINESS_INFO_API_DEFAULT_BASE,
    descriptionFile: cli.descriptionFile || (SCRIPT_DIR + 'description.txt'),
    description: cli.description,
    location: cli.location,
    dryRun: cli.dryRun,
    json: cli.json,
  }
}

function parseArgs(argv) {
  const cli = {
    command: '',
    descriptionFile: undefined,
    description: undefined,
    location: undefined,
    account: undefined,
    dryRun: false,
    json: false,
    help: false,
  }
  let i = 0
  if (i < argv.length && !argv[i].startsWith('--')) {
    cli.command = argv[i]
    i += 1
  }
  while (i < argv.length) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      cli.help = true
      i += 1
    } else if (arg === '--dry-run') {
      cli.dryRun = true
      i += 1
    } else if (arg === '--json') {
      cli.json = true
      i += 1
    } else if (arg === '--description-file') {
      cli.descriptionFile = argv[i + 1]
      i += 2
    } else if (arg === '--description') {
      cli.description = argv[i + 1]
      i += 2
    } else if (arg === '--location') {
      cli.location = argv[i + 1]
      i += 2
    } else if (arg === '--account') {
      cli.account = argv[i + 1]
      i += 2
    } else if (arg.startsWith('--description-file=')) {
      cli.descriptionFile = arg.slice('--description-file='.length)
      i += 1
    } else if (arg.startsWith('--description=')) {
      cli.description = arg.slice('--description='.length)
      i += 1
    } else if (arg.startsWith('--location=')) {
      cli.location = arg.slice('--location='.length)
      i += 1
    } else if (arg.startsWith('--account=')) {
      cli.account = arg.slice('--account='.length)
      i += 1
    } else {
      i += 1
    }
  }
  return cli
}

// section: description
function normalizeDescription(text) {
  const trimmed = text.trim()
  const collapsed = trimmed.replace(/\n{3,}/g, '\n\n')
  if (collapsed.length === 0) {
    throw new Error(`Description is empty (0 characters). Google allows a maximum of ${DESCRIPTION_MAX} characters.`)
  }
  if (collapsed.length > DESCRIPTION_MAX) {
    throw new Error(`Description is ${collapsed.length} characters (max ${DESCRIPTION_MAX}).`)
  }
  return collapsed
}

function checkWarnings(text) {
  const warnings = []
  if (/(https?:\/\/|www\.)/i.test(text)) {
    warnings.push('URL detected: Google Business Profile descriptions must not contain website URLs.')
  }
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text)) {
    warnings.push('Email address detected: descriptions should not contain contact details.')
  }
  if (/(\b\d{3}[-\s]?\d{3}[-\s]?\d{4}\b|\b\d{10}\b)/.test(text)) {
    warnings.push('Phone number detected: descriptions should not contain contact details.')
  }
  if (/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}]/u.test(text)) {
    warnings.push('Emoji detected: emoji are not recommended in GBP descriptions.')
  }
  const lower = text.toLowerCase()
  for (const phrase of ['call now', 'best in', '#1', '24/7', 'cheap', 'discount', 'free']) {
    if (lower.includes(phrase)) {
      warnings.push(`Promotional phrase "${phrase}" detected: avoid hype and keyword-stuffing.`)
    }
  }
  return warnings
}

async function readDescriptionFile(config) {
  let text = ''
  if (config.description) {
    text = config.description
  } else {
    try {
      text = await readFile(config.descriptionFile, 'utf8')
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        throw new Error('Description file not found: ' + config.descriptionFile + '. Create it or pass --description "your text".')
      }
      throw err
    }
  }
  return normalizeDescription(text)
}
// section: tokens
async function loadTokens(tokenFile) {
  if (!existsSync(tokenFile)) {
    return null
  }
  const text = await readFile(tokenFile, 'utf8')
  return JSON.parse(text)
}

async function saveTokens(tokenFile, tokens) {
  await mkdir(dirname(tokenFile), { recursive: true })
  const data = JSON.stringify(tokens, null, 2)
  await writeFile(tokenFile, data, { mode: 0o600 })
}

function isExpired(tokens) {
  if (!tokens || !tokens.expiry_date) {
    return true
  }
  return Number(tokens.expiry_date) - Date.now() <= REFRESH_SKEW_MS
}

async function exchangeCode(config, code, redirectUri) {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
  const res = await fetch(`${config.oauthBase}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Connection': 'close' },
    body,
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${data.error_description || data.error || JSON.stringify(data)}`)
  }
  const now = Date.now()
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || '',
    scope: data.scope || '',
    token_type: data.token_type || 'Bearer',
    expiry_date: now + Number(data.expires_in || 3600) * 1000,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    updated_at: now,
  }
}

async function refreshAccessToken(config, tokens) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: tokens.client_id,
    client_secret: tokens.client_secret,
  })
  const res = await fetch(`${config.oauthBase}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Connection': 'close' },
    body,
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Token refresh failed (${res.status}): ${data.error_description || data.error || JSON.stringify(data)}`)
  }
  const now = Date.now()
  return {
    ...tokens,
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    scope: data.scope || tokens.scope,
    expiry_date: now + Number(data.expires_in || 3600) * 1000,
    updated_at: now,
  }
}

async function apiRequest(config, method, url, body) {
  const tokens = await loadTokens(config.tokenFile)
  if (!tokens || !tokens.access_token) {
    throw new Error('No access token found. Run `node gbp/set-description.mjs auth` first.')
  }
  let accessToken = tokens.access_token
  if (isExpired(tokens)) {
    const refreshed = await refreshAccessToken(config, tokens)
    await saveTokens(config.tokenFile, refreshed)
    tokens = refreshed
    accessToken = refreshed.access_token
  }

  const headers = { Authorization: `Bearer ${accessToken}`, 'Connection': 'close' }
  if (body) {
    headers['Content-Type'] = 'application/json'
  }
  let res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    const refreshed = await refreshAccessToken(config, tokens)
    await saveTokens(config.tokenFile, refreshed)
    headers.Authorization = `Bearer ${refreshed.access_token}`
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  let data = {}
  try {
    data = await res.json()
  } catch {}
  if (!res.ok) {
    const e = data.error || {}
    throw gapiError(res.status, e.code || res.status, e.message || 'Unknown error', e.status)
  }
  return data
}

// section: oauth
async function findFreePort(startPort) {
  for (let offset = 0; offset <= 10; offset += 1) {
    const port = startPort + offset
    try {
      await new Promise((resolve, reject) => {
        const server = createServer()
        server.once('error', reject)
        server.once('listening', () => {
          server.close()
          resolve()
        })
        server.listen(port, '127.0.0.1')
      })
      return port
    } catch {
      continue
    }
  }
  throw new Error(`Could not find a free port starting from ${startPort} (tried ${startPort} through ${startPort + 10}).`)
}

function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore' })
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' })
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' })
    }
  } catch {}
}

async function getUserEmail(accessToken) {
  try {
    const info = await fetch(USERINFO_URL, { headers: { Authorization: 'Bearer ' + accessToken, 'Connection': 'close' } })
    if (info.ok) {
      const data = await info.json()
      return data.email || null
    }
  } catch {}
  return null
}

async function cmdAuth(config) {
  if (!config.clientId || !config.clientSecret) {
    throw new Error('GBP_CLIENT_ID and GBP_CLIENT_SECRET are required for the `auth` command.')
  }
  const port = await findFreePort(Number(config.redirectPort))
  const redirectUri = `http://127.0.0.1:${port}`
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36)
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE_BUSINESS + ' ' + SCOPE_EMAIL,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  const authUrl = `${config.authBase}/o/oauth2/v2/auth?${params}`

  let code = null
  let errInfo = null
  const server = createServer((req, res) => {
    const parsed = new URL(req.url, `http://127.0.0.1:${port}`)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    if (parsed.pathname !== '/') {
      res.statusCode = 404
      res.end('not found')
      return
    }
    const error = parsed.searchParams.get('error')
    if (error) {
      errInfo = { error, description: parsed.searchParams.get('error_description') || '' }
      res.statusCode = 200
      res.end('<html><body><h1>Authorization failed</h1><p>' + escapeHtml(errInfo.error) + ': ' + escapeHtml(errInfo.description) + '</p></body></html>')
      server.close()
      return
    }
    const c = parsed.searchParams.get('code')
    if (!c) {
      res.statusCode = 200
      res.end('<html><body><h1>Authorization failed</h1><p>No authorization code was returned.</p></body></html>')
      server.close()
      return
    }
    code = c
    res.statusCode = 200
    res.end('<html><body><h1>Authorization successful</h1><p>You can close this window.</p></body></html>')
    server.close()
  })

  await new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', resolve)
    server.on('error', reject)
  })

  openBrowser(authUrl)

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('OAuth flow timed out waiting for the callback.')), OAUTH_TIMEOUT_MS)
    server.on('close', () => {
      clearTimeout(timer)
      if (errInfo) {
        reject(new Error('OAuth error: ' + errInfo.error + (errInfo.description ? ' - ' + errInfo.description : '')))
      } else if (!code) {
        reject(new Error('No authorization code received from Google.'))
      } else {
        resolve()
      }
    })
  })

  const tokens = await exchangeCode(config, code, redirectUri)
  const email = await getUserEmail(tokens.access_token)
  tokens.account = email || ''
  tokens.updated_at = Date.now()
  await saveTokens(config.tokenFile, tokens)

  if (config.json) {
    console.log(JSON.stringify({ ok: true, account: email || null, tokenFile: config.tokenFile }, null, 2))
  } else {
    console.log('Authorized as: ' + (email || '(unknown email)'))
    console.log('Tokens saved to: ' + config.tokenFile)
  }
}

// section: accounts & locations
function toShortName(fullName) {
  return String(fullName).replace(/^accounts\/[^/]+\//, '')
}

async function listAccounts(config) {
  const url = config.accountApiBase.endsWith('/')
    ? config.accountApiBase + 'accounts'
    : config.accountApiBase + '/accounts'
  const data = await apiRequest(config, 'GET', url)
  return data.accounts || []
}

async function listLocations(config, accountName) {
  const url = `${config.accountApiBase}/${accountName}/locations?readMask=name,title,storeCode&pageSize=100`
  const data = await apiRequest(config, 'GET', url)
  return data.locations || []
}

async function resolveAccount(config) {
  const accounts = await listAccounts(config)
  let selected
  if (config.accountName) {
    selected = accounts.find((account) => account.name === config.accountName || account.name === 'accounts/' + config.accountName)
    if (!selected) {
      throw new Error(`Account "${config.accountName}" not found.`)
    }
  } else if (accounts.length === 1) {
    selected = accounts[0]
  } else if (accounts.length === 0) {
    throw new Error('No Google Business Profile accounts found.')
  } else {
    throw new Error('Multiple accounts found. Specify --account <name>.\n' + accounts.map((account) => `  ${account.name} (${account.accountName})`).join('\n'))
  }
  return selected
}

async function resolveLocation(config, account) {
  const locations = await listLocations(config, account.name)
  let selected
  if (config.location) {
    const input = config.location
    const short = input.startsWith('locations/') ? input : 'locations/' + input
    selected = locations.find((location) => toShortName(location.name) === short || location.name === input || location.name.endsWith('/' + input))
    if (!selected) {
      throw new Error(`Location "${config.location}" not found.`)
    }
  } else if (locations.length === 1) {
    selected = locations[0]
  } else if (locations.length === 0) {
    throw new Error('No locations found.')
  } else {
    throw new Error('Multiple locations found. Specify --location <id|name>.\n' + locations.map((location) => `  ${toShortName(location.name)}  ${location.title}  ${location.storeCode || '-'}`).join('\n'))
  }
  return { selected, locations }
}

// section: commands
async function cmdList(config) {
  const accounts = await listAccounts(config)
  let filtered = accounts
  if (config.accountName) {
    filtered = accounts.filter((account) => account.name === config.accountName || account.name === 'accounts/' + config.accountName)
    if (!filtered.length) {
      throw new Error(`Account "${config.accountName}" not found.`)
    }
  }
  const rows = []
  for (const account of filtered) {
    const locations = await listLocations(config, account.name)
    rows.push({ account, locations })
  }
  if (config.json) {
    console.log(JSON.stringify(rows, null, 2))
    return
  }
  for (const row of rows) {
    console.log(row.account.name + ' (' + row.account.accountName + ')')
    if (!row.locations.length) {
      console.log('  (no locations)')
    } else {
      for (const location of row.locations) {
        console.log('  ' + toShortName(location.name) + '  ' + location.title + '  ' + (location.storeCode || '-'))
      }
    }
  }
}

async function cmdShow(config) {
  const account = await resolveAccount(config)
  const { selected } = await resolveLocation(config, account)
  const shortName = toShortName(selected.name)
  const url = `${config.businessInfoApiBase}/${shortName}?readMask=name,title,profile,websiteUri,storefrontAddress,languageCode,metadata`
  const data = await apiRequest(config, 'GET', url)
  const loc = data.location
  const desc = (loc.profile && loc.profile.description) || ''
  if (config.json) {
    console.log(JSON.stringify({ name: loc.name, title: loc.title, websiteUri: loc.websiteUri, description: desc }, null, 2))
  } else {
    console.log('Name: ' + loc.name)
    console.log('Title: ' + loc.title)
    console.log('Website: ' + (loc.websiteUri || '-'))
    console.log('Description (' + desc.length + ' characters):')
    console.log(desc || '(empty)')
  }
}

async function cmdSet(config) {
  const description = await readDescriptionFile(config)
  const warnings = checkWarnings(description)
  const preview = description.slice(0, DESCRIPTION_PREVIEW)
  const previewText = preview.length < description.length ? preview + '...' : preview
  const dryRun = !!config.dryRun

  if (!config.json) {
    console.log('Description: ' + description.length + ' characters (max ' + DESCRIPTION_MAX + ')')
    console.log('Preview: ' + previewText)
    if (warnings.length) {
      console.log('Warnings:')
      for (const warning of warnings) {
        console.log('  - ' + warning)
      }
    }
  }

  const account = await resolveAccount(config)
  const { selected } = await resolveLocation(config, account)
  const shortName = toShortName(selected.name)
  const url = `${config.businessInfoApiBase}/${shortName}?updateMask=profile.description${dryRun ? '&validateOnly=true' : ''}`
  const body = { profile: { description } }
  const data = await apiRequest(config, 'PATCH', url, body)
  const saved = data.location || data
  const savedDesc = (saved.profile && saved.profile.description) || ''

  if (config.json) {
    console.log(JSON.stringify({
      characters: description.length,
      max: DESCRIPTION_MAX,
      preview: previewText,
      warnings,
      location: shortName,
      title: selected.title,
      dryRun,
      saved: !dryRun,
      description: dryRun ? null : savedDesc,
      validated: dryRun,
    }, null, 2))
    return
  }

  console.log('Set business description for ' + shortName + ' (' + selected.title + ').')
  console.log('Characters: ' + description.length)
  if (dryRun) {
    console.log('Validated by Google (dry-run, nothing was saved).')
    return
  }
  console.log('Saved description (' + savedDesc.length + ' characters): ' + savedDesc)
}

async function cmdVerify(config) {
  const description = await readDescriptionFile(config)
  const account = await resolveAccount(config)
  const { selected } = await resolveLocation(config, account)
  const shortName = toShortName(selected.name)
  const url = `${config.businessInfoApiBase}/${shortName}?readMask=name,title,profile`
  const data = await apiRequest(config, 'GET', url)
  const loc = data.location
  const live = (loc.profile && loc.profile.description) || ''
  const match = live === description
  if (config.json) {
    console.log(JSON.stringify({ match, location: shortName, title: loc.title, intendedCharacters: description.length, liveCharacters: live.length, live }, null, 2))
  } else {
    console.log('Location: ' + shortName + ' (' + loc.title + ')')
    console.log('Intended (' + description.length + ' characters): ' + description)
    console.log('Live     (' + live.length + ' characters): ' + live)
    if (match) {
      console.log('MATCH: live description matches intended.')
    } else {
      console.log('NO MATCH: live description does not match intended.')
      process.exitCode = 1
    }
  }
}

// section: help & entrypoint
function printHelp() {
  const help = [
    'Usage: node gbp/set-description.mjs <command> [options]',
    '',
    'Commands:',
    '  auth    Run the OAuth 2.0 loopback flow and save tokens.',
    '  list    Print all accounts and their locations.',
    '  show    Print the current business description of the selected location.',
    '  set     Set the business description (writes to the live profile).',
    '  verify  Re-read the location and check the live description matches the intended one.',
    '  help    Print this usage.',
    '',
    'Global options:',
    '  --description-file <path>  File containing the description text. Default: description.txt (relative to the script folder).',
    '  --description <text>       Inline description text (overrides --description-file).',
    '  --location <id|name>       Target location: locations/456 or bare 456.',
    '  --account <name>           Optional account filter, e.g. accounts/123.',
    '  --dry-run                  For set: validate with Google but do not save.',
    '  --json                     Print machine-readable JSON instead of human text.',
    '  --help                     Show this usage.',
    '',
    'Environment variables:',
    '  GBP_CLIENT_ID, GBP_CLIENT_SECRET   Google OAuth client (Desktop app type)',
    '  GBP_REDIRECT_PORT                  default 8976',
    '  GBP_TOKEN_FILE                     default <script folder>/.tokens.json',
    '  GBP_ACCOUNT_NAME                   optional pinned account',
    '  GBP_OAUTH_BASE / GBP_AUTH_BASE / GBP_ACCOUNT_API_BASE / GBP_BUSINESS_INFO_API_BASE',
    '                                     API base URLs (overridable for testing)',
    '  Also loads <script folder>/.env if present (simple KEY=VALUE parser, no dotenv dependency).',
  ].join('\n')
  console.log(help)
}

async function main() {
  const cli = parseArgs(process.argv.slice(2))
  if (cli.help || cli.command === 'help' || !cli.command) {
    printHelp()
    return
  }

  const envFromFile = loadEnv(SCRIPT_DIR)
  const config = buildConfig(cli, envFromFile)

  try {
    switch (cli.command) {
      case 'auth':
        await cmdAuth(config)
        break
      case 'list':
        await cmdList(config)
        break
      case 'show':
        await cmdShow(config)
        break
      case 'set':
        await cmdSet(config)
        break
      case 'verify':
        await cmdVerify(config)
        break
      default:
        throw new Error('Unknown command: ' + cli.command + '\nRun `--help` for usage.')
    }
  } catch (err) {
    if (config.json) {
      console.log(JSON.stringify({ error: err.message, status: err.status, code: err.code, gstatus: err.gstatus }, null, 2))
    } else {
      console.error(err.message)
      if (err.status) {
        console.error('Status: ' + err.status + ', Code: ' + err.code + (err.gstatus ? ', Google status: ' + err.gstatus : ''))
        const hint = hintForError(err)
        if (hint) {
          console.error(hint)
        }
      }
    }
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('Fatal: ' + err.message)
  process.exitCode = 1
})