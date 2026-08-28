import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { test } from 'node:test'

const README = new URL('../README.md', import.meta.url)
const SKILL = new URL('../porta-product-lifecycle/SKILL.md', import.meta.url)
const CLIENT = new URL(
  '../porta-product-lifecycle/scripts/porta-product-lifecycle.mjs',
  import.meta.url,
)

test('public release identity is internally consistent', async () => {
  const [readme, skill, client] = await Promise.all([
    readFile(README, 'utf8'),
    readFile(SKILL, 'utf8'),
    readFile(CLIENT, 'utf8'),
  ])

  assert.match(skill, /^---\nname: porta-product-lifecycle\n/mu)
  assert.match(client, /const SKILL_ID = 'porta-product-lifecycle'/u)
  assert.match(client, /const SKILL_VERSION = '1\.0\.6'/u)
  assert.match(client, /COMPATIBLE_STATE_SKILL_VERSIONS = new Set\(\['1\.0\.0', '1\.0\.1', '1\.0\.2', '1\.0\.3', '1\.0\.4', '1\.0\.5', SKILL_VERSION\]\)/u)
  assert.match(readme, /immutable release `porta-product-lifecycle-v1\.0\.6`/u)
  assert.match(readme, /git clone --branch porta-product-lifecycle-v1\.0\.6/u)
  assert.match(readme, /https:\/\/github\.com\/tryanswer\/porta-product-lifecycle\.git/u)
  assert.doesNotMatch(readme, /porta-workflow-v/u)
})

test('public release contains the complete current Skill subtree', async () => {
  await Promise.all([
    'references/private-product-v1.md',
    'references/product-assets-v1.md',
    'references/product-capability-negotiation-v1.md',
    'references/product-package-v2.md',
    'scripts/product-capability-negotiation.mjs',
    'tests/product-capability-negotiation.test.mjs',
    'tests/product-capability-skill-contract.test.mjs',
  ].map((entry) => access(new URL(`../porta-product-lifecycle/${entry}`, import.meta.url))))
})

test('installation and planning cannot be described as WorkRun authority', async () => {
  const [readme, skill] = await Promise.all([
    readFile(README, 'utf8'),
    readFile(SKILL, 'utf8'),
  ])

  assert.match(readme, /never\nstart a WorkRun or authorize deployment or distribution/u)
  assert.match(skill, /Installation, discovery, and a lifecycle plan alone never authorize a WorkRun/u)
  assert.match(skill, /current explicit intent/u)
})
