import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const client = fileURLToPath(new URL('../scripts/porta-product-lifecycle.mjs', import.meta.url))
const runKey = 'run_77777777-7777-4777-8777-777777777777'

test('route-plan persists an exact receipt and route-check enforces command and Run binding', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'porta-lifecycle-route-test-'))
  t.after(async () => rm(root, { force: true, recursive: true }))
  const spec = join(root, 'route.json')
  const receipt = join(root, 'receipt.json')
  await writeFile(spec, `${JSON.stringify({
    schemaVersion: 1,
    outcome: 'distribute',
    object: { kind: 'product', ref: 'product_current' },
    target: { kind: 'porta-web', ref: 'product_current', source: 'trusted-runtime' },
    portaContext: 'trusted',
    explicitMutationIntent: true,
    runKey: runKey,
  })}\n`)

  const planned = spawnSync(process.execPath, [client, 'route-plan', '--spec', spec, '--out', receipt], {
    encoding: 'utf8',
  })
  assert.equal(planned.status, 0, planned.stderr)
  const plan = JSON.parse(planned.stdout)
  const persisted = JSON.parse(await readFile(receipt, 'utf8'))
  assert.equal(plan.routeDigest, persisted.routeDigest)
  assert.equal(plan.receiptFile, receipt)

  const checked = spawnSync(process.execPath, [
    client,
    'route-check',
    '--receipt', receipt,
    '--command', 'begin',
    '--run-key', runKey,
  ], { encoding: 'utf8' })
  assert.equal(checked.status, 0, checked.stderr)
  assert.equal(JSON.parse(checked.stdout).routeDigest, persisted.routeDigest)

  persisted.target.ref = 'another_product'
  await writeFile(receipt, `${JSON.stringify(persisted)}\n`)
  const drifted = spawnSync(process.execPath, [
    client,
    'route-check',
    '--receipt', receipt,
    '--command', 'begin',
    '--run-key', runKey,
  ], { encoding: 'utf8' })
  assert.equal(drifted.status, 1)
  assert.equal(JSON.parse(drifted.stderr).code, 'invalid_route_receipt')

  const linkedSpec = join(root, 'linked-route.json')
  await symlink(spec, linkedSpec)
  const linked = spawnSync(process.execPath, [client, 'route-plan', '--spec', linkedSpec], {
    encoding: 'utf8',
  })
  assert.equal(linked.status, 1)
  assert.equal(JSON.parse(linked.stderr).code, 'invalid_route_spec')
})
