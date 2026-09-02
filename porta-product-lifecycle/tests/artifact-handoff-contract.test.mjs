import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const lifecycleRoot = new URL('../', import.meta.url)
const repositoryRoot = new URL('../../', import.meta.url)
const root = new URL('porta-agent-artifact-handoff/', repositoryRoot)

test('Skill metadata recognizes concrete Porta phone file handoff intent', async () => {
  const skill = await readFile(new URL('SKILL.md', root), 'utf8')
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? ''
  assert.match(frontmatter, /generated images, PDFs, text, reports, or other files/u)
  assert.match(frontmatter, /send, present, preview, or save/u)
  assert.match(frontmatter, /same user's connected Porta phone or Inbox/u)
})

test('Artifact handoff defines one-shot request identity and independent evidence states', async () => {
  const reference = await readFile(new URL('references/agent-artifact-handoff-v1.md', root), 'utf8')
  assert.match(reference, /one file.*one unique request id/isu)
  assert.match(reference, /never reuse.*request id.*different file/isu)
  assert.match(reference, /N files.*N independent requests/isu)
  assert.match(reference, /publish receipt.*Inbox projection.*popup.*preview.*save/isu)
  assert.match(reference, /256 MiB/u)
  assert.match(reference, /partial failure/iu)
})

test('Artifact activation and routing pressure cases cover boundaries, retries, and evidence overclaim', async () => {
  const activation = JSON.parse(await readFile(new URL('evals/activation-cases.json', root), 'utf8'))
  const routing = JSON.parse(await readFile(new URL('evals/lifecycle-routing-cases.json', lifecycleRoot), 'utf8'))
  for (const id of ['single-file-phone-preview', 'multi-file-phone-preview', 'inbox-file-delivery', 'cross-user-file-send']) {
    assert.ok(activation.some((entry) => entry.id === id), `missing activation case ${id}`)
  }
  assert.equal(activation.find((entry) => entry.id === 'single-file-phone-preview')?.expected.disposition, 'activate')
  assert.equal(activation.find((entry) => entry.id === 'inbox-file-delivery')?.expected.intent, 'inbox')
  assert.equal(activation.find((entry) => entry.id === 'cross-user-file-send')?.expected.disposition, 'ignore')
  for (const id of ['artifact-request-reuse', 'artifact-batch-partial-failure', 'artifact-receipt-overclaim']) {
    assert.ok(routing.cases.some((entry) => entry.id === id), `missing routing case ${id}`)
  }
})

test('Skill keeps wire ownership centralized and preserves protocol evidence boundaries', async () => {
  const skill = await readFile(new URL('SKILL.md', root), 'utf8')
  const reference = await readFile(new URL('references/agent-artifact-handoff-v1.md', root), 'utf8')
  const client = await readFile(new URL('scripts/porta-agent-artifact-handoff.mjs', root), 'utf8')
  assert.match(skill, /one receipt validator and one\s+Bridge contract/u)
  assert.match(client, /porta-product-lifecycle\/scripts\/porta-product-lifecycle\.mjs/u)
  assert.match(reference, /stable retry.*same\s+artifact reference and event id/isu)
  assert.match(reference, /partial failure/iu)
  assert.match(reference, /separate App\/device observations/iu)
})
