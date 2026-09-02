#!/usr/bin/env node

import { lstat, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { planLifecycleRoute } from './lifecycle-route.mjs'

const defaultCases = fileURLToPath(new URL('../evals/lifecycle-route-cases.json', import.meta.url))

export async function evaluateLifecycleRoutes(casesPath = defaultCases) {
  const corpus = await readCorpus(casesPath)
  const results = corpus.cases.map((entry) => evaluateCase(entry))
  return {
    failed: results.filter((entry) => !entry.passed).length,
    ok: results.every((entry) => entry.passed),
    passed: results.filter((entry) => entry.passed).length,
    results,
    total: results.length,
    type: 'porta-product-lifecycle-route-evaluation',
  }
}

export function evaluateCase(entry, routeInput = entry.routeInput) {
  try {
    const route = planLifecycleRoute(routeInput)
    const mismatch = findSubsetMismatch(entry.expected, route)
    return mismatch
      ? { id: entry.id, mismatch, passed: false }
      : { id: entry.id, passed: true, routeDigest: route.routeDigest }
  } catch (error) {
    return {
      errorCode: typeof error?.code === 'string' ? error.code : 'evaluation_failed',
      id: entry.id,
      mismatch: '$: route input was rejected',
      passed: false,
    }
  }
}

export function findSubsetMismatch(expected, actual, path = '$') {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length) return `${path}: array mismatch`
    for (let index = 0; index < expected.length; index += 1) {
      const mismatch = findSubsetMismatch(expected[index], actual[index], `${path}[${index}]`)
      if (mismatch) return mismatch
    }
    return null
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return `${path}: object mismatch`
    for (const [key, value] of Object.entries(expected)) {
      if (!Object.hasOwn(actual, key)) return `${path}.${key}: missing`
      const mismatch = findSubsetMismatch(value, actual[key], `${path}.${key}`)
      if (mismatch) return mismatch
    }
    return null
  }
  return Object.is(expected, actual) ? null : `${path}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
}

export async function readCorpus(path) {
  const absolute = resolve(path)
  const info = await lstat(absolute).catch(() => null)
  if (!info?.isFile() || info.isSymbolicLink() || info.size > 512 * 1024) {
    throw new Error('Route evaluation corpus must be one bounded regular file.')
  }
  const value = JSON.parse(await readFile(absolute, 'utf8'))
  if (value?.schemaVersion !== 1 || !Array.isArray(value.cases) || value.cases.length === 0) {
    throw new Error('Route evaluation corpus is invalid.')
  }
  const ids = new Set()
  for (const entry of value.cases) {
    if (
      !entry || typeof entry !== 'object' || typeof entry.id !== 'string' ||
      typeof entry.message !== 'string' || !entry.routeInput || !entry.expected || ids.has(entry.id)
    ) throw new Error('Route evaluation case is invalid.')
    ids.add(entry.id)
  }
  return value
}

async function main() {
  const tokens = process.argv.slice(2)
  let casesPath = defaultCases
  if (tokens.length > 0) {
    if (tokens.length !== 2 || tokens[0] !== '--cases') throw new Error('Usage: evaluate-lifecycle-routes.mjs [--cases <path>]')
    casesPath = tokens[1]
  }
  const result = await evaluateLifecycleRoutes(casesPath)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`)
    process.exitCode = 1
  })
}
