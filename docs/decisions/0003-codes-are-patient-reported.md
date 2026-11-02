# 0003 Codes record the reported complaint, not a diagnosis

**Status:** accepted, 2026-11

**Context.** The doctor summary must show complaints "in ICD standard". A symptom reported by a
patient before examination is not a diagnosis.

**Decision.** Each complaint carries a symptom code: WHO ICD-10 (chapter R and similar, not the US
ICD-10-CM) now, SNOMED CT as the primary code once the clinic's licence route is settled. Codes live in
`content/codes.yaml` with `verified: false` until a clinician signs them off. The summary labels them
"patient-reported, not a diagnosis" and shows unverified codes as drafts.

**Consequences.** The doctor records the diagnosis separately. Codes can be exported to other record
systems without implying a diagnosis.
