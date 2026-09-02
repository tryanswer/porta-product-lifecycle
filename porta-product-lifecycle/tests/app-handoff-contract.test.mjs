import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

test('Lifecycle gives Porta App handoffs one exact pre-route contract', async () => {
  const [skill, reference] = await Promise.all([
    readFile(new URL('SKILL.md', root), 'utf8'),
    readFile(new URL('references/app-handoff-v1.md', root), 'utf8'),
  ])

  assert.match(skill, /porta-product-lifecycle-app-handoff/u)
  assert.match(skill, /read \[app-handoff-v1\.md\]/u)
  assert.match(skill, /cannot change target in place/u)
  assert.match(skill, /fresh destination\s+confirmation in Porta Product Preview/u)
  assert.match(reference, /"workspace": "app-verified-current-cwd"/u)
  assert.match(reference, /"policy": "supersede-and-reconfirm-in-porta"/u)
  assert.match(reference, /handoff_\[a-f0-9\]\{32\}/u)
  assert.match(reference, /copying these envelope route fields unchanged/u)
  assert.match(reference, /set `runKey` to the newly\s+allocated exact key/u)
  assert.match(reference, /Any other owner, target kind\/ref, outcome, Run policy, or disposition/u)
})

test('a steered target supersedes the App handoff without gaining new mutation authority', async () => {
  const [reference, activationCases, routingCases] = await Promise.all([
    readFile(new URL('references/app-handoff-v1.md', root), 'utf8'),
    readFile(new URL('evals/activation-cases.json', root), 'utf8').then(JSON.parse),
    readFile(new URL('evals/lifecycle-routing-cases.json', root), 'utf8').then(JSON.parse),
  ])

  assert.match(reference, /different outcome or target --> superseded/u)
  assert.match(reference, /Do not rewrite the envelope/u)
  assert.match(reference, /Never\s+cancel, replace, or relabel it implicitly/u)
  assert.match(reference, /same `handoffRef` and exact bindings as an\s+idempotent delivery retry/u)
  assert.match(reference, /never allocate a second Run\s+only because the prompt was delivered again/u)
  const activation = activationCases.find((entry) => entry.id === 'app-local-handoff-target-switch')
  assert.deepEqual(activation?.expected, {
    disposition: 'clarify',
    selection: 'none',
    workRunAction: 'preserve-and-report',
  })
  const pressure = routingCases.cases.find((entry) => entry.id === 'app-local-handoff-steered-to-cloud')
  assert.ok(pressure)
  assert.ok(pressure.expect.includes('fresh Porta Product Preview destination confirmation'))
  assert.ok(pressure.forbid.includes('delegate the changed target to deliver-product'))
})

test('the handoff remains local anti-drift evidence rather than security or completion proof', async () => {
  const reference = await readFile(new URL('references/app-handoff-v1.md', root), 'utf8')
  assert.match(reference, /does not make a prompt a security credential/u)
  assert.match(reference, /Bridge, provider, account, entitlement, or target readback/u)
  assert.match(reference, /terminal delivery of the prompt/u)
  assert.match(reference, /public\s+availability/u)
})
