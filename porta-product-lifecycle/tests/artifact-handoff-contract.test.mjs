import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

test('Skill metadata recognizes concrete Porta phone file handoff intent', async () => {
  const skill = await readFile(new URL('SKILL.md', root), 'utf8')
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? ''
  assert.match(frontmatter, /image, document, report, or file/u)
  assert.match(frontmatter, /sent, previewed, or saved/u)
  assert.match(frontmatter, /Porta phone or Inbox/u)
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

test('Lifecycle routing pressure cases cover artifact retries, batches, and evidence overclaim', async () => {
  const activation = JSON.parse(await readFile(new URL('evals/activation-cases.json', root), 'utf8'))
  const routing = JSON.parse(await readFile(new URL('evals/lifecycle-routing-cases.json', root), 'utf8'))
  for (const id of ['single-file-phone-preview', 'multi-file-phone-preview', 'inbox-file-delivery', 'cross-user-file-send']) {
    assert.ok(activation.some((entry) => entry.id === id), `missing activation case ${id}`)
  }
  for (const id of ['artifact-request-reuse', 'artifact-batch-partial-failure', 'artifact-receipt-overclaim']) {
    assert.ok(routing.cases.some((entry) => entry.id === id), `missing routing case ${id}`)
  }
})

test('Skill includes and routes through the protocol reliability contract', async () => {
  const skill = await readFile(new URL('SKILL.md', root), 'utf8')
  const reliability = await readFile(new URL('references/protocol-reliability-v1.md', root), 'utf8')
  assert.match(skill, /protocol-reliability-v1\.md/u)
  assert.match(reliability, /intent.*admission.*request identity.*mutation.*receipt.*projection.*target observation/isu)
  assert.match(reliability, /idempotency/iu)
  assert.match(reliability, /independent readback/iu)
  assert.match(reliability, /partial failure/iu)
})
