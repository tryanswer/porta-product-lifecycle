import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const sourceClient = fileURLToPath(new URL('../scripts/porta-agent-artifact-handoff.mjs', import.meta.url))

test('wrapper exposes a bounded publish-only interface', () => {
  const result = spawnSync(process.execPath, [sourceClient, '--help'], { encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.match(result.stdout, /publish --cwd/u)
  assert.doesNotMatch(result.stdout, /begin|candidate-register|local-release-register/u)
})

test('wrapper forwards publish to the one sibling lifecycle protocol client', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'porta-artifact-handoff-test-'))
  t.after(async () => rm(root, { force: true, recursive: true }))
  const wrapper = join(root, 'porta-agent-artifact-handoff', 'scripts', 'porta-agent-artifact-handoff.mjs')
  const sibling = join(root, 'porta-product-lifecycle', 'scripts', 'porta-product-lifecycle.mjs')
  await Promise.all([mkdir(dirname(wrapper), { recursive: true }), mkdir(dirname(sibling), { recursive: true })])
  await writeFile(wrapper, await readFile(sourceClient, 'utf8'))
  await writeFile(sibling, "process.stdout.write(JSON.stringify(process.argv.slice(2)))\n")

  const result = spawnSync(process.execPath, [wrapper, 'publish', '--request', 'request-1'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), ['artifact-publish', '--request', 'request-1'])
})

test('wrapper fails closed when the shared protocol client is absent', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'porta-artifact-handoff-test-'))
  t.after(async () => rm(root, { force: true, recursive: true }))
  const wrapper = join(root, 'porta-agent-artifact-handoff', 'scripts', 'porta-agent-artifact-handoff.mjs')
  await mkdir(dirname(wrapper), { recursive: true })
  await writeFile(wrapper, await readFile(sourceClient, 'utf8'))

  const result = spawnSync(process.execPath, [wrapper, 'publish'], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.equal(JSON.parse(result.stderr).error.code, 'lifecycle_client_missing')
})
