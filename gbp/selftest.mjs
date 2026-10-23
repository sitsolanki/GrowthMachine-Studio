import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const SET_DESC = join(ROOT, 'set-description.mjs')

let capturedPatch = null
let currentDescription = '<old>'

async function main() {
  const server = createServer((req, res) => {
    const parsed = new URL(req.url, 'http://127.0.0.1:9999')
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json')
      const send = (obj) => res.end(JSON.stringify(obj))
      if (req.method === 'POST' && parsed.pathname === '/token') {
        send({ access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3599, token_type: 'Bearer', scope: 'https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/userinfo.email' })
      } else if (req.method === 'GET' && parsed.pathname === '/v1/accounts') {
        send({ accounts: [{ name: 'accounts/111', accountName: 'GrowthMachine Studio' }] })
      } else if (req.method === 'GET' && parsed.pathname === '/v1/accounts/111/locations') {
        send({ locations: [{ name: 'accounts/111/locations/222', title: 'GrowthMachine Studio', storeCode: 'GMS-1' }] })
      } else if (req.method === 'GET' && parsed.pathname === '/v1/locations/222') {
        send({ location: { name: 'locations/222', title: 'GrowthMachine Studio', profile: { description: currentDescription } } })
      } else if (req.method === 'PATCH' && parsed.pathname === '/v1/locations/222') {
        capturedPatch = {
          path: parsed.pathname,
          updateMask: parsed.searchParams.get('updateMask'),
          body,
          authorization: req.headers.authorization,
        }
        currentDescription = JSON.parse(body).profile.description
        send({ location: { name: 'locations/222', title: 'GrowthMachine Studio', profile: { description: currentDescription } } })
      } else {
        res.statusCode = 404
        send({ error: { code: 404, message: 'not found', status: 'NOT_FOUND' } })
      }
    })
  })

  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', resolve)
    server.on('error', reject)
  })
  const port = server.address().port
  const base = 'http://127.0.0.1:' + port

  const dir = await mkdtemp(join(tmpdir(), 'gbp-selftest-'))
  const tokenFile = join(dir, '.tokens.json')
  await writeFile(tokenFile, JSON.stringify({
    access_token: 'test-access',
    refresh_token: 'test-refresh',
    expiry_date: Date.now() + 3600000,
    token_type: 'Bearer',
    client_id: 'test-client',
    client_secret: 'test-secret',
    updated_at: Date.now(),
  }), 'utf8')

  const env = {
    ...process.env,
    GBP_OAUTH_BASE: base,
    GBP_AUTH_BASE: base,
    GBP_ACCOUNT_API_BASE: base + '/v1',
    GBP_BUSINESS_INFO_API_BASE: base + '/v1',
    GBP_TOKEN_FILE: tokenFile,
    GBP_CLIENT_ID: 'test-client',
    GBP_CLIENT_SECRET: 'test-secret',
  }

  const failures = []
  function assert(condition, message) {
    if (!condition) {
      failures.push(message)
    }
  }

  async function run(args) {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [SET_DESC, ...args], { env, encoding: 'utf8' })
      let stdout = ''
      let stderr = ''
      let done = false
      const timer = setTimeout(() => {
        if (done) return
        done = true
        try { child.kill() } catch {}
        failures.push("command '" + args.join(' ') + "' timed out after 20000ms")
        resolve({ status: null, stdout, stderr, timedOut: true })
      }, 20000)
      child.stdout.on('data', (c) => { stdout += c })
      child.stderr.on('data', (c) => { stderr += c })
      child.on('close', (code) => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve({ status: code, stdout, stderr, timedOut: false })
      })
    })
  }

  const watchdog = setTimeout(() => {
    console.log('SELFTEST FAIL')
    console.log('  - overall watchdog timed out after 120000ms')
    process.exit(1)
  }, 120000)

  try {
    const listRes = await run(['list'])
    assert(listRes.status === 0, 'list exited ' + listRes.status + ': ' + listRes.stderr)
    assert(listRes.stdout.includes('accounts/111'), 'list output missing account')
    assert(listRes.stdout.includes('locations/222'), 'list output missing short location')
    assert(listRes.stdout.includes('GrowthMachine Studio'), 'list output missing title')
    assert(listRes.stdout.includes('GMS-1'), 'list output missing storeCode')

    const showRes = await run(['show'])
    assert(showRes.status === 0, 'show exited ' + showRes.status + ': ' + showRes.stderr)
    assert(showRes.stdout.includes('<old>'), 'show output missing old description')

    const newDesc = 'New description for self-test verification.'
    const setRes = await run(['set', '--description', newDesc])
    assert(setRes.status === 0, 'set exited ' + setRes.status + ': ' + setRes.stderr)
    assert(capturedPatch, 'PATCH was not captured by mock')
    assert(capturedPatch.path === '/v1/locations/222', 'PATCH path is ' + capturedPatch.path + ', expected /v1/locations/222')
    assert(capturedPatch.updateMask === 'profile.description', 'updateMask is ' + capturedPatch.updateMask)
    assert(capturedPatch.authorization === 'Bearer test-access', 'Authorization header is ' + capturedPatch.authorization)
    const patchBody = JSON.parse(capturedPatch.body)
    assert(patchBody.profile && patchBody.profile.description === newDesc, 'PATCH body description mismatch: ' + capturedPatch.body)
    assert(setRes.stdout.includes(newDesc), 'set output missing new description')

    const verifyRes = await run(['verify', '--description', newDesc])
    assert(verifyRes.status === 0, 'verify exited ' + verifyRes.status + ': ' + verifyRes.stderr)
    assert(verifyRes.stdout.includes('MATCH'), 'verify output missing MATCH')
  } finally {
    clearTimeout(watchdog)
    await rm(dir, { recursive: true, force: true })
    await new Promise((resolve) => server.close(resolve))
  }

  if (failures.length) {
    console.log('SELFTEST FAIL')
    for (const failure of failures) {
      console.log('  - ' + failure)
    }
    process.exitCode = 1
    return
  }
  console.log('SELFTEST PASS')
}

main().catch((err) => {
  console.log('SELFTEST FAIL')
  console.log('  - ' + err.message)
  process.exitCode = 1
})
