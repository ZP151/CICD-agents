# MergePilot Support Runbook (2026-08-05)

## Collect diagnostics

1. Settings → Diagnostics → copy the correlation ID.
2. `GET /delivery/diagnostics` (daemon) for telemetry + kill-switch state.
3. `GET /delivery/actions/:id` for any action record (audit trail).
4. `GET /delivery/evidence/:buildId?projectLinkId=…&definitionId=…` for a
   failed run's bounded, redacted evidence bundle.

Never share: tokens, `.env`, `config.toml`, auth-cache.json, raw build
logs, or unredacted payloads. The evidence endpoint redacts and bounds
logs for support use.

## Auth problems

- Sign in → Microsoft: the deep link is `mergepilot://auth/complete`
  (credential-free); the desktop focuses the auth modal after callback.
- `/auth/status` shows authenticated identity + fromCache; `/auth/me`
  silently refreshes the credential.
- Reauthenticate from Settings → Account; sign out clears the local user
  snapshot but never deletes tokens from the OS credential store.

## Action runtime problems

- A proposal fails with "action carries no verification predicates": the
  model omitted expected_result; the tool derives kind-appropriate default
  predicates — check the action record's failure detail.
- "target revision moved": the proposal is stale (safe refusal). Re-read
  the artifact (`GET /delivery/artifacts/work_item/:id`) and re-propose
  with the current revision.
- "duplicate execution refused": the same idempotency key already ran;
  use a new key for a new logical write.
- Kill switch: Settings → Built-in capabilities → "Allow approved remote
  writes" or `PUT /delivery/writes-enabled`.

## Slow or failed model calls

- `turn.waiting` after ~5 s is a transport diagnostic, not canned text.
- `MERGEPILOT_STREAM_TIMEOUT_MS` bounds the first-chunk wait (default
  60 s); a hard abort at 15 s was removed.
- Embedding failures ("embed call failed; retrying") with empty inputs
  were fixed; if they reappear check `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`.

## Restart/recovery

- `DeliveryActionRuntime.resumeVerification()` re-verifies in-flight
  records after restart; it NEVER re-executes a write.
- A record in `executing` without `executedAt` fails with re-propose
  guidance — do not blind-retry.

## Known limitations

- Deploy E2E requires a YAML environment stage in the fixture pipeline.
- Installer packaging is not yet produced (see
  `docs/windows-code-signing.md`).
- The pilot task set and evaluation fixtures are seeded in ClaimBot_API;
  role-based runs are the next iteration.
