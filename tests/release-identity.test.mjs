import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
  assert.match(client, /const SKILL_VERSION = '1\.0\.0'/u)
  assert.match(readme, /porta-product-lifecycle-v1\.0\.0/u)
  assert.match(readme, /https:\/\/github\.com\/tryanswer\/porta-product-lifecycle\.git/u)
  assert.doesNotMatch(readme, /porta-workflow-v/u)
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
