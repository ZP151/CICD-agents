# POC validation checklist

The Python POC at `/runtime` and `/cli` is the workflow validator. Before
the v2 migration kicks off (Phase 1), run the POC against at least one
real Azure DevOps repository to surface protocol issues, profile gaps,
and prompt quality problems.

This document is the checklist. Fill in the "Notes" column as you go and
copy the lessons into ADR-0008 if any of them invalidates an earlier
decision.

## Pre-flight (owner: developer running the validation)

- Azure OpenAI deployment available; `AZURE_OPENAI_CHAT_DEPLOYMENT`
and `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` set in `.env`.
- Azure DevOps PAT stored: `dev-agent configure-pat`.
- `AZURE_DEVOPS_ORG` and `AZURE_DEVOPS_PROJECT` set in `.env`.
- Profile present in `runtime/config/profiles.yaml` for the repo type;
the `azure_devops.repository` field is populated.

## Scenarios

For each scenario record: duration, total prompt + completion tokens,
plan risk_level, whether the PR opened cleanly, and whether the build /
test steps reported `ok`.


| ID  | Repo                                 | Branch / Diff                         | Scenario                                                         | Notes |
| --- | ------------------------------------ | ------------------------------------- | ---------------------------------------------------------------- | ----- |
| S1  | small Python service                 | feature branch with 1 file modified   | submit-pipeline, no work item, no trigger                        |       |
| S2  | medium .NET API                      | feature branch with 5+ files modified | submit-pipeline, --work-item, --trigger-pipeline                 |       |
| S3  | TS frontend                          | added a new component + a test        | submit-pipeline, --draft                                         |       |
| S4  | repo with empty diff                 | no committed changes vs target        | submit-pipeline (should produce a "no changes" plan and skip PR) |       |
| S5  | repo with non-existent target branch | typo in --target-branch               | submit-pipeline (should fall back to HEAD diff and warn)         |       |
| S6  | repo too large for index             | > 5k files                            | indexer should respect ignored_globs and complete < 60s          |       |


## Lessons template

For each lesson learned, copy the block below into a section at the bottom
of this file. Do **not** edit any ADR file directly; if a lesson reverses
an ADR, write `docs/adr/0008-<short-name>.md` instead.

```
### Lesson L<n>: <one-line>

Severity: low | medium | high
Scenario(s): S1, S2, ...
What happened:
Why it matters:
Proposed action:
Owner:
```

## Exit criteria

- All 6 scenarios executed.
- No high-severity lesson left unaddressed (either fixed in the POC,
or captured as an explicit Phase 1 acceptance test, or recorded as
an ADR-0008+).
- Average tokens-per-task captured (informs cost model in ADR-0004).
- Average task duration captured (informs streaming UX in Phase 2).

