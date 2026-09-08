---
module_id: runtime:qa-certification-golden
revision: RC2
---

# Runtime QA, Certification, and Golden Governance

This module MUST load for P9, P10, QA, certification, Golden, regression, or Golden-upgrade work.

## P9 — Read-only QA / Regression

P9 is read-only. Any state-changing operation is mutation, including a minor fix. A failure returns the earliest responsible phase. The tested Candidate and QA package remain unchanged. A regression-only Task Mode may stop after reporting P9 results when no certification or upgrade transition is requested.

## Exact QA Package

Pin Candidate/Snapshot, Profile where applicable, Engine and capability manifest, Reference Set, Optical Environment, Presentation if evaluated, Protocol, seed/stochastic policy, and required artifacts/integrity identifiers. QA from one exact configuration cannot certify another.

## Gates

Maintain independent Technical, Visual, Capability, Regression, and Family-specific Gates. `PASS`, `FAIL`, `HOLD`, `UNKNOWN`, `INCONCLUSIVE`, `BLOCKED`, `NOT_APPLICABLE`, and `NOT_EXECUTED` remain distinct. Do not average Gate results.

## Optional Features

An Optional Feature may be excluded only when it is not identity-critical and its exclusion is explicit in Certification Coverage and `does_not_validate`. A Core Feature cannot be excluded to obtain PASS.

## P10 — Certification Decision

P10 evaluates the exact P9 package, including exact Snapshot identity, all required Gates, Regression, Coverage, `does_not_validate`, limitations, capability ceiling, Case lifecycle, and required Human Approval.

P10 may recommend `VALIDATED_CASE` or `GOLDEN_CANDIDATE`. It MUST NOT tune, mutate, recalibrate, change the Snapshot, or update a baseline.

## Golden

Golden requires exact Snapshot identity, a complete QA package, declared `validates`, declared `does_not_validate`, limitations, Coverage value, regression readiness, and Human Approval. Golden is immutable and Coverage-limited.

## Regression

Pin the exact Golden baseline and preserve per-Golden results. A failed regression cannot update its baseline. Missing baseline identity invalidates the regression claim. Golden status grants no mutation authority over the baseline.

## Upgrade and Breaking Change

Preserve the historical Golden. Create impact analysis, a versioned branch, earliest-invalidated-phase route, new baseline candidate, affected Golden comparison, P10 Certification, approval, and re-certification route.

## P11 Boundary — Delivery / Freeze

After P10 and required Human Approval, P11 may package, verify, deliver, and freeze the approved exact identity. P11 does not certify, promote Knowledge, tune material, or decide Golden eligibility.
