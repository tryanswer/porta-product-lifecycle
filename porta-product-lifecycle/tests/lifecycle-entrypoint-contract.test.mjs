import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const repositoryRoot = new URL('../../', import.meta.url)

test('Lifecycle entrypoint is a bounded coordinator, not a file handoff or installer catchall', async () => {
  const skill = await readFile(new URL('SKILL.md', root), 'utf8')
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? ''
  assert.match(frontmatter, /concrete product.*lifecycle/iu)
  assert.doesNotMatch(frontmatter, /image, document, report, or file/iu)
  assert.doesNotMatch(frontmatter, /Installation, discovery/iu)
  assert.match(skill, /route-plan --spec/u)
  assert.match(skill, /Do not perform phase work before the route receipt is settled/u)
  assert.match(skill, /lifecycle-route-receipt-v1\.md/u)
})

test('Artifact Handoff has an independently discoverable Skill entrypoint', async () => {
  const handoffRoot = new URL('porta-agent-artifact-handoff/', repositoryRoot)
  await Promise.all([
    access(new URL('SKILL.md', handoffRoot)),
    access(new URL('agents/openai.yaml', handoffRoot)),
  ])
  const skill = await readFile(new URL('SKILL.md', handoffRoot), 'utf8')
  assert.match(skill, /^---\nname: porta-agent-artifact-handoff\n/mu)
  assert.match(skill, /same user's connected Porta phone or Inbox/iu)
  assert.doesNotMatch(skill, /deploy|distribution|WorkRun/iu)
})

test('Provider prompt explicitly invokes the coordinator and remains one sentence', async () => {
  const metadata = await readFile(new URL('agents/openai.yaml', root), 'utf8')
  const prompt = metadata.match(/default_prompt:\s*"([^"]+)"/u)?.[1] ?? ''
  assert.match(prompt, /\$porta-product-lifecycle/u)
  assert.ok(prompt.length <= 240, `default prompt is too long: ${prompt.length}`)
  assert.equal((prompt.match(/[.!?。！？]/gu) ?? []).length, 1)
})
