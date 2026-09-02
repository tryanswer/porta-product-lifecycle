import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const evaluator = fileURLToPath(new URL('../scripts/evaluate-lifecycle-routes.mjs', import.meta.url))
const scorer = fileURLToPath(new URL('../scripts/score-lifecycle-route-responses.mjs', import.meta.url))
const casesPath = fileURLToPath(new URL('../evals/lifecycle-route-cases.json', import.meta.url))

test('deterministic route corpus passes every declared lifecycle boundary', () => {
  const result = spawnSync(process.execPath, [evaluator], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.total, 14)
  assert.equal(report.passed, 14)
  assert.equal(report.failed, 0)
})

test('provider-neutral scorer accepts exact model routes and detects one drifted route', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'porta-route-eval-test-'))
  t.after(async () => rm(root, { force: true, recursive: true }))
  const corpus = JSON.parse(await readFile(casesPath, 'utf8'))
  const responses = join(root, 'responses.jsonl')
  await writeFile(responses, `${corpus.cases.map((entry) => JSON.stringify({
    id: entry.id,
    routeInput: entry.routeInput,
  })).join('\n')}\n`)
  const accepted = spawnSync(process.execPath, [scorer, '--responses', responses], { encoding: 'utf8' })
  assert.equal(accepted.status, 0, accepted.stderr)
  assert.equal(JSON.parse(accepted.stdout).passed, 14)

  const first = corpus.cases[0]
  first.routeInput.outcome = 'package'
  await writeFile(responses, `${corpus.cases.map((entry) => JSON.stringify({
    id: entry.id,
    routeInput: entry.routeInput,
  })).join('\n')}\n`)
  const drifted = spawnSync(process.execPath, [scorer, '--responses', responses], { encoding: 'utf8' })
  assert.equal(drifted.status, 1)
  assert.equal(JSON.parse(drifted.stdout).failed, 1)
})
