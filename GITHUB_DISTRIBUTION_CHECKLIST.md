# GitHub distribution checklist

Current readiness: **BLOCKED — do not publish as a clone-ready product yet.**

- [x] Add user-facing README, examples and credential template.
- [x] Preserve LEGACY authority and disabled relational path.
- [ ] Select and review complete Skill/runtime/knowledge/schema files for versioning; current HEAD only contains an old DCSA checkpoint.
- [ ] Resolve portable distribution of the external production and Engine/source dependencies with owner approval.
- [ ] Declare reproducible runtime/dependency requirements for full execution.
- [ ] Review secret-scan findings and exclusions; scan the final intended Git tree/history before publication.
- [ ] Review source/asset rights and license/access terms.
- [ ] Review large audit assets and preserve authoritative evidence without indiscriminate Git add.
- [ ] Create a clean, explicitly scoped distribution checkpoint.
- [ ] Owner creates a Private GitHub repository.
- [ ] Owner adds the approved remote and intentionally pushes the selected branch; do not push unrelated tags.
- [ ] Confirm README links render on GitHub.
- [ ] Test clone on a second computer without relying on original-machine files.
- [ ] Configure personal credentials only for explicitly needed operations; no shared secrets.
- [ ] Open Codex and run the Blue Lace reference-analysis/readiness example.
- [ ] Separately authorize an implementation smoke task after readiness gates pass.

No remote steps were executed. No full runtime smoke test or qualification was run. A docs-only commit would not resolve the missing product/dependency distribution.
