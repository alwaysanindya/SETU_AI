# Content

Everything the interview asks and everything the doctor summary says comes from this folder.
Code never contains clinical wording. To change a question, change the content and rebuild the bank.

| File | Who edits it | What it holds |
| --- | --- | --- |
| `source/complaints.xlsx` | Clinicians | Complaint questions, answer options and note templates (sheet "Chief Complaints") |
| `source/personal-history.xlsx` | Clinicians | Lifestyle and personal history questions (habits, gender-specific, sleep, diet) |
| `personal-history-options.yaml` | Clinicians | Answer options for the personal-history choice questions (missing from the sheet) |
| `past-history.yaml` | Clinicians | Past medical history questions (not in either sheet yet) |
| `red-flags.yaml` | Clinicians, signed off by the clinical safety lead | Rules that pause the interview and alert staff |
| `codes.yaml` | Clinicians | WHO ICD-10 and SNOMED CT codes for each complaint |
| `corrections.yaml` | Developers, reviewed by clinicians | Fixes for sheet errors, so the sheet itself stays untouched until clinicians update it |
| `groups.yaml` | Clinicians | Which complaints appear under each chief complaint picture |
| `bank/bank.json` | Generated, never edit by hand | The compiled bank used by the app |
| `bank/report.md` | Generated | Every warning found while compiling, for clinicians to fix in the sheet |

Rebuild with `pnpm bank:build`. The build fails on errors (for example a "~" link to a complaint that
does not exist) and lists warnings in `bank/report.md`.

**Status of clinical content:** every red flag and code in this folder is a DRAFT written by the
development team. Nothing may be used with patients until a named clinician has reviewed it and set
`approved: true` / `verified: true`.
