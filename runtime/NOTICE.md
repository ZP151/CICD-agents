# Python POC - FROZEN

This `runtime/` tree (and the `cli/` and `tests/` siblings) holds the v1 Python
POC of the Local Agent Runtime. As of the v2 migration kickoff it is
**frozen to bug fixes only** and is replaced by the Node.js / TypeScript
implementation under `packages/`.

## What this means

- New features land in `packages/core`, `packages/daemon`, `packages/cli`,
  and `packages/review-agent`.
- Bug fixes against the Python tree are still accepted but require:
  - a linked issue describing why the fix cannot wait for the v2 stack to
    land, and
  - a brief note in the issue confirming the same bug class is filed (or
    fixed) against the equivalent TypeScript module.
- The Python tree is excluded from the GitHub Actions matrix (see
  `.github/workflows/ci.yml`).

## Tagging

Once you (the repo owner) have validated the v2 daemon end-to-end on a real
ADO repository, please tag the last good Python commit:

```bash
git tag python-poc-final
git push origin python-poc-final
```

After tagging, the `runtime/`, `cli/`, `tests/`, `pyproject.toml`, and
related Python files can either:

- be moved under `python-poc/` (recommended), or
- removed entirely once the v2 stack reaches feature parity in production.

This decision is intentionally left to the owner because it involves git
history mutation; the v2 code does **not** depend on the layout.
