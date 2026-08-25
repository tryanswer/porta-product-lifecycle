import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const skillUrl = new URL('../SKILL.md', import.meta.url)
const routingUrl = new URL('../references/skill-routing-v1.md', import.meta.url)
const evalsUrl = new URL('../evals/lifecycle-routing-cases.json', import.meta.url)
const metadataUrl = new URL('../agents/openai.yaml', import.meta.url)

test('Lifecycle requires one phase routing contract before phase work begins', async () => {
  const skill = await readFile(skillUrl, 'utf8')
  const routing = await readFile(routingUrl, 'utf8')

  assert.match(skill, /Read \[references\/skill-routing-v1\.md\].*before entering any lifecycle phase/su)
  assert.match(skill, /Do not replace selected sub-Skills with generic model knowledge/u)
  assert.match(routing, /define -> develop\/verify -> materialize -> preview\/accept -> deploy -> distribute -> operate\/iterate/u)
  assert.match(routing, /Route every entered phase before doing phase work/u)
  assert.match(routing, /Skill Route Receipt/u)
})

test('routing covers product discovery, engineering, delivery, distribution, and operation', async () => {
  const routing = await readFile(routingUrl, 'utf8')
  for (const required of [
    'requirement challenge',
    'demand validation',
    'architecture and reuse',
    'design and accessibility',
    'implementation discipline',
    'stability and security',
    'observability',
    'Product Package',
    'preview and acceptance',
    'deployment',
    'distribution',
    'operations and iteration',
  ]) assert.match(routing, new RegExp(required, 'iu'))

  for (const adapter of [
    'grill-me',
    'ai-native-development',
    'improve-codebase-architecture',
    'deliver-product',
    'porta-mobile-validation-campaign',
    'porta-orchestrate-agent-work',
    'operations-analytics',
  ]) assert.match(routing, new RegExp(`\\b${adapter}\\b`, 'u'))
})

test('routing searches reusable and maintained capabilities without silently installing them', async () => {
  const routing = await readFile(routingUrl, 'utf8')

  assert.match(routing, /search\s+the repository first/iu)
  assert.match(routing, /available Skill metadata/iu)
  assert.match(routing, /official platform or framework capability/iu)
  assert.match(routing, /maintained open-source Skill, plugin, library, or reference implementation/iu)
  assert.match(routing, /license[\s\S]*maintenance[\s\S]*security[\s\S]*exit cost/iu)
  assert.match(routing, /Never silently install, enable, connect, or grant authority/iu)
  assert.match(routing, /one lead Skill per concern/iu)
  assert.match(routing, /sub-Skill.*cannot expand.*mutation authority/isu)
})

test('routing pressure cases cover shortcuts across the complete lifecycle', async () => {
  const cases = JSON.parse(await readFile(evalsUrl, 'utf8'))
  assert.equal(cases.schemaVersion, 1)
  assert.ok(cases.cases.length >= 8)
  const joined = JSON.stringify(cases)
  for (const pressure of [
    'skip discovery',
    'build from scratch',
    'no observability',
    'preview means deployed',
    'deployment means distributed',
    'install an arbitrary skill',
    'publish without readback',
    'stop after launch',
  ]) assert.match(joined, new RegExp(pressure, 'iu'))
})

test('Provider metadata prompts the phase router instead of a generic pipeline', async () => {
  const metadata = await readFile(metadataUrl, 'utf8')
  assert.match(metadata, /Route each requested product phase through the narrowest applicable Skills and native adapters/u)
  assert.match(metadata, /separate package, Local Product Release, deployment, distribution, and availability evidence/u)
})
