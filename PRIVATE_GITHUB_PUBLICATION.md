# Owner-only Private GitHub publication

Do not push the historical master branch as the release. The intended release is an exact allowlisted snapshot on `codex/private-distribution-v1`, without research history. No remote creation, remote change, push or tag is performed by this wave.

1. Confirm the local checkpoint exists and matches the release report. If no commit was created (for example missing author identity), STOP: obtain the missing input and finish the local checkpoint first.
2. Create an **empty Private** GitHub repository under the owner's control. Do not initialize remote README/license/history.
3. Copy its HTTPS or SSH URL; never embed credentials in that URL. Inspect `git remote -v`. If no origin exists, manually run `git remote add origin <PRIVATE_REPOSITORY_URL>`; if an origin exists, verify it rather than replacing it blindly.
4. Inspect `git show --stat codex/private-distribution-v1` and `git rev-parse codex/private-distribution-v1`, matching the recorded ID.
5. Only after separately authorizing publication, run `git push -u origin codex/private-distribution-v1:codex/private-distribution-v1`. Do not use --all, --mirror, --force or push tags automatically.
6. Make this release branch the intended/default branch through GitHub settings if desired. No release tag is necessary; a future `gemstone-skill-private-distribution-v1` tag requires a deliberate owner decision.
7. Add collaborators explicitly and follow [second-machine validation](SECOND_MACHINE_VALIDATION.md).

The owner assertion covers included project source/assets for private use, not public disclosure. Third-party dependencies are installed normally under their original licenses. No API key is needed for the portability smoke. Real normal-use host providers remain a separate deployment requirement, not supplied by test fixtures.
