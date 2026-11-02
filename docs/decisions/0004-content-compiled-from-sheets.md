# 0004 Clinicians keep the spreadsheets; a compiler turns them into the bank

**Status:** accepted, 2026-11

**Context.** The questions were written by clinicians in Excel, with an informal notation (`;`
lists, `_days`, `~Chest Pain`, merged cells) and some inconsistencies. Clinicians will keep editing
them.

**Decision.** The spreadsheets stay the source. `packages/bank-compiler` reads them, applies fixes
listed in `content/corrections.yaml`, checks everything and writes `content/bank/bank.json` plus
`content/bank/report.md` for clinicians. Things the sheets do not hold (red flags, codes, past
history, missing options) are YAML files beside them.

**Consequences.** Clinicians never need a developer to change wording. Sheet mistakes are reported
instead of silently breaking the app. Ids come from question text, so renaming a question can break a
red-flag rule; the build catches that as an error.
