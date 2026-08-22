import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const skillPath = fileURLToPath(new URL('../SKILL.md', import.meta.url))
const metadataPath = fileURLToPath(new URL('../agents/openai.yaml', import.meta.url))
const activationReferencePath = fileURLToPath(new URL('../references/skill-activation.md', import.meta.url))
const migrationReferencePath = fileURLToPath(new URL('../references/legacy-migration.md', import.meta.url))

test('canonical identity and natural-language lifecycle activation are installable', async () => {
  const [skill, metadata] = await Promise.all([readFile(skillPath, 'utf8'), readFile(metadataPath, 'utf8')])
  assert.match(skill, /^---\nname: porta-product-lifecycle\n/m)
  assert.match(skill, /guide, build, verify, package, preview, deploy, distribute, release, or operate/)
  assert.match(metadata, /display_name: "Porta Product Lifecycle"/)
  assert.match(metadata, /allow_implicit_invocation:\s*true/)
  assert.doesNotMatch(metadata, /\$porta-product-lifecycle/)
})

test('planning and installation never grant mutation or WorkRun authority', async () => {
  const skill = (await readFile(skillPath, 'utf8')).replace(/\s+/g, ' ')
  assert.match(skill, /Installation\/update.*never activates this Skill, calls `begin`, or creates a WorkRun/)
  assert.match(
    skill,
    /`build-execution-plan`, `package-validate`, and `lifecycle-plan`.*never create a WorkRun or authorize external mutation/,
  )
  assert.match(skill, /Deployment requires an explicit target/)
  assert.match(skill, /Distribution or Porta publication requires current explicit intent/)
  assert.match(skill, /Store submission, approval, rollout, and public availability are distinct receipts/)
})

test('publication and readiness preserve the fail-closed Bridge boundaries', async () => {
  const skill = (await readFile(skillPath, 'utf8')).replace(/\s+/g, ' ')
  assert.match(skill, /current user message to unambiguously ask to publish or release/)
  assert.match(skill, /Bridge publication preflight remains the final fail-closed authority/)
  assert.match(skill, /current Agent's structured claim/)
  assert.match(skill, /not verified or attested/)
  assert.match(skill, /never as a security gate or publication authority/)
  assert.match(skill, /readiness command never calls `begin` or creates a WorkRun/)
})

test('new identity installs atomically and migrates legacy input without mixed output identity', async () => {
  const [activation, migration] = await Promise.all([
    readFile(activationReferencePath, 'utf8'),
    readFile(migrationReferencePath, 'utf8'),
  ])
  assert.match(activation, /exact repository subdirectory \(`porta-product-lifecycle`\)/)
  assert.match(activation.replace(/\s+/g, ' '), /does not activate Porta Product Lifecycle, authorize publication, call `begin`, or create a WorkRun/)
  assert.match(migration, /version `1\.0\.0` is a new identity/)
  assert.match(migration.replace(/\s+/g, ' '), /New descriptors, client receipts, Scene claims, WorkRuns, package plans, and output types must use only the new identity/)
  assert.match(migration, /new client refuses old client-state identity\/version combinations/)
})
