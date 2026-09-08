# Gemstone Material Agent Skill

## What This Project Does

This repository contains instructions, knowledge, schemas and governed integration work for reference-driven gemstone materials. It helps Codex analyze references, identify material mechanisms and plan authorized material work. It is not a standalone image-to-3D application or a hosted API.

**Portable runtime is implemented:** the bounded project runtime and Engine sources are included, and Windows local clean-clone smoke validation passed. The private release checkpoint uses the exact release manifest on `codex/private-distribution-v1`; the historical development branch is not the distribution. Confirm the recorded checkpoint ID before publication. No push is performed by release preparation.

## Current Production Status

The authoritative production path is **LEGACY**. The required production subset is included byte-for-byte under `runtime/production`. `RELATIONAL_PATH_V1` remains not Canonical V2 qualified, not promoted and disabled by default. Technical completion is not qualification success; `FAIL_TO_QUALIFY` does not prove global semantic absence.

## Requirements

| Scope | Requirements |
| --- | --- |
| Normal instruction/reference use | Git, Codex access, and the versioned `SKILL.md`, `runtime/`, `manifests/`, knowledge and schema resources |
| Optional integration/diagnostics | Node.js for `.mjs` helpers; Python for `.py` helpers; exact requirements depend on the selected authorized operation |
| Bounded normal operations | Node.js 24, PowerShell 7 on Windows, frozen Engine dependencies; explicit Chromium-family browser for render; trusted host authorization/identity providers |

The root `package.json` provides tests and source verification; runtime dependencies use the preserved `runtime/engine/package.json` and `pnpm-lock.yaml`. `requirements-dev.txt` is development-only. Follow [portable runtime installation](runtime/portable-runtime.md); no Blender or Python runtime is required for the three normal adapter operations. Cross-platform and independent second-machine validation are not claimed.

For optional local Skill validation, the verified Windows development setup is:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
```

Run the host-provided skill-creator `quick_validate.py` with this interpreter and `-X utf8`, passing this repository as the target. That validator belongs to the host and is not bundled here; its PASS is separate from runtime smoke validation.

## Installation

After the owner has published the verified private release checkpoint:

```sh
git clone --branch codex/private-distribution-v1 <PRIVATE_REPOSITORY_URL> gemstone-agent-skill
cd gemstone-agent-skill
```

No dependency installation is required merely to read the skill instructions. For execution, install the frozen Engine package dependencies and use the governed entrypoint described in [runtime/portable-runtime.md](runtime/portable-runtime.md). Do not reuse historical audit paths as configuration or treat the test authorization provider as a production issuer.

## Environment Setup

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Only for the optional OpenAI reference-analysis provider | Read by `integration/reference-analysis/providers/openai/openai-responses-vision-provider-v1.mjs` |
| `LOCALAPPDATA` | OS-provided Windows default, when using storage resolvers | Local candidate/run-context storage base |
| `HOME` | OS-provided macOS/Linux default, when using storage resolvers | Local candidate/run-context storage base |

`.env.example` contains only the optional provider key placeholder. The inspected provider reads `process.env`; **it does not automatically load `.env`**. Configure the variable through your local launcher/environment before an explicitly authorized provider call. Do not overwrite OS home variables. No API key is needed to read instructions or perform offline analysis.

Each user/computer must provide its own local credentials. API keys and tokens must never be committed to Git. Reference-provider calls send selected image data externally; obtain permission before using them.

## Quick Start

### A. Repository/Skill exploration

Read `SKILL.md`, inspect examples, and run the safe source checks and governance tests in [SECOND_MACHINE_VALIDATION.md](SECOND_MACHINE_VALIDATION.md). Reading instructions requires no runtime grant.

### B. Formal runtime execution

Real authorization and object resolution must be connected first. Automated smoke testing is an explicitly separate test mode, not formal normal use.

## Host integration

Normal production-style use requires a trusted host authorization provider and object resolver. The bundled test provider is for automated validation only and must not be used as the normal-use authorization source. There is no fallback to test providers and no implicit authority from opening Codex.

The trusted composition root calls `createTrustedHost` with `resolveAuthorization`, `resolveGovernance`, `resolveCase`, `resolveCandidate`, and `resolveProfile`, plus principal/session and approved workspace/state paths. See [the exact existing contracts](runtime/portable-runtime.md). A missing host or callback fails closed before adapter dispatch (`UNAUTHORIZED_OPERATION`; malformed configuration can return `INVALID_REQUEST`). This is local trusted embedding, not a sandbox against the machine owner.

Windows local clean-clone validation is PASS. A second physical Windows machine is PENDING; macOS/Linux are UNVERIFIED. Follow [the second-machine checklist](SECOND_MACHINE_VALIDATION.md) and [owner-only Private publication steps](PRIVATE_GITHUB_PUBLICATION.md). Do not publish historical master or assume a checkpoint exists until its ID is recorded.

### Exploration steps

1. Confirm your checkout contains `SKILL.md` and its five referenced runtime modules.
2. Read [FINAL_STATUS.md](FINAL_STATUS.md) and verify the intended task scope.
3. Open the directory in Codex and ask it to inspect `SKILL.md` and applicable repository instructions.
4. Start with reference analysis only. Missing Engine identity or dependencies must block execution, not trigger a fallback.

The historical development HEAD is not a Skill distribution. Use the explicit release checkpoint manifest and recorded release ID, not the earlier distribution checklist's historical status.

## Using the Skill in Codex

Opening a repository does not itself guarantee automatic skill installation/discovery. Explicitly ask Codex to read and use the repository's `SKILL.md`. Provide:

```text
Gemstone:
Form:
Target engine:
Reference images:
Visual intent:
Constraints:
Desired output:
```

Require the current authoritative path, exact input/source identities and a declared authorization boundary. Existing historical approvals do not automatically authorize a new material run.

## Example Prompts

Use [Blue Lace Agate](examples/blue-lace-agate-codex-prompt.md) or [Sakura Agate](examples/sakura-agate-codex-prompt.md). They request analysis and readiness checks first; implementation/preview proceeds only if dependencies and scope are explicitly established. These are usage examples, not qualification fixtures or promises that either material is qualified.

## Reference Images

Attach images in the Codex session or place them in ignored `local-references/`. Do not commit personal or third-party images without permission. State whether views show the same physical sample or different samples; distinguish synthetic references from photographs. A reference image alone cannot establish physical constants.

## Project Structure

- `SKILL.md`: governed skill entrypoint.
- `runtime/`: five instruction modules plus governed entrypoint, pinned production/Engine subset and portability fixture.
- `knowledge/`, `schemas/`, `manifests/`, `registry/`: bounded knowledge and identity contracts.
- `integration/`: historical and current integration work; inspect authority/version before execution.
- `cases/`, `golden/`: governed case/source references, not blanket permission to reuse assets.
- `audit/`: engineering evidence; start with [the phase index](audit/GSI_V1_AUDIT_INDEX.md).
- `staging/`, `tmp/`: research helpers and local outputs; not normal end-user entrypoints.

The required subset is now included under `runtime/production` and `runtime/engine`; the original research trees remain separate and unchanged. Historical absolute paths are provenance, not portable setup instructions.

## Experimental / Non-Promoted Features

Do not enable `RELATIONAL_PATH_V1` through Quick Start. Generic/Blue Lace qualification and production promotion remain blocked. Preserve causal observation export, zero-semantic adapter, stage taps and root-input-selection infrastructure; qualification failure is not a reason to remove them.

## Troubleshooting

- **Missing SKILL.md/modules after clone:** verify the branch and checkpoint ID; do not use the old DCSA checkpoint as a complete distribution.
- **Missing Engine/source or source hash mismatch:** verify the distribution manifest and install frozen dependencies. Do not change identities to bypass checks.
- **Missing trusted host or approval:** dispatch is intentionally blocked; implement the documented host binding using actual decisions and object records, not test grants.
- **PowerShell/browser unavailable:** install the documented system dependencies; do not weaken the input lease or change renderer semantics.
- **Provider credential unavailable:** configure your own process environment; copying `.env.example` alone does not load it.
- **Historical targeted PASS conflicts with current status:** outcome-only Canonical V2 adjudication governs. See the audit index.

## Development Status

GSI targeted implementation is technically complete and closure certified; Canonical V2 qualification remains `FAIL_TO_QUALIFY`. Root cause is not isolated. See [FINAL_STATUS.md](FINAL_STATUS.md), [audit index](audit/GSI_V1_AUDIT_INDEX.md) and [FUTURE_RESEARCH.md](FUTURE_RESEARCH.md). No new development cycle is authorized by these instructions.

## License / Access Notes

The owner has asserted private redistribution rights for the required project-owned source/config/assets; see [PRIVATE_DISTRIBUTION.md](PRIVATE_DISTRIBUTION.md). Third-party dependencies retain their own licenses and are installed normally, not vendored. Unknown additional files require owner confirmation. Public disclosure is not authorized. Private visibility does not make secret publication safe.

## Use on another computer

After the owner publishes the reviewed file set, clone using the commands above and follow the portable runtime installation instructions. Configure only required system dependencies and actual trusted host bindings. Open the checkout in Codex and explicitly request the skill. A new material run requires its own exact authorization; no relational capability enablement is implied.

## Collaborator workflow

Owner grants GitHub collaborator access → collaborator clones → verifies package/dependency completeness → configures personal local environment → opens Codex → supplies gemstone task and references → resolves authorization before execution. Do not share API keys. No remote has been created or pushed by this preparation.
