# How the question sheets are read

The compiler (`packages/bank-compiler`) reads `content/source/complaints.xlsx`, sheet "Chief
Complaints", columns:

| Column | Meaning |
| --- | --- |
| A Chief complaint group | Filled on the first row of a group ("Pain") |
| B Complaint | Filled on the first row of a complaint ("Headache") |
| C Question | Filled on the first row of a question |
| D Possible answers | The answers, see below |
| E History note format | How the answer is written in the note |

A row with an empty question column adds more answers to the question above it.

## Possible answers (column D)

| Written as | Read as |
| --- | --- |
| `Mild;Moderate;Severe` | Three answer buttons. `;` is the separator to use |
| `Yes/No`, `a,b`, `a: b` | Also buttons, but reported as a warning (use `;`) |
| `_days` | A number of days |
| `_freq`, `[number]`, `[enter # ...]` | A number |
| `[date]` | A date |
| `[describe]`, `Description box` | Free text |
| `Others[describe]` | A button that also asks for text |
| `Climbing stairs [enter # of stairs]` | A button that also asks for a number |
| `Yes (Send patient immediately ...)` | Button "Yes"; the bracket is a staff instruction shown to staff and the doctor |

A question whose text contains "associated" or "other symptom" allows several answers. "None",
"Nil", "No", "Did not move" and "Same place" then clear the other answers.

## Note format (column E)

| Written as | Example result |
| --- | --- |
| `_ days` | `3 days` (`1 day` for one) |
| `started _` | `started upper centre` (`Upper(C)` reads as "upper centre", `Arm(L)` as "left arm") |
| `Associated with _` on several answers | `associated with sweating and extreme anxiety` |
| `Fever_/_` on a Yes/No question | `Fever +` or `Fever -` |
| `No fit/Fit yes` on a Yes/No question | `No fit` for No, `Fit yes` for Yes |
| `did not move` | used as written |
| `brought on by _ ~Chest Pain` | the note, and the patient is also asked the Chest Pain questions |
| `Married;Unmarried` next to `Yes;No` | one note per answer |

## Linked complaints

`~Name` at the end of a note format links to another complaint. Names are matched ignoring case and
spacing; spelling differences are fixed in `content/corrections.yaml` (`Vomitting` → `Vomiting`).
Chest pain and difficulty in breathing are asked next; other linked complaints are asked at the end.

## Ids

Every complaint, question and answer gets an id from its text: "Where did it start?" →
`where-did-it-start`. Red flags and codes use these ids. The full list is at the end of
`content/bank/report.md`. Changing the wording in the sheet changes the id, so check red flags
after editing.

## Personal history workbook

`content/source/personal-history.xlsx`, one sheet per section, header `# | Question | Type | Gender
| Status | Required`. Types: BOOLEAN (Yes/No), NUMBER, DATE, TEXT, SINGLE-SELECT, MULTI-SELECT.
Choice questions need their options in `content/personal-history-options.yaml`; until then they are
left out and listed in the report.
