# Private portable normal-use runtime

This package is for the owner and authorized private collaborators. The owner assertion covers the pinned project source and bundled Citrine portability fixture. It does not license third-party packages or confer qualification. Unknown additional source/assets must not be included without owner confirmation.

## Installation and platform

Use Node.js 24, pnpm compatible with lockfile v9, and PowerShell 7 (`pwsh.exe`) on Windows. Rendering also requires an explicitly supplied installed Chromium-family browser. Do not copy these system dependencies into this repository. Install Three.js normally:

```powershell
Push-Location runtime/engine
pnpm install --ignore-workspace --frozen-lockfile --ignore-scripts
Pop-Location
npm test
npm run verify:sources
```

Preserve the original pinned Engine package manifest/lockfile. Its historical build/preview script names are not the normal entrypoint and some are intentionally not packaged. Do not run them. No package-manager install scripts or third-party source vendoring are required.

The initial implementation uses Windows deny-write read handles. Other operating systems fail closed until an independently reviewed stable-input lease implementation exists. It is repository-location portable, not a cross-platform runtime claim. PowerShell execution policy is not changed; missing/restricted PowerShell fails closed.

## Trusted embedding boundary

Use `createTrustedHost`, `prepareOperation`, and `executeGovernedOperation` exported by `runtime/index.mjs`. There is no ungoverned normal CLI. `prepareOperation(request, host)` is read-only and returns the exact normalized operation binding and SHA-256 to present for Human approval. It does not grant permission.

The trusted host composition root supplies principal/session, an existing approved workspace and state subdirectory, and resolvers for current authorization, governance basis, Case, Candidate and Profile. Do not create this host from untrusted request JSON or use the test harness as a production approval provider. The resolvers must be backed by actual host Human decisions and actual object records; absent integrations reject rather than manufacture authority.

`resolveAuthorization(authorization_id)` returns the exact decision record with: authorization_id, human_approval_ref, principal, session, run_id, operation_id, binding_sha256, production_path=LEGACY, expires_at, execution_budget=1 and retry=false. Every operation requires its own approval. The Human event must cover normalized inputs/defaults, runtime identity, workspace, output and temporary scope shown in the binding. Caller-supplied approval files/booleans are not authority.

`resolveGovernance(operationQuery)` returns phase_id, frozen_scope_ref and `{state:'PASS',source_ref}` records for knowledge, capability, confidence, phase, approval and frozen_scope. The query contains operation/request/run/Case, input identity, effective inputs and LEGACY path. These are references to independently established governance, not new grant knobs. Unknown/denied required authority blocks dispatch. The complete resolved object records and governance basis are frozen into the approval binding; a changed Case/Profile/parent or authority basis requires fresh approval. The host must enforce its existing semantic/range/Phase rules; the thin entrypoint does not infer gemstone suitability.

Case resolution requires a real case_ref and provenance_ref. Candidate resolution requires exact candidate_ref, case_ref, immutable=true and artifact {locator,sha256,bytes}; Profile resolution requires matching real profile_ref/case_ref, committed=true and content_sha256. Resolving an ID from its syntax alone is forbidden.

## Request and context

The request has exactly schema_version='1.0.0', context_kind='OPERATION_RUN_CONTEXT_V1', request_id, run_id, authorization_id, operation_id, case_ref, profile_ref, input, output_root. Request/run tokens are restricted path-safe identifiers. Case/Profile are null only when truly absent or not applicable. A dedicated empty output directory inside the approved workspace is required for each operation, separate from runtime source and host state.

- BUILD input: materialSpec, candidateLabel, parent_candidate_ref. Requires a real Case, valid build Phase and exact approved spec. Parent is null only for first origin. Candidate identity is assigned to actual verified output, never fabricated before dispatch.
- AUDIT input: asset {locator,sha256,bytes}, candidate_ref (null for imported input). No Profile required for imported-asset audit.
- RENDER input: asset, candidate_ref, admission_ref (prior AUDIT run_id), rig, browserExecutable. Admission must match content and packaged runtime identity. No implicit render after audit.

The versioned operation context is non-authoritative temporary state. It does not reuse or relax the existing active-case Run Context schema. ACTIVE_CASE requests are rejected here, not downgraded. Existing V1 entry/runtime remains intact.

Inputs must satisfy the self-contained GLB contract, current Engine required-extension policy, no external/data URIs, no unsupported decoder or instancing path. The packaged fixture is portability-only. Normal output remains LEGACY; research activation is not exposed. Material/renderer source copies are byte-identical.

## Receipts, outputs and limitations

An exclusive receipt consumes an authorization before adapter dispatch. A receipt survives errors and prevents retry/replay within the same trusted host state root. The host must keep that root stable and protected: moving/deleting its ledger or invoking adapter modules directly defeats local governance. This is not a security sandbox against the machine owner or malicious same-user code.

Run records associate the raw adapter result, actual artifact hashes and IDs, source identity, runtime and grant. A tool-local candidate label is not a V1 Candidate reference. Audit completion does not automatically qualify an asset or accept Evidence. No Profile promotion or active Case pointer update is performed.

Failure records preserve unknown mutation state. Reconcile exact outputs before any separately authorized retry. Temporary subdirectories remain under the approved operation output root; old grants are not reused. Material semantics, qualification and publication are outside this entrypoint.

`npm run smoke` uses a synthetic trusted TEST-ONLY embedding, not a production issuer. Supply GEMSTONE_BROWSER for the bounded render check. Smoke results are technical portability tests only. Fresh-clone testing must install dependencies from the lockfile, not copy node_modules from the original project.
