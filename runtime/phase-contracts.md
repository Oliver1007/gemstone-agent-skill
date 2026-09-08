---
module_id: runtime:phase-contracts
revision: RC2
---

# Runtime Phase Contracts

Core rules always take precedence. This module MUST load before phase-specific mutation or a phase-transition decision. Task Mode selects a route and MUST NOT redefine a Phase.

## P0 — Intake / Case Mode / Resume Routing

Resolve Task Mode, exact identities, Case role, compatibility, current state, approval, and dependencies. Create a new Run Context.

## P1 — Reference Analysis

Record observations separately from material inference. Declare Reference uncertainty. A reference-only task may complete here.

## P2 — Material + Feature Role Classification

Determine Base Family, Core Features, Optional Features, alternatives, confidence, and classification Evidence. Do not force a single Family.

## P3 — Capability / Maturity / Permission

Map required mechanisms to actual Engine capabilities and maturity. Determine Action Permission using Knowledge, capability, confidence, Phase, approval, Frozen Scope, and exact identity. Do not use Case Certification status as a prerequisite for ordinary permitted mutation.

## P4 — Geometry

Validate identity-critical geometry, physical scale, topology, normals, interfaces, cavities, and optical paths. Geometry changes invalidate dependent downstream Evidence.

## P5 — Clean Physical Foundation + Core Identity System + Optical Environment Foundation

Establish the minimum clean physical mechanism set, identity-critical Core Features, and required Optical Environment foundation. Do not mask foundation defects with secondary noise, inclusions, bands, fibers, cracks, or decoration.

## P6 — Reference Calibration + Identity-Relevant Optical Environment Calibration

Calibrate material identity and identity-relevant Optical Environment only within Allowed Scope using discriminating Evidence and minimal changes. Geometry remains Frozen unless Review authorizes a new P4 Run.

## P7 — Secondary Natural Structure + Optional / Non-Core Features

Add only authorized secondary or optional structure after the physical base and Core identity are stable. Each addition requires a defined role, scope, Evidence, and Complexity Budget.

## P8 — Hero / Visible Presentation

P8 is presentation-only. It may include presentation camera, crop, visible background, presentation-only lighting, contact shadow, framing, Hero composition, and presentation polish.

It MUST NOT perform material fitting, material stabilization, optical identity calibration, hidden correction, or identity-relevant Optical Environment mutation.

A Presentation-only change preserves the Material Candidate and creates a new Presentation where required. If an identity-relevant Optical Environment change is needed, return to P6, or P5 if the physical foundation is affected.

## P9 — Read-only QA / Regression

P9 is immutable evaluation. No Candidate, Profile, Presentation, Optical Environment, Protocol, Golden, or baseline mutation is permitted. Return failures to the earliest responsible phase. A regression-only Task Mode may stop after the P9 report.

## P10 — Certification Decision

Evaluate exact Snapshot identity, QA Gates, Regression, Coverage, limitations, capability ceiling, certification lifecycle, and required Human Approval.

Possible outcomes include `PASS`, `HOLD`, `FAIL`, `RETURN_TO_PHASE`, `REVIEW_REQUIRED`, `VALIDATED_CASE`, and `GOLDEN_CANDIDATE` recommendation.

P10 MUST NOT tune, mutate, recalibrate, replace the Snapshot, or update a baseline. Golden promotion remains a recommendation until Human Approval.

## P11 — Delivery / Freeze / Case Closure

Verify and deliver the exact approved identity, including Certified Snapshot/Profile consistency, package integrity, known limitations, frozen state, approval provenance, delivery verification, and task closure.

P11 MUST NOT perform material fitting, certification, Knowledge promotion, Golden decision-making, or architecture transition.

Knowledge Promotion Review is a separate governance workflow. Golden Upgrade is a Task Mode that reaches P11 only after affected work, P9, P10, and required approval.

## Invalidation

- Hero crop or framing only → P8
- identity-relevant Optical Environment change → P6
- Optical Environment foundation change → P5
- Geometry identity change → P4

Preserve historical objects and mark dependent Evidence stale or revalidation-required.
