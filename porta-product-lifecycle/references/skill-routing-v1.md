# Lifecycle Skill routing v1

## Contents

- Purpose and routing loop
- Capability discovery and reuse ladder
- Phase routes and exit gates
- Authority and composition rules

## Purpose

Route the complete product journey through the strongest applicable existing
Skills, repository seams, and platform adapters without turning Porta Product
Lifecycle into a second implementation framework:

`define -> develop/verify -> materialize -> preview/accept -> deploy -> distribute -> operate/iterate`

Route every entered phase before doing phase work. Re-route when the requested
terminal outcome, product type, target, risk, or available capabilities change.
Do not route skipped phases, and do not invoke a Skill merely to fill a matrix.

## Routing loop

For each entered phase:

1. **State the phase outcome.** Name the user job, terminal state, mutation
   boundary, and evidence needed to leave the phase.
2. **Classify concerns.** Select only relevant concerns: product discovery,
   requirement challenge, demand validation, architecture and reuse, design and
   accessibility, implementation discipline, stability and security,
   observability, collaboration, artifact construction, preview and acceptance,
   deployment, distribution, or operations and iteration.
3. **Discover capabilities.** Inspect applicable project instructions and search
   the repository first. Inspect available Skill metadata before loading bodies.
   Then check official platform or framework capability. For an established
   ecosystem problem still unserved, investigate a maintained open-source
   Skill, plugin, library, or reference implementation.
4. **Select the narrowest owners.** Use one lead Skill per concern. Invoke every
   project- or user-mandated Skill and only the additional Skills that materially
   reduce uncertainty or improve evidence. Do not load several overlapping
   design, research, or delivery Skills without assigning different concerns.
5. **Read selected instructions completely.** Follow their required references,
   tools, tests, and completion rules. A named Skill is not satisfied by
   paraphrasing what it probably says.
6. **Execute through the owner.** Reuse a repository public interface or native
   constructor before adding a wrapper. A sub-Skill owns its method; Lifecycle
   owns phase order, terminal outcome, authorization and evidence boundaries.
7. **Settle a Skill Route Receipt.** Record the phase, concerns, candidates
   considered, selected Skills or native owners, material rejection reasons,
   evidence produced, unresolved gates and next phase. Keep this bounded and
   local to the work report or existing task artifact. Never put prompts,
   transcripts, secrets, raw logs, source, or credentials in a Bridge event.

If no specialized Skill fits, record that result and use the best existing
repository/platform seam. Generic model knowledge is the last guidance layer,
not a reason to skip repository search, reuse research, or verification.

## Capability discovery and reuse ladder

Use this order unless evidence justifies a later rung:

1. user-named and project-mandated Skills;
2. existing project contracts, public modules, scripts, tests and adapters;
3. already available task-specific Skills;
4. stable official platform or framework capability;
5. maintained open-source Skill, plugin, library, or reference implementation;
6. a focused custom implementation owned behind one narrow project interface.

Before adopting an external capability, check functional fit, license,
maintenance/release activity, security history, dependency and bundle cost,
offline/mobile/remote-host support, API stability, testability, migration and
exit cost. Use primary sources for current claims. Do not copy substantial code
from examples without license and provenance review.

Actively search for artifact- or domain-specific Skills when the product needs
specialized output. Examples include HTML presentations, documents,
spreadsheets, diagrams, media, mobile apps, native hardware, payments, identity,
or cloud infrastructure. The example name is not authority: select only a Skill
whose installed metadata and complete instructions fit the task.

Never silently install, enable, connect, or grant authority to a Skill, plugin,
app, provider, repository, or account. Read-only discovery is not installation.
If a missing external capability is valuable, present its source, permissions,
license and risk; installation or connection needs the authority required by
the current agent/platform. A project-local Skill must never silently replace a
trusted user-level release.

## Phase routes and exit gates

### 1. Define and validate

Concerns: product discovery, user job, demand, constraints, success metrics,
scope, safety boundaries and observable acceptance.

Candidate guidance:

- use `opportunity-discovery`, `idea-validation`, community-demand or founder
  advisory Skills when the problem or demand is not yet proven;
- use `grill-me` for one-question-at-a-time requirement challenge, or
  `grill-with-docs` when accepted terminology and ADRs must change;
- use `product-development-loop`, PRD and issue-slicing Skills only after the
  decision is concrete enough to persist or execute.

Exit evidence: explicit end-user job, smallest useful scope, non-goals,
constraints, measurable acceptance and a kill/pivot/continue decision where
demand was uncertain. Do not begin construction merely because an idea is
technically interesting.

### 2. Develop and verify

Concerns: architecture and reuse, design and accessibility, implementation
discipline, dependency/provenance hygiene, data compatibility and migration,
functional completeness, performance, localization, stability and security,
observability, collaboration and platform-specific behavior.

Candidate guidance:

- use `ai-native-development` as the default campaign guide for a non-trivial
  AI-agent product build; retain the repository's architecture and verification
  rules as authority;
- use `improve-codebase-architecture` when ownership, interfaces, state or
  duplicated policy are unclear; search direct contracts before modifying the
  nearest UI or workflow;
- use the relevant frontend/product-design/prototype Skills for UI direction,
  accessibility, responsive states and interaction acceptance; use a
  domain-specific artifact Skill instead of approximating its format;
- use `porta-orchestrate-agent-work` only when work truly spans projects,
  services or resumable Agent work cells; it does not authorize parallel
  mutation by itself;
- use platform, identity, payment, security, hardware and data Skills when those
  concerns enter scope.

Before custom code, perform the reuse ladder. Prefer a deep existing interface,
then official capability, then a maintained dependency behind an adapter. Do
not build from scratch because discovery feels slower.

Verification must cover the requested journey and proportional failure modes.
For non-trivial runtime behavior, define observability before calling the phase
complete: privacy-bounded logs, useful metrics, health/readiness signals,
failure/timeout diagnostics, ownership, retention and alert/action policy.
Exercise stability and security through deterministic tests, type/lint/build
gates, performance/resource checks, compatibility or migration tests, failure
injection and runtime/device evidence as risk requires. A happy path demo with
no observability is not a stable product.

Exit evidence: accepted behavior, architecture/reuse decision, tests and build,
security/privacy findings, observability contract, platform or device evidence,
and unresolved risks. Source inspection alone is not runtime acceptance.

### 3. Build and materialize

Concerns: project-native construction, reproducibility, artifact identity,
provenance, validation and Product Package compatibility.

Candidate guidance:

- use `deliver-product` for delivery inspection, build planning, artifact
  evidence and project-native command reuse;
- use the selected domain constructor or artifact Skill (for example a web,
  presentation, document, mobile or native build Skill) to create the artifact;
- retain the project builder as authority and adapt its verified output into
  Product Package v1 rather than introducing a second build system.

Exit evidence: exact source revision, constructor and selected Skill
provenance, verified artifact bytes/tree, descriptor, validation checks and one
Product Package receipt. A build directory or successful command is not a
Product Package.

### 4. Preview and accept

Concerns: mutable feedback, exact candidate review, accessibility, target
journey and user acceptance. Preview is optional when it adds no learning, but
acceptance evidence is not optional for a claimed release.

Candidate guidance:

- use browser/product-design audit Skills for Web interaction and visual review;
- use `porta-mobile-validation-campaign` for simulator or physical-device
  campaigns involving installation prompts, biometrics or OEM permissions;
- use hardware, accessibility or platform-specific validation Skills for the
  actual target rather than extrapolating from a desktop browser.

Exit evidence: exact preview/candidate identity, tested journeys and states,
target/device/browser evidence, defects and disposition. Preview reachability
does not prove deployment, installation or distribution.

### 5. Deploy

Concerns: target placement, exposure, configuration, secrets, isolation,
rollback, runtime health, cost and exact readback.

Candidate guidance:

- use `deliver-product` as the shared deployment/evidence contract;
- use the narrow local, connected-host, container, cloud or product-specific
  deployment Skill/adapter selected by the declared Deployment Target;
- use `porta-local-project-deploy` only for an explicitly requested shared
  local gateway/public exposure, not for ordinary loopback Local Product
  Release;
- use provider-specific infrastructure/release Skills when they exist instead
  of inventing provider commands.

Exit evidence: exact artifact/revision and target, authorized mutation,
configuration/secret boundary, runtime identity, health/readiness, independent
readback, cost scope and rollback/recovery state. A deployment command's success
is not its own readback.

### 6. Distribute and release

Concerns: channel, audience, signing, listing/declarations, upload, review,
rollout, withdrawal/rollback and public availability.

Candidate guidance:

- use `deliver-product` plus the exact store, registry, download, enterprise or
  Porta Distribution Skill/adapter;
- for mobile stores, use the repository's mobile-store release Skill and keep
  signed artifact, device acceptance, internal testing, upload, submission,
  approval, rollout and public availability separate;
- for Porta Web Release, use the Bridge Workflow contract and its exact publish
  intent rather than treating deployment as Distribution authority.

Exit evidence: exact channel object and artifact, mutation receipt, provider
readback, review/rollout state and independent public evidence when requested.
Deployment means distributed only when the chosen channel contract explicitly
defines that combined terminal state.

### 7. Operate, review and iterate

Concerns: availability, reliability, security events, cost, adoption,
retention, feedback, rollback, incident learning and next-revision scope.

Candidate guidance:

- use `operations-analytics` for post-launch metrics, retention, feedback and
  experiment decisions;
- use provider/runtime operations and incident Skills for monitoring,
  diagnostics, rollback and recovery;
- return to requirement challenge, architecture, development or delivery
  routing when evidence creates a material revision.

Exit evidence is ongoing: current health/SLO signals, alert/action ownership,
cost and usage facts, feedback synthesis, incident/rollback state and a bounded
kill/keep/iterate decision. Do not stop after launch when the requested terminal
outcome includes operation, and never reuse stale launch receipts as current
health.

## Authority and composition rules

- A sub-Skill can refine methods and produce evidence; it cannot expand
  deployment, distribution, publication, account, billing, legal or destructive
  mutation authority.
- Lifecycle never marks a phase complete solely because a sub-Skill returned
  success. Check the phase exit evidence and the owning runtime/provider fact.
- Preserve one authoritative owner per fact. Do not create a second product,
  deployment, distribution, event or receipt ledger inside this Skill.
- Keep phase failures local. A failed design, build, preview, deploy or
  distribution attempt must not erase the last verified artifact or active
  release.
- Re-route instead of forcing one selected Skill through a concern it does not
  own. Keep one lead Skill per concern and explain deliberate overlaps.
