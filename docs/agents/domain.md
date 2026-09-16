# Domain Docs

Read `CONTEXT.md` at the repository root and relevant ADRs in `docs/adr/` before exploring an area. Missing files are normal and should not be flagged.

This repository uses a single-context layout:

```text
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

Use glossary terms from `CONTEXT.md` consistently in issue titles, implementation plans, test names, and code documentation. Avoid synonyms that the glossary explicitly rejects.

If a required concept is absent from the glossary, reconsider whether the new term is necessary or record the gap for `domain-modeling`.

If proposed work contradicts an existing ADR, surface the conflict explicitly instead of silently overriding the recorded decision.
