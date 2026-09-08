# Second Windows machine validation

Status: PENDING. A local relocated Windows clean clone passed build, audit and LEGACY render; this is not a second physical machine result. macOS/Linux are UNVERIFIED (the current input lease requires Windows).

## Prerequisites

- Owner-granted access to the Private repository and Git.
- Node.js >=24 <25; pnpm 11.19.0 was tested with the preserved v9 lockfile.
- PowerShell 7 (`pwsh.exe`) available to Node. Do not bypass execution policy; report a denied lease as a blocker.
- Installed Edge/Chromium-family browser with an explicitly supplied executable path for smoke render.
- Codex for instruction exploration or host integration, not needed for Node tests.
- Python is not required for BUILD/AUDIT/RENDER. Optional Skill validation uses a host-provided skill-creator validator and development PyYAML 6.0.2; it is separate from portability acceptance.

## Clone and verify

After the owner publishes the validated release branch (not the historical master branch):

```powershell
git clone --branch codex/private-distribution-v1 <PRIVATE_REPOSITORY_URL> gemstone-agent-skill
Set-Location gemstone-agent-skill
git rev-parse HEAD
node --version
pnpm --version
pwsh --version
node scripts/verify-release-checkpoint.mjs
Push-Location runtime/engine
pnpm install --ignore-workspace --frozen-lockfile --ignore-scripts
Pop-Location
npm run verify:sources
npm test
node --test tests/release-host-fail-closed.test.mjs
```

Compare HEAD with the owner's recorded checkpoint. No original machine directories, copied node_modules, API keys or original source trees are needed. Governance baseline expectation: 26/26 PASS; additional release host checks: 8/8 PASS. Preserve actual counts, errors and versions; do not substitute expected output for measurements.

## Explicit technical smoke mode (not formal normal use)

The owner-authorized validation harness intentionally uses synthetic TEST-ONLY decisions. This is not a production host provider and must not be copied into a normal-use launcher.

Set GEMSTONE_BROWSER to the actual installed browser path on this computer, check it exists, then run:

```powershell
$env:GEMSTONE_BROWSER = '<ABSOLUTE_PATH_TO_INSTALLED_BROWSER_EXE>'
Test-Path -LiteralPath $env:GEMSTONE_BROWSER -PathType Leaf
Remove-Item Env:GEMSTONE_SMOKE_MODE -ErrorAction SilentlyContinue
npm run smoke
node scripts/verify-release-checkpoint.mjs
npm run verify:sources
```

The script audits the bundled Citrine, creates one synthetic test GLB, audits that GLB, and renders one LEGACY 64x64 smoke image. All four must COMPLETE and summary must PASS; missing browser yields PARTIAL, not acceptance. Output is in the printed SMOKE_ROOT temporary directory. Retain smoke-summary.json and operation records. No qualification, material calibration, promotion or RELATIONAL_PATH_V1 enablement is authorized. Do not perform visual qualification on the smoke image. Do not expect PNG hashes to be identical across different GPU/browser versions without investigation.

Citrine fixture SHA-256: `8FB9E9DBD2DA677CABD26C40C3D8FE205825196E3829CEED4B5B2547A41016E4`. It is intentionally distributed and must remain unchanged. Smoky is portability-only and is not a normal Engine sample because EXT_mesh_gpu_instancing is unsupported by current admission.

## Formal runtime execution — separate host integration

Supply real trusted authorization and object resolvers as documented in [the runtime contract](runtime/portable-runtime.md). No normal CLI auto-connects these. Missing trusted host, approval or resolver fails before adapter dispatch; the current error code is UNAUTHORIZED_OPERATION (or INVALID_REQUEST for malformed host configuration), not an automatic test fallback.

Open the clone in Codex and use:

> Read and use this repository's SKILL.md. Use the authoritative LEGACY path only; do not enable RELATIONAL_PATH_V1. Use the configured trusted host authorization provider and object resolver. Fail closed if the required governance context is unavailable. Do not use the test provider for normal execution.

## Record acceptance

Record machine identifier (non-secret), OS/Node/pnpm/PowerShell/browser versions, checkpoint ID, dependency install outcome, both test counts, source/manifest checks, the four smoke operation results and output hashes. Record no original-machine filesystem dependency, no provider fallback, LEGACY preserved and RELATIONAL disabled. Report any failure verbatim without secret values. Second-machine status changes only after these steps actually execute on another physical Windows machine.
