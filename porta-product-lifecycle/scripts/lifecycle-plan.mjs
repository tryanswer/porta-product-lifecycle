import { readProductPackage, validateProductPackage } from './product-package.mjs'

export async function readAndPlanProductLifecycle(path) {
  const validated = await readProductPackage(path)
  return planValidatedProductLifecycle(validated)
}

export function planProductLifecycle(value) {
  return planValidatedProductLifecycle(validateProductPackage(value))
}

function planValidatedProductLifecycle(validated) {
  const { package: productPackage } = validated
  const deployment = productPackage.deploymentTarget
  const distribution = productPackage.distribution
  return {
    packageDigest: validated.digest,
    packageSchemaVersion: productPackage.schemaVersion,
    product: productPackage.product,
    stages: [
      requiredStage('define', 'definition-receipt'),
      requiredStage('develop-verify', 'verification-receipt'),
      requiredStage('materialize', 'product-package-receipt', {
        adapter: productPackage.profile.kind,
      }),
      deployment
        ? requiredStage('deploy', 'deployment-receipt', {
            adapter: `${deployment.placement}-${deployment.exposure}`,
            target: deployment,
          })
        : skippedStage('deploy', 'no deploymentTarget declared'),
      distribution
        ? requiredStage('distribute', 'distribution-receipt', {
            adapters: distribution.map(({ channel }) => channel),
            destinations: distribution,
          })
        : skippedStage('distribute', 'no distribution declared'),
      requiredStage('operate-review-iterate', 'operation-review-receipt'),
    ],
    type: 'porta-product-lifecycle-plan',
    version: 1,
  }
}

function requiredStage(id, receiptKind, extras = {}) {
  return { disposition: 'required', id, receiptKind, ...extras }
}

function skippedStage(id, reason) {
  return { disposition: 'skipped', id, reason }
}
