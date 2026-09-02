import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { planLifecycleRoute } from '../../scripts/lifecycle-route.mjs'

export function writePackageRouteReceipt(directory, name = 'package-route-receipt.json') {
  const route = planLifecycleRoute({
    explicitMutationIntent: false,
    object: { kind: 'product', ref: 'product_current' },
    outcome: 'package',
    portaContext: 'trusted',
    runKey: null,
    schemaVersion: 1,
    target: { kind: 'none', ref: null, source: 'none' },
  })
  const receiptPath = join(directory, name)
  writeFileSync(receiptPath, JSON.stringify(route))
  return receiptPath
}
