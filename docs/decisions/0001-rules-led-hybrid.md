# 0001 Rules run the interview; AI only transcribes and matches answers

**Status:** accepted, 2026-11

**Context.** The clinic already has a structured question bank. A chatbot that lets an LLM decide
what to ask, or write the note, can skip questions, miss red flags or invent findings, and gives
different results each time. Small local models make these mistakes more often than large ones.

**Decision.** The rules engine (`packages/engine`) decides every question, linked complaint and red
flag from the clinicians' content. The note is filled from the clinicians' templates. The LLM's only
job is to map a spoken answer to one of the allowed options, with its output forced to a JSON schema
of those options. Simple answers (yes/no, numbers, durations, option words) are matched without the
LLM. The patient confirms every voice answer.

**Consequences.** Behaviour is predictable and testable, and works when the LLM is down (patients
tap). Conversation is less free-flowing than a pure chatbot; the voice and read-back make up for it.
