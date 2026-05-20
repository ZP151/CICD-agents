# Review Agent - evaluation

This folder holds the labelled-PR dataset and the harness used to compute
precision / recall against the deployed Review Agent. The exit criterion
for Phase 3 is precision >= 0.7 on a 20-PR labeled set.

## Data shape

`labels.json` (you create this from real PR data; do not commit secrets):

```json
{
  "prs": [
    {
      "id": "PR-1234",
      "description": "Null-deref in user auth",
      "expectedCategories": ["bug"],
      "expectedSeverities": ["warning", "blocking"],
      "expectedMessageContains": ["null", "undefined"]
    }
  ]
}
```

## Run the harness (owner-driven)

The actual review responses are produced by calling `/webhooks/ado/pr` on a
deployed Review Agent with a synthesized payload, or by hitting the model
directly from a script that constructs a `CloudContextBundle`. Both
options are sketched in `eval/run.ts` as a starting point.

The pure scoring function `evaluate()` is fully unit-tested in
`test/evaluation.test.ts` and can be reused once you have actual outputs.

## Exit gate (Phase 3)

Run the harness on the 20-PR labelled set:

- precision >= 0.7
- recall >= 0.5
- average tokens-in per PR <= 12k (cost budget)

If any threshold fails, capture the lesson per `docs/poc-validation.md` and
file an ADR-0008+ before promoting the Review Agent to production.
