import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const skillUrl = new URL('../SKILL.md', import.meta.url)
const routingUrl = new URL('../references/skill-routing-v1.md', import.meta.url)
const evalsUrl = new URL('../evals/lifecycle-routing-cases.json', import.meta.url)
const metadataUrl = new URL('../agents/openai.yaml', import.meta.url)
const artifactSkillUrl = new URL('../../porta-agent-artifact-handoff/SKILL.md', import.meta.url)
const artifactHandoffUrl = new URL('../../porta-agent-artifact-handoff/references/agent-artifact-handoff-v1.md', import.meta.url)
const productPackageUrl = new URL('../references/product-package-v1.md', import.meta.url)
const productAssetsUrl = new URL('../references/product-assets-v1.md', import.meta.url)
const previewWorkflowUrl = new URL('../references/bridge-workflow-v1.md', import.meta.url)
const releaseWorkflowUrl = new URL('../references/bridge-workflow-v2.md', import.meta.url)

test('Lifecycle settles deterministic ownership before loading phase-specific routing', async () => {
  const skill = await readFile(skillUrl, 'utf8')
  const routing = await readFile(routingUrl, 'utf8')

  assert.match(skill, /Do not perform phase work before the route receipt is settled/u)
  assert.match(skill, /route-plan --spec.*--out <route-receipt\.json>/u)
  assert.match(skill, /Development involving multiple concerns or Skill discovery:\s+\[skill-routing-v1\.md\]/u)
  assert.match(skill, /Do not preload unrelated\s+references/u)
  assert.match(routing, /define -> develop\/verify -> materialize -> preview\/accept -> deploy -> distribute -> operate\/iterate/u)
  assert.match(routing, /Route every entered phase before doing phase work/u)
  assert.match(routing, /Skill Route Receipt/u)
})

test('Porta Preview and Web Release references carry their exact route receipts', async () => {
  const [preview, release] = await Promise.all([
    readFile(previewWorkflowUrl, 'utf8'),
    readFile(releaseWorkflowUrl, 'utf8'),
  ])
  assert.match(preview, /outcome: "preview"/u)
  assert.match(preview, /porta-device.*current-user.*source.*user/u)
  assert.match(preview, /begin[\s\S]*--route-receipt "\$ROUTE_RECEIPT"/u)
  assert.match(release, /`distribute` route/u)
  assert.match(release, /begin[\s\S]*--route-receipt "\$ROUTE_RECEIPT"/u)
  assert.match(release, /release-status --run-key "\$RUN_KEY" --route-receipt "\$ROUTE_RECEIPT"/u)
})

test('development evidence can use privacy-bounded Agent Artifact Handoff without changing lifecycle phase', async () => {
  const [skill, artifactSkill, handoff] = await Promise.all([
    readFile(skillUrl, 'utf8'),
    readFile(artifactSkillUrl, 'utf8'),
    readFile(artifactHandoffUrl, 'utf8'),
  ])
  assert.match(skill, /Same-user file presentation.*`porta-agent-artifact-handoff`/u)
  assert.match(artifactSkill, /Own only the same-user presentation handoff/u)
  assert.match(handoff, /\.porta\/artifacts\/<request-id>/u)
  assert.match(handoff, /does not create a product package, lifecycle run/u)
  assert.match(handoff, /must not contain an absolute\s+remote\s+path or file bytes/u)
  assert.match(handoff, /phone receipt, preview, or save[\s\S]*separate App\/device observations/u)
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

test('materialization establishes honest product identity assets with a backward-compatible fallback', async () => {
  const skill = await readFile(skillUrl, 'utf8')
  const routing = await readFile(routingUrl, 'utf8')
  const productPackage = await readFile(productPackageUrl, 'utf8')
  const productAssets = await readFile(productAssetsUrl, 'utf8')

  assert.match(skill, /\[product-package-v2\.md\].*\[product-assets-v1\.md\]/su)
  assert.match(skill, /classify asset applicability, reject template\/dependency branding/iu)
  assert.match(routing, /establish product identity assets before Product Package settlement/iu)
  assert.match(productPackage, /explicit project logo.*Web App Manifest.*apple-touch-icon.*favicon/isu)
  assert.match(productPackage, /deterministic monogram/iu)
  assert.match(productPackage, /verified product screenshot/iu)
  assert.match(productPackage, /must not invent a Product Package field or undeclared artifact/iu)
  assert.match(productPackage, /absence of a logo or cover does not invalidate Product Package v1/iu)
  assert.match(productAssets, /logo.*cover.*not-applicable/isu)
  assert.match(productAssets, /starter|template/iu)
  assert.match(productAssets, /project-owned.*Web App Manifest.*apple-touch-icon.*favicon/isu)
  assert.match(productAssets, /exact candidate.*screenshot/isu)
  assert.match(productAssets, /specialized.*logo.*Skill|logo.*specialized.*Skill/isu)
  assert.match(productAssets, /image generation/iu)
  assert.match(productAssets, /derive.*asset brief.*product.*context/isu)
  assert.match(productAssets, /applicable.*missing.*must.*attempt.*(?:construct|generat)/isu)
  assert.match(productAssets, /fallback.*only after.*(?:unavailable|fails|rejected)/isu)
  assert.match(productAssets, /integrate.*rebuild.*verify/isu)
  assert.match(productAssets, /user-visible.*logo.*must not.*not-applicable/isu)
  assert.match(productAssets, /capability.*attempt count.*outcome.*failure evidence/isu)
  assert.match(productAssets, /provided.*generated.*fallback.*not-applicable/isu)
  assert.match(productAssets, /must not.*Product Package.*field/isu)
  assert.match(productAssets, /broken image/iu)
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
    'starter-template favicon',
  ]) assert.match(joined, new RegExp(pressure, 'iu'))
})

test('Provider metadata prompts the phase router instead of a generic pipeline', async () => {
  const metadata = await readFile(metadataUrl, 'utf8')
  assert.match(metadata, /Use \$porta-product-lifecycle to route this concrete product outcome through one validated phase/u)
  assert.match(metadata, /preserve exact target and Run authority/u)
  assert.match(metadata, /report only evidence observed for that phase/u)
})
