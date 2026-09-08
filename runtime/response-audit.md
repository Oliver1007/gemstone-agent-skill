---
module_id: runtime:response-audit
revision: RC1
---

# Runtime Response and Audit

This module MUST load for formal Review or Audit and MAY load for ordinary progress reporting.

## Status Vocabulary

Use exact statuses such as `PASS`, `FAIL`, `HOLD`, `BLOCKED`, `REVIEW_REQUIRED`, `INCONCLUSIVE`, `UNKNOWN`, `UNVERIFIED`, `NOT_APPLICABLE`, `NOT_EXECUTED`, `NO_ACTION_REQUIRED`, and `FREEZE_CANDIDATE`.

Do not substitute UNKNOWN with FALSE or NOT_APPLICABLE with PASS.

## Default Response

State Task Mode, Phase, exact target identity, Frozen and Allowed Scope when relevant, Evidence status, Decision, action, limitations, and next or terminal state.

## Mutation Response

State the new Candidate, parent Candidate, exact changed domain, unchanged Frozen domains, Tool Result status, Evidence acceptance status, and rollback/review conditions.

## Blocked Response

State the blocker, missing authority/object/capability/Evidence/module/schema, claim that cannot be made, and safe recovery route.

## Review Response

State the exact object/version, proposed action, scope, reason, impact, regression implications, and approval requested. Generic approval language is insufficient.

## Scoped Completion

Reference-only completion is “Reference analysis completed.” Diagnosis-only completion is “Diagnosis completed.” Neither implies that the Case, material, QA, or certification is complete.

## Learning State

Use Case Finding or Knowledge Candidate until promotion gates pass. Do not report a Family Rule merely because one Case produced a useful result.

## Audit

Reconstruct identity, lineage, Tool Results, accepted Evidence, Decisions, artifacts, Protocol, Knowledge sources, approvals, and limitations. Provide recorded rationale and provenance without exposing private chain-of-thought.
