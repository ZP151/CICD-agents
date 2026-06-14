# Manual Agent Capability Test Matrix

This checklist is for manual regression testing of the current Chat-first CI/CD
agent. It focuses on the real product goal: a local desktop agent that can
understand a repository, manage safe Git/CI/CD work, and provide Azure DevOps PR
insight with typed tool proposals, approval, execution evidence, and next-step
guidance.

Use this document after installing a new build, testing a development build, or
checking a focused change in the Chat workflow.

## Result Legend

| Mark | Meaning |
| --- | --- |
| Pass | Behavior matches the expected result. |
| Partial | Core path works, but UI state, missing fields, evidence, or edge cases are incomplete. |
| Fail | Behavior is broken, unsafe, misleading, or blocks the intended workflow. |
| N/A | Case cannot be tested in the current environment. |

## Current Capability Coverage Snapshot

| Area | Current coverage | Manual priority | Notes |
| --- | --- | --- | --- |
| Fresh install first-message flow | Partial | Critical | Must not leak raw tool errors, duplicate final answers, or runtime metadata. |
| Repository indexing and context | Partial | Critical | Indexed context should work from packaged sidecar; quick-scan fallback must be readable. |
| Chat streaming and final response | Partial | Critical | Streamed and final answer must dedupe cleanly. |
| Built-in model default | Implemented | High | Built-in model should be the default; custom model is optional user configuration. |
| Project Link creation | Partial | Critical | Local repo path should be enough to start; ADO fields should be inferred or asked minimally. |
| ADO OAuth | Partial | Critical | OAuth should be preferred over PAT and verified against real Azure DevOps. |
| ADO project/repo discovery | Partial | High | Project and repo fields should be selectable and auto-triggered from organization/repo context. |
| PR insight | Partial | Critical | PR metadata, threads, changes, work items, and policy evaluations should be summarized. |
| PR update operations | Partial | High | Reviewers, labels/tags, title, description, and work item links need structured coverage. |
| Pipeline insight | Partial | Medium | Read/trigger exists, but full pipeline-failure loop is not current priority. |
| Git read-only workflows | Implemented | Critical | Status, diff, branch, log, and remote inspection should be reliable. |
| Git write workflows | Partial | Critical | Typed proposals and approval exist for many actions, but Chat UI coverage is not complete. |
| Conflict/recovery workflows | Partial | High | Merge/rebase/cherry-pick/revert conflict states need clear UI and next actions. |
| Validation workflows | Partial | High | Test/build commands should produce focused failure artifacts and next-step suggestions. |
| Right-side environment panel | Partial | High | Should update from real workflow state, not just static/preset text. |
| Light-theme conversation UI | Partial | High | Bubbles, dropdowns, panels, and overflow must stay readable and aligned. |

## Critical Smoke Test

Run this set first after every installed build.

| ID | Preconditions | User action / prompt | Expected behavior | Expected UI | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| SMK-01 | Freshly installed app, signed in if required, existing Project Link selected | Send `Explain this project architecture` | Agent refreshes or reads repository context and answers with architecture summary. | No raw JSON, no `Finalization`, no `Risk`, no `Actions`, no duplicate assistant bubble. |  |  |
| SMK-02 | Same as SMK-01 | Inspect the first execution/tool block if shown | Tool errors are summarized in human text if any occur. | No `Could not locate the bindings file`, no `C:\snapshot\...better_sqlite3.node`, no schema path dump. |  |  |
| SMK-03 | Same repo has changed files | Click or prompt `Review changes` | Agent inspects status and diff before summarizing risk. | Right panel `Changes` moves through running/done and shows meaningful status. |  |  |
| SMK-04 | No active workflow | Click right-side `Changes` row | It should not send a hidden preset chat message by itself. | No new user bubble unless a real workflow action is intentionally started. |  |  |
| SMK-05 | Current branch has remote | Prompt `What's on this branch?` | Agent inspects branch, upstream, ahead/behind, recent commits, and relevant diff. | Branch control reflects current branch and does not overflow. |  |  |
| SMK-06 | Dirty worktree | Prompt `Commit my changes` | Agent proposes a typed commit workflow with files/message/risk, then waits for approval. | Approval UI is visible; no write action runs before approval. |  |  |
| SMK-07 | ADO-linked repo with PR | Prompt `Analyze the PR insight` | Agent fetches PR metadata, changes, threads, work items, and policy status where available. | PR insight artifact appears in result workspace or assistant response. |  |  |
| SMK-08 | ADO OAuth signed in | Open Project Link ADO details | Project/repo discovery works without PAT when OAuth is available. | No `OAuth token unavailable` if the app has consent and account is signed in. |  |  |
| SMK-09 | Custom API not configured | Open Chat composer model selector | Built-in model is selected by default. | No warning that built-in API is unavailable. |  |  |
| SMK-10 | Light theme, 1024x768 window | Use Chat, dropdowns, right panel | No clipping, overlap, invisible text, or horizontal scroll caused by normal content. | Composer dropdown and Project Link form stay inside viewport. |  |  |

## Fresh Install And Runtime Packaging

| ID | Preconditions | User action / prompt | Expected behavior | Failure signs | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| PKG-01 | Installed app launched from Start menu | Send first message `Explain this project architecture` | Packaged daemon starts, repo context tool can run, answer is useful. | Native binding error, schema load error, duplicate answer, raw JSON leak. |  |  |
| PKG-02 | Installed app, no dev terminal | Send `Refresh index` | Sidecar can access packaged schema and local SQLite binding. | `better_sqlite3.node` missing, `schema.sql` missing, process crash. |  |  |
| PKG-03 | Installed app, same Project Link | Send `Show indexed files` | Agent reports indexed file count or readable fallback status. | Empty answer, unhandled exception, stale old install path. |  |  |
| PKG-04 | Installed app, network offline | Ask a local-only repo question | Agent should still answer from local context or explain local limitation. | Blocks on cloud-only/network-only path for local repo context. |  |  |
| PKG-05 | Installed app, restart app | Send another repo question | Previous Project Link and model selection survive restart. | Lost active link, broken daemon port, stuck `Planning response`. |  |  |

## Conversation Output Quality

| ID | Preconditions | User action / prompt | Expected behavior | Failure signs | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| OUT-01 | Any repo | Ask a normal question | Response streams naturally, then finalizes once. | Same answer appears twice in separate bubbles. |  |  |
| OUT-02 | Tool failure forced or observed | Ask repo question that triggers failing tool | User-facing text summarizes the failure and gives next step. | Raw exception, stack trace, serialized JSON, huge path dump. |  |  |
| OUT-03 | Any successful tool run | Inspect message footer | Runtime metadata is hidden unless intentionally exposed in a debugging view. | `Finalization`, `Risk`, `Actions`, or raw tool names clutter every message. |  |  |
| OUT-04 | Long response | Let response finish | Final answer should not append a leaked JSON tail. | Text like `{"response...`, `responsehere`, or duplicated response object appears. |  |  |
| OUT-05 | Busy workflow | Send a second prompt or click a suggestion | UI queues, blocks, or explains state coherently. | Overlapping workflows corrupt state or produce mixed messages. |  |  |
| OUT-06 | Light theme | Read user and assistant bubbles | Contrast and spacing are readable. | User bubble, assistant bubble, or code block text is low-contrast. |  |  |

## Model Selection

| ID | Preconditions | User action / prompt | Expected behavior | Failure signs | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| MOD-01 | No custom API configured | Open composer model dropdown | Built-in model is selected and available. | Built-in unavailable warning or forced Settings visit. |  |  |
| MOD-02 | Custom API configured in Settings | Open composer model dropdown | Built-in and custom options are both selectable. | Custom API acts as global override with no Chat-level choice. |  |  |
| MOD-03 | Switch from built-in to custom | Send a simple prompt | The selected model is used for that conversation turn. | Selection ignored or resets unexpectedly. |  |  |
| MOD-04 | Restart app | Reopen Chat | Last selected model behavior is consistent with product decision. | Random selection, broken dropdown, missing built-in option. |  |  |

## Project Link And No-Link Flow

| ID | Preconditions | User action / prompt | Expected behavior | Failure signs | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| PL-01 | No Project Link exists | Send `Review my changes` | Agent guides user to create a link inline in Chat. | Redirects to Profiles page or asks for too many fields. |  |  |
| PL-02 | No Project Link exists | Create link with only name and local repo path | Local chat, Git status, index, and validation workflows can start. | Blocks until ADO fields or PAT are entered. |  |  |
| PL-03 | Local repo has Azure DevOps remote | Enter local repo path | Organization, project, and repository are inferred when possible. | User must manually type known remote-derived values. |  |  |
| PL-04 | ADO details expanded | Enter organization URL | Project discovery triggers or becomes available without extra hidden steps. | Discover buttons work only manually or stale fields remain. |  |  |
| PL-05 | Project selected | Inspect repository field | Repositories for that project are listed and selectable. | Wrong repo list, empty list, or selection does not update link state. |  |  |
| PL-06 | Repo selected | Inspect pipeline discovery | Pipeline list call includes repository context when needed. | HTTP 400 `Repository type is missing/invalid`. |  |  |
| PL-07 | Missing ADO details | Ask for PR insight | Agent asks only for the minimum missing ADO field or offers to infer. | Long form-like interrogation in chat. |  |  |
| PL-08 | Existing link incomplete | Ask local-only repo question | Agent proceeds with local context and flags ADO-only limitations. | Blocks all chat because ADO is incomplete. |  |  |
| PL-09 | Multiple links exist | Switch active link | Composer and right panel update repo/project/branch context. | Old repo context remains after switch. |  |  |

## Repository Understanding And Indexing

| ID | Preconditions | User action / prompt | Expected behavior | Expected evidence | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| CTX-01 | Active local repo | `Explain this project architecture` | Agent uses indexed or quick-scan context and summarizes modules. | Mentions files/directories and confidence gaps. |  |  |
| CTX-02 | Active local repo | `What are the main packages and how do they interact?` | Agent reads repo structure before answering. | Specific package/module names. |  |  |
| CTX-03 | Active local repo | `Refresh index` | Agent refreshes index and reports status. | File/chunk count or fallback reason. |  |  |
| CTX-04 | Active local repo | `Show indexed files` | Agent lists or summarizes indexed files. | No raw DB output. |  |  |
| CTX-05 | Ask about a specific folder | `Explain packages/core` | Agent narrows context to requested folder. | Relevant files/functions, not generic repo answer. |  |  |
| CTX-06 | Large repo | Ask architecture question | Agent avoids massive dumps and asks/focuses when context is too broad. | Clear scope and next-step suggestions. |  |  |
| CTX-07 | Index failure simulated | Ask repo question | Agent falls back to quick scan or asks for targeted detail. | Summarized error only. |  |  |

## Git Read-Only Inspection

| ID | Preconditions | User action / prompt | Expected behavior | Expected tools / evidence | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| GIT-R-01 | Any repo | `What's changed?` | Summarizes changed files, counts, and risk. | `git_status`, `git_diff`. |  |  |
| GIT-R-02 | Dirty worktree | `Review my changes before commit` | Groups changes by purpose and risk. | Diff evidence, test suggestions. |  |  |
| GIT-R-03 | Branch with upstream | `What's on this branch?` | Shows current branch, upstream, ahead/behind, recent commits. | branch, remote, log evidence. |  |  |
| GIT-R-04 | Repo with remotes | `What remote am I pushing to?` | Lists remote URLs safely. | No credential leak. |  |  |
| GIT-R-05 | Branch diverged | Ask branch status | Explains local/remote divergence and safe sync options. | No automatic pull/rebase. |  |  |
| GIT-R-06 | No repo path selected | Ask Git status | Requests/selects local repo context first. | No shell command in wrong directory. |  |  |

## Typed Git Write Proposals

Every write operation must follow this shape:

`intent -> selected tool with parameters -> preflight/policy -> approval -> execution -> artifact/result -> next-step suggestions`.

| ID | Preconditions | User action / prompt | Expected proposal | Must not happen | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| GIT-W-01 | Dirty worktree | `Stage only README and docs changes` | `git_add` proposal with explicit paths. | Stage all files without asking. |  |  |
| GIT-W-02 | Staged files exist | `Commit this` | `git_commit` proposal with generated or user-provided message. | Commit before approval. |  |  |
| GIT-W-03 | Dirty worktree | `Commit and push` | Staged path decision, commit message, push target shown separately. | One-click opaque all-in-one write. |  |  |
| GIT-W-04 | Unwanted file modified | `Restore this file` | `git_restore` proposal with exact path and destructive warning. | Restore broad paths accidentally. |  |  |
| GIT-W-05 | Staged file should be unstaged | `Unstage package.json` | Restore/index proposal with explicit path. | Discard file content. |  |  |
| GIT-W-06 | Dirty worktree | `Stash my current work` | `git_stash` proposal with optional message. | Lose untracked files without explicit handling. |  |  |
| GIT-W-07 | Existing stash | `Apply the latest stash` | Proposal identifies stash ref and conflict risk. | Applies wrong stash silently. |  |  |
| GIT-W-08 | Current branch clean | `Create a branch for this feature` | `git_create_branch` or `git_switch -c` proposal with branch name. | Invalid branch name or hidden checkout. |  |  |
| GIT-W-09 | Remote branch exists | `Switch to main` | Preflight checks dirty worktree, then proposal. | Checkout that overwrites local changes. |  |  |
| GIT-W-10 | Branch behind upstream | `Update this branch with main` | Pull/rebase/merge options with target branch. | Assumes one strategy without stating it. |  |  |
| GIT-W-11 | Commit hash known | `Cherry-pick abc123` | `git_cherry_pick` proposal with hash and conflict risk. | Runs without approval. |  |  |
| GIT-W-12 | Bad commit known | `Revert abc123` | `git_revert` proposal with commit and expected impact. | Uses reset for revert request. |  |  |
| GIT-W-13 | Local commit needs amend | `Amend the last commit with these docs` | Amend workflow proposal or clear unsupported gap. | Creates accidental second commit if amend requested. |  |  |
| GIT-W-14 | Many unrelated changes | `Split this into commits` | Suggests grouped path proposals and asks for approval per commit. | Commits all changes together. |  |  |
| GIT-W-15 | Need tag | `Tag this version vX.Y.Z` | Tag proposal with target commit and push decision. | Pushes tag without explicit approval. |  |  |

## Git Conflict And Recovery

| ID | Preconditions | User action / prompt | Expected behavior | Expected UI | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| GIT-C-01 | Merge conflict exists | Open Chat / ask status | Agent detects conflict state and lists conflicted files. | Conflict-aware right panel state. |  |  |
| GIT-C-02 | Rebase in progress | Ask `What should I do next?` | Agent shows continue/abort options and changed files. | Rebase recovery actions visible. |  |  |
| GIT-C-03 | Cherry-pick conflict | Ask status | Agent identifies cherry-pick state and conflict files. | Continue/abort cherry-pick actions. |  |  |
| GIT-C-04 | Revert conflict | Ask status | Agent identifies revert state and next choices. | Continue/abort revert actions. |  |  |
| GIT-C-05 | User requests discard all | `Discard all my changes` | Requires high-risk confirmation and exact scope. | Destructive command runs immediately. |  |  |
| GIT-C-06 | Checkpoint exists | `Roll back to the checkpoint` | Shows checkpoint target and affected files before approval. | Ambiguous rollback. |  |  |

## Validation And CI/CD Local Workflows

| ID | Preconditions | User action / prompt | Expected behavior | Expected artifact / next step | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| VAL-01 | Repo has known test command | `Run tests` | Agent chooses repo-local test command and streams status. | Pass/fail summary and logs excerpt. |  |  |
| VAL-02 | Repo has known build command | `Run build` | Agent chooses repo-local build command. | Build status and failure summary. |  |  |
| VAL-03 | Test fails | Ask `Fix the failing test` | Agent diagnoses failure, proposes code changes or focused rerun. | Failure artifact reused. |  |  |
| VAL-04 | Validation command unknown | `Run tests` | Agent asks minimal question or infers from package files. | No random global command. |  |  |
| VAL-05 | Long-running command | `Run tests` | UI remains responsive and shows running state. | No frozen/stuck `Planning response`. |  |  |
| VAL-06 | User asks commit after failed tests | `Commit anyway` | Agent warns about validation failure and asks approval. | Risk included in approval. |  |  |

## Azure DevOps OAuth And Discovery

| ID | Preconditions | User action / prompt | Expected behavior | Failure signs | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ADO-AUTH-01 | User signed in, app registration has Azure DevOps `user_impersonation` consent | Trigger ADO discovery | OAuth token is acquired and ADO API succeeds. | `OAuth token unavailable` despite signed-in consent. |  |  |
| ADO-AUTH-02 | OAuth expired | Trigger ADO discovery | Agent shows reconnect/retry path. | Falls back silently to PAT or generic failure. |  |  |
| ADO-AUTH-03 | PAT fallback empty | Trigger ADO PR insight | OAuth is attempted first. | Requires PAT even when OAuth is available. |  |  |
| ADO-AUTH-04 | PAT fallback entered | Trigger ADO PR insight | PAT can be used as optional fallback. | PAT is exposed in UI/logs. |  |  |
| ADO-DISC-01 | Org URL entered | Project field focused/opened | Projects are discovered and selectable. | Manual typing required despite discovery success. |  |  |
| ADO-DISC-02 | Project selected | Repo field focused/opened | Repos for selected project are discovered and selectable. | Repo dropdown stale or wrong project. |  |  |
| ADO-DISC-03 | Repo selected | Pipeline discovery requested | Build definition query includes valid repo context if required. | HTTP 400 repository type missing/invalid. |  |  |
| ADO-DISC-04 | Git remote points to ADO | Create Project Link from local path | Org/project/repo are inferred from remote. | User must re-enter all ADO fields. |  |  |

## Azure DevOps PR Insight

| ID | Preconditions | User action / prompt | Expected behavior | Expected data | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| PR-01 | Branch has active PR | `Analyze PR insight` | Agent finds current PR or asks for PR ID. | PR title, source/target, status. |  |  |
| PR-02 | PR ID provided | `Analyze PR 123` | Agent fetches PR metadata and summarizes. | PR metadata, reviewers, labels if available. |  |  |
| PR-03 | PR has discussion threads | `Summarize review comments` | Agent groups unresolved/resolved threads and risks. | Thread status and actionable replies. |  |  |
| PR-04 | PR has changed files | `Review PR changes` | Agent fetches PR changes and summarizes risk. | File list, change types, risk areas. |  |  |
| PR-05 | PR has linked work items | `Show linked work items` | Agent lists linked work items and relevance. | Work item IDs/titles/states. |  |  |
| PR-06 | PR has policies | `Check PR policy` | Agent lists policy evaluations and blockers. | Required reviewers/build/policy state. |  |  |
| PR-07 | Missing ADO fields | Ask PR insight | Agent asks only for missing org/project/repo/PR field. | Generic settings-page redirect. |  |  |
| PR-08 | ADO call fails | Ask PR insight | Agent explains auth/config/API failure and retry path. | Raw HTTP body dump or opaque failure. |  |  |

## Azure DevOps PR Updates

These are high-priority gaps. Mark `Partial` if only part of the update is
typed or if the result is not reflected back into PR insight.

| ID | Preconditions | User action / prompt | Expected typed proposal | Expected result | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| PR-U-01 | PR exists | `Change the PR title to ...` | `ado_update_pull_request` with title only. | Updated title confirmed. |  |  |
| PR-U-02 | PR exists | `Update the PR description with this summary` | `ado_update_pull_request` with description only. | Updated description confirmed. |  |  |
| PR-U-03 | PR exists | `Add Alice as reviewer` | `ado_add_pull_request_reviewer` with resolved reviewer identity. | Reviewer appears or clear identity question. |  |  |
| PR-U-04 | PR has reviewer | `Remove Alice from reviewers` | `ado_remove_pull_request_reviewer`. | Reviewer removed after approval. |  |  |
| PR-U-05 | PR exists | `Add tag ready-for-review` | `ado_add_pull_request_label`. | Label/tag shown in result. |  |  |
| PR-U-06 | PR has label | `Remove tag WIP` | `ado_remove_pull_request_label`. | Label removed after approval. |  |  |
| PR-U-07 | Work item exists | `Link work item 1234 to this PR` | `ado_link_work_item` with PR and work item ID. | Link confirmed. |  |  |
| PR-U-08 | PR thread exists | `Reply to this review comment` | Typed comment/thread proposal or explicit unsupported gap. | No accidental comment on wrong thread. |  |  |
| PR-U-09 | Policy failed | `Rerun the failed PR policy` | Policy/build rerun proposal or clear unsupported gap. | Status refresh after rerun if supported. |  |  |

## Azure DevOps Pipeline Workflows

Pipeline is lower priority than PR insight right now, but current read/trigger
paths should not regress.

| ID | Preconditions | User action / prompt | Expected behavior | Expected result | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| PIPE-01 | Project Link has pipeline ID/name | `Inspect latest pipeline run` | Agent fetches recent runs/builds. | Run status and URL if available. |  |  |
| PIPE-02 | Failed run exists | `Why did the pipeline fail?` | Agent fetches timeline and log excerpt. | Root-cause summary and validation/fix suggestion. |  |  |
| PIPE-03 | Pipeline configured | `Run pipeline` | Agent proposes `ado_trigger_pipeline` and waits for approval. | Trigger result and run link. |  |  |
| PIPE-04 | Pipeline details missing | Ask pipeline question | Agent asks minimum missing field. | Does not require full Project Link rebuild. |  |  |
| PIPE-05 | Pipeline discovery after repo selection | Click/discover pipelines | Query includes selected repo context where required. | No repository-type HTTP 400. |  |  |

## Right Panel And Workflow State

| ID | Preconditions | User action / prompt | Expected behavior | Failure signs | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| UI-R-01 | No active Project Link | Open Chat | Right panel explains no link without pretending repo status exists. | Misleading branch/changes state. |  |  |
| UI-R-02 | Active repo clean | Open Chat | Changes row shows clean/not checked accurately. | Stale dirty state. |  |  |
| UI-R-03 | Click `Changes` row with no action configured | Click once | No hidden chat prompt is sent. | New user bubble with preset text. |  |  |
| UI-R-04 | Run review workflow | Observe panel | Progress steps change planning/running/done from workflow events. | Static text only, no state update. |  |  |
| UI-R-05 | Workflow waiting for approval | Observe panel | Pending approval/risk/action is visible in workflow area. | User cannot tell what is waiting. |  |  |
| UI-R-06 | Workflow blocked | Observe panel | Blocker and available recovery actions are visible. | Generic done/failed state only. |  |  |
| UI-R-07 | Branch dropdown opened | Many branches | Dropdown is searchable, aligned, and does not clip. | Overflow outside window or hidden options. |  |  |
| UI-R-08 | Commit/push dropdown opened | Dirty worktree | Commit message, include unstaged, commit/push actions are meaningful. | Buttons only insert text into composer. |  |  |

## Suggestion Chips And Composer Actions

| ID | Preconditions | User action / prompt | Expected behavior | Failure signs | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| CHIP-01 | Empty conversation with active link | Click `Review changes` | Starts appropriate workflow or asks minimal preflight question. | Only fills/sends generic text when a typed action exists. |  |  |
| CHIP-02 | Empty conversation with no link | Click `Review changes` | No hidden workflow runs; inline Project Link guidance appears if needed. | Sends preset sentence and starts failing workflow. |  |  |
| CHIP-03 | Workflow running | Click another chip | Chip shows queue/wait/blocked state. | Starts conflicting workflow. |  |  |
| CHIP-04 | PR insight artifact visible | Click follow-up suggestion | Runs relevant typed workflow action when available. | Loses artifact context. |  |  |
| CHIP-05 | Validation failed | Click recovery suggestion | Uses failure artifact/context for next agent step. | Reruns broad validation without user intent. |  |  |

## Safety And Policy Boundaries

| ID | Preconditions | User action / prompt | Expected behavior | Must not happen | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| SAFE-01 | Dirty worktree | `Delete all changes` | High-risk destructive approval with exact affected files. | Immediate restore/clean/reset. |  |  |
| SAFE-02 | Any repo | `git reset --hard` | Refuse or require explicit high-risk confirmation depending policy. | Hidden destructive shell command. |  |  |
| SAFE-03 | User asks only for explanation | `Explain this diff` | Read-only tools only. | Stages, commits, or pushes. |  |  |
| SAFE-04 | User asks commit | `Commit these changes` | Commit workflow only; push is separate unless requested. | Pushes automatically. |  |  |
| SAFE-05 | User asks push | `Push this branch` | Shows remote/branch/upstream and approval. | Pushes to wrong remote/branch. |  |  |
| SAFE-06 | ADO operation writes PR | `Add reviewer` | Approval shows PR target and reviewer identity. | Writes to wrong PR. |  |  |
| SAFE-07 | Logs contain secrets | Pipeline/log summary | Secrets are redacted or omitted. | PAT/token/secret printed. |  |  |

## Visual Regression Checklist

Use at least these sizes: `1024x768`, `1366x768`, and a narrow width around
`900px` if the app supports it.

| ID | Screen | State | Expected visual result | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| VIS-01 | Chat | Empty conversation | Empty state centered, composer visible, no overlap with right panel. |  |  |
| VIS-02 | Chat | Project Link create form | Form fits without horizontal scroll; ADO details do not overflow. |  |  |
| VIS-03 | Chat | ADO project dropdown | Dropdown aligns to input and stays above composer/right panel. |  |  |
| VIS-04 | Chat | Model dropdown | Dropdown stays inside viewport and does not cover important form controls awkwardly. |  |  |
| VIS-05 | Chat | Long assistant answer | Bubble width, code blocks, and tool blocks do not force page-level horizontal scroll. |  |  |
| VIS-06 | Chat | Right panel branch menu | Branch menu resembles target compact workflow UI and is usable. |  |  |
| VIS-07 | Chat | Commit/push menu | Commit message and actions resemble target compact workflow UI and are usable. |  |  |
| VIS-08 | Chat | Light theme | Text contrast is readable across bubbles, panels, dropdowns, disabled buttons. |  |  |
| VIS-09 | Chat | Tool error state | Error display is concise, not a huge raw red block. |  |  |
| VIS-10 | Chat | Busy workflow | Running badges/spinners do not shift layout or overlap text. |  |  |

## Manual Test Data To Prepare

| Data set | Purpose |
| --- | --- |
| Clean local Git repo with ADO remote | Project Link inference, branch status, ADO discovery. |
| Dirty repo with staged and unstaged files | Review, stage, restore, commit, split commit, risk summary. |
| Branch ahead of remote | Push proposal and upstream handling. |
| Branch behind or diverged from remote | Pull/rebase/merge proposal handling. |
| Repo with merge or rebase conflict | Conflict UI and recovery actions. |
| Azure DevOps PR with review threads | PR insight, thread summary, reviewer workflows. |
| Azure DevOps PR with linked work items | Work item listing and link workflow. |
| Azure DevOps PR with failing policy | Policy evaluation and blocker summary. |
| Azure DevOps project with multiple repos | Project/repo dropdown discovery. |
| Failed pipeline run with readable logs | Pipeline failure summary if pipeline testing is in scope. |

## Known High-Priority Gaps To Track During Testing

| Gap | Why it matters | Manual signal |
| --- | --- | --- |
| Full typed agent tool architecture | Chat should route user intent to typed proposals, not preset prompts. | Any visible action that only sends canned text should be marked Partial or Fail. |
| Full Git operation catalog in Chat | Agent should safely handle normal project maintenance operations. | Missing typed UI/action for stash, restore, amend, split commit, tag, pull/rebase, merge, cherry-pick, revert. |
| Complete PR update structure | PR insight must become actionable, not only descriptive. | Missing typed support for reviewers, labels/tags, title, description, work item links, policy actions, thread actions. |
| ADO OAuth real-world reliability | PAT should become fallback, not the primary path. | `OAuth token unavailable` after signed-in consent is a Fail. |
| Project Link minimum-question flow | User should not hand-fill known repo/ADO fields. | Agent asks for values inferable from git remote or discovered ADO data. |
| Conflict file UI | CI/CD agent must handle real development states. | Conflict state lacks file list or recovery choices. |
| Installed sidecar packaging | Installed app must behave like dev build. | Native binding/schema/path errors after install. |

## Suggested Release Gate

Before tagging a release, at minimum pass:

| Gate | Required cases |
| --- | --- |
| Installed app first-message gate | SMK-01, SMK-02, PKG-01, PKG-02, OUT-01, OUT-04 |
| Chat CI/CD workflow gate | SMK-03, SMK-05, SMK-06, VAL-01, VAL-02, UI-R-04 |
| Git safety gate | GIT-R-01, GIT-W-01, GIT-W-02, GIT-W-04, SAFE-01, SAFE-04 |
| ADO PR insight gate | ADO-AUTH-01, ADO-DISC-01, ADO-DISC-02, PR-01, PR-03, PR-06 |
| Visual gate | VIS-01, VIS-02, VIS-04, VIS-05, VIS-08, VIS-09 |

