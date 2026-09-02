#!/usr/bin/env node

import { lstat, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { evaluateCase, readCorpus } from './evaluate-lifecycle-routes.mjs'

const defaultCases = fileURLToPath(new URL('../evals/lifecycle-route-cases.json', import.meta.url))

async function main() {
  const options = parseOptions(process.argv.slice(2))
  const corpus = await readCorpus(options.cases ?? defaultCases)
  const responses = await readResponses(options.responses)
  const byId = new Map(responses.map((entry) => [entry.id, entry.routeInput]))
  const results = corpus.cases.map((entry) => byId.has(entry.id)
    ? evaluateCase(entry, byId.get(entry.id))
    : { id: entry.id, mismatch: '$: missing model response', passed: false })
  const result = {
    failed: results.filter((entry) => !entry.passed).length,
    ok: results.every((entry) => entry.passed),
    passed: results.filter((entry) => entry.passed).length,
    results,
    total: results.length,
    type: 'porta-product-lifecycle-model-route-score',
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.ok) process.exitCode = 1
}

function parseOptions(tokens) {
  const options = {}
  for (let index = 0; index < tokens.length; index += 2) {
    const key = tokens[index]
    const value = tokens[index + 1]
    if (!['--cases', '--responses'].includes(key) || !value || Object.hasOwn(options, key.slice(2))) {
      throw new Error('Usage: score-lifecycle-route-responses.mjs --responses <jsonl> [--cases <path>]')
    }
    options[key.slice(2)] = value
  }
  if (!options.responses) throw new Error('A JSONL responses file is required.')
  return options
}

async function readResponses(path) {
  const absolute = resolve(path)
  const info = await lstat(absolute).catch(() => null)
  if (!info?.isFile() || info.isSymbolicLink() || info.size > 1024 * 1024) {
    throw new Error('Model route responses must be one bounded regular JSONL file.')
  }
  const entries = (await readFile(absolute, 'utf8'))
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  const ids = new Set()
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.routeInput || ids.has(entry.id)) {
      throw new Error('Model route response is invalid or duplicated.')
    }
    ids.add(entry.id)
  }
  return entries
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`)
  process.exitCode = 1
})
