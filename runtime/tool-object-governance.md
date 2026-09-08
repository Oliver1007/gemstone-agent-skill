---
module_id: runtime:tool-object-governance
revision: RC1
---

# Runtime Tool and Object Governance

This module MUST load before mutation, write, Tool-result acceptance, or Evidence acceptance.

## Exact Target

Resolve exact object type, ID, version, parent, expected hash or equivalent identity, and current authorization. Do not retarget implicitly from a stale pointer.

## Mutation

A mutation requires a valid Phase, Allowed Scope, non-Frozen target domain, exact target, supported parameter/range, required coupling Evidence, and sufficient capability and approval.

Every mutation creates a new immutable Candidate with parent lineage. Do not overwrite Candidate, Profile, Golden, baseline, or historical Evidence.

## Tool Behavior

No silent clamp, coercion, fallback, special case, range substitution, architecture rewrite, or unrecorded coupled change. Global blind search is prohibited. Shader or Engine architecture changes route to Capability Development or Breaking Change review.

## Tool Result

Record requested action, actual action, target identity, status, outputs, warnings, limitations, mutation-state knowledge, and artifacts. Tool success is not Evidence or Phase PASS.

## Evidence Acceptance

Confirm exact target, Candidate, Protocol, ROI, mask, units, color space, exclusions, conditions, completeness, integrity, and relevance. Reject or limit stale, partial, wrong-target, wrong-ROI, or incompatible outputs.

## Failure Recovery

If no mutation occurred, a safe retry may be allowed. If mutation state is unknown, inspect exact state before retry. Never issue a blind retry that may duplicate or overwrite a mutation.

## Capability and Approximation

Unsupported identity-critical capability blocks validated implementation. A Prototype or artistic approximation must disclose its mechanism gap and certification ceiling.
