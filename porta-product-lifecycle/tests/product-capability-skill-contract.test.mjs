import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const skillPath = fileURLToPath(new URL('../SKILL.md', import.meta.url))
const referencePath = fileURLToPath(new URL('../references/product-capability-negotiation-v1.md', import.meta.url))

test('Skill routes package-bound capability sidecars through read-only negotiation', async () => {
  const [skill, reference] = await Promise.all([
    readFile(skillPath, 'utf8'),
    readFile(referencePath, 'utf8'),
  ])

  assert.match(skill, /product-capability-negotiation-v1\.md/u)
  assert.match(skill, /capability-negotiate --spec/u)
  assert.match(skill, /never\s+activates capabilities or creates a WorkRun/iu)
  assert.match(reference, /separate strict sidecar/iu)
  assert.match(reference, /Product Package v1 and v2\s+remain unchanged/iu)
  assert.match(reference, /hostPolicyRef/u)
  assert.match(reference, /permission expansion or reduction/iu)
  assert.match(reference, /Network and\s+Messaging are unavailable/iu)
})
