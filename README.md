# Porta Product Lifecycle

Porta Product Lifecycle is an Agent Skill for guiding a product through a
branching, evidence-bearing lifecycle:

`define -> develop/verify -> materialize -> [deploy?] -> [distribute?] -> operate/review/iterate`

The installable package is
[`porta-product-lifecycle/`](porta-product-lifecycle/). It standardizes an
exact Product Package handoff, plans local/remote/cloud placement independently
from distribution, and retains Porta's fail-closed Bridge publication contract.
Installation, discovery, package verification, and lifecycle planning never
start a WorkRun or authorize deployment or distribution.

## Install

Use the immutable release `porta-product-lifecycle-v1.0.0`. A trusted Agent
must resolve the annotated tag, compare its full commit SHA with Porta's
catalog, and install the complete `porta-product-lifecycle/` subdirectory at
user scope. Never install from a moving branch.

For manual inspection:

```bash
git clone --branch porta-product-lifecycle-v1.0.0 --single-branch \
  https://github.com/tryanswer/porta-product-lifecycle.git
cd porta-product-lifecycle
git rev-parse HEAD
```

- Codex: install at user scope, then start a new Agent session for discovery.
- Claude Code: install at user scope, then use its native Skill reload.
- Gemini CLI: install at user scope, then use `/skills reload`.

The new Skill is an independent `1.0.0` identity. It is not an in-place
semver update of `porta-workflow`. Historical Workflow records remain
readable through Porta's legacy adapter, while new runs and receipts use only
`porta-product-lifecycle`.

## Package and plan

Validate an exact Product Package declaration:

```bash
node porta-product-lifecycle/scripts/porta-product-lifecycle.mjs \
  package-verify --spec /absolute/path/product-package.json \
  --package-root /absolute/path/package-root
```

Plan the requested branching stages without mutation:

```bash
node porta-product-lifecycle/scripts/porta-product-lifecycle.mjs \
  lifecycle-plan --spec /absolute/path/product-package.json
```

Product Package verification reads the actual bounded regular-file tree,
rejects undeclared, linked, special, or changing entries, and validates exact
file or directory-tree digests. It does not run an artifact.

## Publication boundary

Explicit `$porta-product-lifecycle` invocation is supported. Natural-language
selection is allowed only where declared by the Skill. A Porta Web
distribution WorkRun requires the current user message to unambiguously request
publication and trusted current Porta/Bridge context to identify the exact
target. Development, preview, package verification, deployment planning,
installation, and discovery do not grant publication authority.

## Verify

```bash
node --test tests/*.test.mjs porta-product-lifecycle/tests/*.test.mjs
```

## License

MIT. See [LICENSE](LICENSE).
