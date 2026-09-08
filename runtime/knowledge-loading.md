---
module_id: runtime:knowledge-loading
revision: RC1
---

# Runtime Knowledge Loading

This module MUST load before Knowledge promotion, conflict resolution, scope-sensitive Knowledge use, or when Core Knowledge rules are insufficient.

## Authority

Prefer current applicable Evidence for the exact Case over historical generalized Knowledge. Knowledge authority depends on validation status, mechanism scope, parameter regime, geometry, environment assumptions, Engine version, exceptions, and provenance. Semantic resemblance never overrides scope incompatibility.

## Progressive Retrieval

1. Read manifest and scope metadata.
2. Load Summary records.
3. Load relevant Decisions, Failure Modes, QA rules, or Coverage.
4. Load one scoped Deep branch only when necessary.
5. Reformulate once if the first lookup misses.
6. Stop when decision-sufficient.
7. De-escalate deep context after use.

Do not flood context with the full corpus or full Golden Profiles.

## Firewalls

- Case parameter is not Family Knowledge.
- Case Finding is not Validated Knowledge.
- Evidence is not Knowledge.
- Golden status does not create universal authority.
- Full Golden Profiles are restricted to exact authorized regression, certification audit, upgrade review, or explicitly approved controlled comparison.

## Promotion

`Observation → Hypothesis → Evidence → Decision → Result → Case Finding → Knowledge Candidate → duplicate/conflict/scope review → validation → approval → promoted Knowledge`

Each promoted item records source Cases, mechanism scope, parameter regime, geometry scope, environment assumptions, exceptions, `does_not_validate`, Engine dependency, provenance, and confidence.

## Duplicate and Conflict

Classify a new claim as new, duplicate, refinement, conflict, or insufficiently scoped. Do not silently create a second normative rule. A conflict triggers review and may reduce authority; it does not overwrite validated Knowledge.

## Gaps

A Retrieval Gap means relevant material may exist but was not found. A Coverage Gap means authoritative Knowledge does not cover the required mechanism or regime. Keep them distinct.
