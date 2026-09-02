#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { lstat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const lifecycleClient = resolve(
  scriptDirectory,
  '../../porta-product-lifecycle/scripts/porta-product-lifecycle.mjs',
)

const [command, ...tokens] = process.argv.slice(2)

if (command === '--help' || command === '-h' || command === undefined) {
  process.stdout.write(
    'Porta Agent Artifact Handoff\n\n' +
    'Usage:\n' +
    '  porta-agent-artifact-handoff.mjs publish --cwd <project-root> --path <request-owned-file> --request <id> --provider <provider> --provider-session-id <id> --intent <preview-now|inbox> [--turn-id <id>] [--title <text>]\n',
  )
  process.exit(0)
}

if (command !== 'publish') {
  fail('unsupported_command', 'Only the publish command is supported.')
}

const clientInfo = await lstat(lifecycleClient).catch(() => null)
if (!clientInfo?.isFile() || clientInfo.isSymbolicLink()) {
  fail(
    'lifecycle_client_missing',
    'The sibling porta-product-lifecycle client is required for Artifact Handoff.',
  )
}

const child = spawn(process.execPath, [lifecycleClient, 'artifact-publish', ...tokens], {
  env: process.env,
  stdio: 'inherit',
})

child.once('error', (error) => {
  fail('lifecycle_client_failed', error.message)
})
child.once('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})

function fail(code, message) {
  process.stderr.write(`${JSON.stringify({ error: { code, message }, ok: false })}\n`)
  process.exit(1)
}
