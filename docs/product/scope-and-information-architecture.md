# Product Scope And Information Architecture

Status: Canonical

## Scope Test

A proposed feature belongs in MergePilot only if it satisfies at least one of
these tests:

1. It joins local repository evidence with remote ADO evidence.
2. It reduces repeated investigation or coordination in a delivery workflow.
3. It turns an evidence-backed recommendation into a controlled ADO action.
4. It verifies that a remote action achieved the intended state.
5. It prevents a stale, unsafe, duplicate, or poorly scoped action.

Merely listing ADO resources, duplicating an ADO editor, or adding a generic AI
summary is not sufficient.

## Target Navigation

```text
MergePilot
├─ Workspace
│  ├─ New chat
│  ├─ Work
│  ├─ Changes
│  └─ Delivery
└─ System
   ├─ Project Links
   └─ Settings
```

### Global Context

Context is a compact global control, not a navigation destination or status
dashboard.

It contains:

- Project Link identity and selector.
- Local repository path.
- Azure DevOps organization, project, and repository mapping.
- Current conversation/evidence sources.
- Built-in capability authentication and health summary.

It does not contain:

- Working-tree changes.
- Ahead/behind counts.
- Pipeline selector or history.
- PR insight actions.
- MCP server installation or registration.
- A generic project summary.

Project Link create/edit is opened from Context as a focused sheet. Project
Link stores stable identity only; branch, pipeline, PR, work item, and tool
selection are resolved at use time.

## New chat

Purpose: issue a cross-domain goal and observe a governed execution.

Required behavior:

- One user input creates one Turn with independent timing and sequence.
- Working content interleaves public action narratives and actual tool groups.
- Commands appear only when started; no speculative command list.
- Execution seals and collapses before final text streams.
- Copy and end time appear only after `turn.finished`.
- Final results link to first-class Work, Changes, or Delivery artifacts rather
  than embedding duplicate reports.

New chat is not:

- A dumping ground for page navigation.
- A substitute for structured artifact inspectors.
- A place to preload raw ADO history.

## Work

Purpose: align planned work with actual delivery state.

Views:

- `My work`: authenticated user's current and near-term items.
- `Ready for development`: items whose description and dependencies are
  sufficient to start.
- `Blocked`: items with explicit evidence of dependency, PR, CI, review, or
  environment blockers.
- `Sprint risks`: action-oriented exceptions, not a cloned board.

Primary actions:

- Refine a work item.
- Create child work.
- Link branch, commit, PR, build, or deployment.
- Draft a progress comment or state change.
- Open related Change or Delivery evidence.

## Changes

Purpose: prepare, review, and complete code changes.

Views:

- `Create PR`
- `Authored by me`
- `Needs my review`
- `Waiting / blocked`
- `All`

`Your turn` is a dynamic filter or badge inside these views, not a separate
Review Queue page or data store.

One PR Inspector owns:

- Brief.
- Change map.
- Findings and evidence.
- Threads and responses.
- Policies, builds, and linked work.
- Decision recommendation.
- Confirmed ADO actions.

`Generate insight` and `Run automated review` are replaced by one versioned
`Review Brief`. Re-analysis updates the result for the current source commit and
iteration instead of creating a second insight type.

## Delivery

Purpose: understand and act on CI, test, and deployment blockers.

Views:

- `Needs attention`: failed, partially succeeded, waiting approval, or stale
  runs that require a decision.
- `Runs`: searchable pipeline/build history.
- `Tests`: recurring failures, flaky tests, slow tests, and change-related
  evidence.
- `Environments`: current deployment, pending change, checks, and readiness.

Selecting a run opens an Inspector. It never inserts a report into chat. A
user explicitly chooses Analyze, Retry, Open in New chat, Create Bug, or another
controlled action.

## Settings

Sections:

- Account and Microsoft identity.
- Models and implicit narrator/main-agent routing.
- Action and approval policies.
- Data, privacy, retention, and diagnostics.
- Built-in capabilities.

Built-in capability cards show:

- Name, such as Azure DevOps or Web Research.
- Authentication identity.
- Read/write scopes.
- Health and last verified time.
- Reauthenticate or disconnect.

They do not show MCP manifests, package installation, tool catalogs, server
commands, or marketplaces.

## Removed Or Demoted Surfaces

| Surface | Change |
| --- | --- |
| Review Queue | Delete; preserve `Your turn` projection in Changes |
| Activity navigation | Move to searchable History/Audit drawer |
| Repositories placeholder | Delete; Project Link mapping lives in Context |
| Generic Dashboard | Delete until a validated cross-domain action inbox exists |
| PR insight preview versus automated review | Merge into one Review Brief |
| Pipeline preloaded chat report | Delete |
| Composer Project Link selector | Delete; Context is the sole selector |

## Cross-Surface Rules

- Artifact state is fetched by canonical identity and revision.
- Page state never becomes a second persistence model.
- Chat, inspectors, and history render the same underlying artifact/action
  records.
- A recommendation has one primary action and optional alternatives.
- High-risk writes never use one-click optimistic completion.
- Successful write-back updates the same visible artifact after verification.
- Links open the relevant ADO artifact when MergePilot does not own an improved
  workflow.
