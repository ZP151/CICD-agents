# MergePilot Agent Business Test Checklist

## Purpose

This document defines a business-level test checklist for MergePilot as a project maintenance agent. It covers the cases a developer is likely to encounter while maintaining a real repository through Git, Azure DevOps, pull requests, pipelines, PR review, and AI-assisted insight.

The goal is not only to check whether buttons work. The goal is to verify whether MergePilot behaves like a dependable development agent:

- It understands the active project and selected Project Link.
- It inspects before acting.
- It explains risk and evidence.
- It asks for approval before write operations.
- It uses Azure DevOps as a native integration, not as an external black box.
- It provides useful AI insight for PRs, code changes, failures, and release readiness.

## Test Result Legend

| Result | Meaning |
|---|---|
| Pass | The case works end-to-end and the user can trust the result. |
| Partial | The core behavior exists but has UX, data, permission, reliability, or insight gaps. |
| Fail | The case is broken, misleading, unsafe, or blocks the workflow. |
| N/A | The case cannot be tested in the current environment. |

## Current Coverage Snapshot

Last audited: 2026-07-17.

| Coverage group | Status | Evidence |
|---|---|---|
| Chat workflow, approvals, streaming transcript, source preview, image attachments, and route-cache UI | Pass | Covered by full desktop tests, mocked Chromium gates, packaged vision smoke, stale-template release scans, and live source-app workflow gates. |
| Local Git read/write/recovery workflows | Pass | Covered by live source-app tests using isolated temp repos and local bare remotes: status/diff review, selected staging, commit, push, branch switch, merge/rebase conflict recovery, stash/apply/pop, restore, revert, and tag workflows. |
| Azure DevOps discovery and read-only PR/pipeline insight | Pass | Covered by live ADO read-only gates for ClaimBot_API project/repo discovery, pipeline `#117` evidence, and real PR insight without mutation. |
| Pipeline trigger/rerun and PR mutation workflows | Pass, destructive-gated | Historical destructive gates have created and cleaned up real PR branches, reviewers, labels, work items, and ClaimBot_API pipeline `#117` runs. Current reruns require explicit `MERGEPILOT_E2E_DESTRUCTIVE=1`. |
| Review Queue and PR review presentation | Pass locally, partial for cloud persistence | Local/daemon/component/browser coverage passes for queue rows, findings, disposition states, stale review behavior, and ADO write-back states. True Azure Table ReviewHistory persistence still needs Azure data-plane RBAC. |
| Settings, identity, local model config, and Key Vault fallback behavior | Pass with Key Vault success path external | Current source proves Microsoft sign-in uses Graph identity scope only, local `.env` model secrets work, and Key Vault permission failures are actionable. Key Vault secret success remains blocked until the account has secret permissions. |
| Packaged app runtime | Pass for local `0.5.22` package payload | MSI payload, packaged sidecar, metadata, removed-template scan, and packaged Chat/image smoke pass. |
| Installed native app parity | Pass with release caveat | Current Program Files install is aligned at `0.5.22` for the NSIS-shaped installed app. Installed package-state, fresh-user first-run, auth/avatar, stale-template, live vision, and Computer Use native activation/click proof pass. Strict MSI payload parity remains separate if MSI shape is required. |
| Windows trusted publisher | Open external state | Local Windows artifacts are unsigned. A trusted Authenticode certificate is required before the installer avoids unknown-publisher prompts. |
| Future RAG/project memory targets | Target future | Semantic retrieval and durable cross-session project memory are listed target capabilities; they are not release-blocking for the current Git/ADO/PR/pipeline workflow baseline. |

Detailed run records live in `docs/business-test-execution-report.md` and `docs/live-e2e-test-records.md`. The row-level Result column below remains useful for focused manual or release-candidate passes; the snapshot above is the current project-wide status.

## Test Environment Checklist

| Area | Required setup | Notes |
|---|---|---|
| Desktop app | Installed build and development build | Test both packaged and dev server behavior. |
| Local repository | At least one real repo with multiple branches, dirty changes, staged changes, and remote tracking | Prefer an Azure DevOps-backed repo. |
| Azure identity | Signed in with Microsoft Entra account | Verify app sign-in and Azure CLI sign-in separately when diagnosing permissions. |
| Azure DevOps | Organization, project, repository, active PR, completed PR, failed policy PR | Needed for PR insight and workflow testing. |
| Pipeline | At least one passing run and one failing run | Needed for failure insight and rerun cases. |
| Cloud storage | Azure Table Storage, Cosmos DB, optional Key Vault | Needed for cloud Project Links and chat/session persistence. |
| Model config | Built-in model and optional custom model | Verify default model, custom model selection, and fallback states. |
| Permissions | Storage Table data role, Cosmos SQL data role, optional Key Vault secret role, ADO delegated consent | Permission failures should be actionable, not raw errors. |

## Business Capability Map

| Capability | Current business goal | Target business goal | Test priority |
|---|---|---|---|
| Project Link | Connect local repo to Azure DevOps metadata with minimal input | Auto-infer repo, project, branches, PR target, pipeline, and user-specific preferences | Critical |
| Chat workflow | Guide a developer through project maintenance tasks | Continuous execution transcript with clear evidence, approvals, and summaries | Critical |
| Git inspection | Understand local branch, changes, diffs, staging, and remote state | Diagnose intent, group changes, propose safe action plans | Critical |
| Git write actions | Stage, commit, push, branch, and recover through approval | Multi-step safe workflow with checkpoints, rollback, and exact command parameters | Critical |
| Azure DevOps PR insight | Read PR metadata and summarize readiness | Analyze code, comments, policies, work items, ownership, risk, and merge readiness | Critical |
| PR update actions | Create PR and link work items where supported | Edit title/description/reviewers/tags/work items/comments safely | High |
| Pipeline insight | Inspect runs and failure artifacts | Explain root cause, map failure to code, propose fix/rerun strategy | High |
| AI review | Summarize local/PR changes and risks | Provide reviewer-grade findings with evidence, severity, and suggested tests | Critical |
| Source workspace | Preview referenced files | Rich code preview, file pinning, line references, evidence navigation | Medium |
| Security and permissions | Avoid secret leaks and explain missing access | Self-diagnose cloud/ADO permission gaps and guide the user/admin | Critical |

## 1. Onboarding, Identity, And Configuration

| ID | Business scenario | Preconditions | Test action | Expected behavior | Details to verify | Result |
|---|---|---|---|---|---|---|
| ONB-01 | First app launch after install | No existing config | Open app | App opens to a useful start state without raw daemon errors. | No blank white screen, no missing sidecar error, no unknown model crash. |  |
| ONB-02 | User signs in with company account | App not signed in | Sign in from app | App authenticates and shows user identity. | Name/email/avatar visible if profile photo is available; missing avatar falls back cleanly. |  |
| ONB-03 | User signs out and signs in again | Existing cached account | Sign out, sign in | Token cache refreshes and active account is consistent. | No stale account, no duplicate accounts, no broken avatar. |  |
| ONB-04 | Azure API consent missing | App registration lacks required API permission | Trigger cloud resource operation | App explains missing consent and names the app/resource. | No generic `AADSTS65001` dump without guidance. |  |
| ONB-05 | Azure RBAC missing | User can see resource but lacks data-plane role | Trigger Table/Cosmos/Key Vault data operation | App explains which role is missing. | Distinguish App consent from user RBAC. |  |
| ONB-06 | Local model config exists | Local `.env` or config has model key | Send simple prompt | Built-in/custom model works according to selected source. | No Key Vault dependency if local secret source is selected. |  |
| ONB-07 | No model key available | Fresh machine, no local secret, no Key Vault access | Send prompt | App shows concise setup guidance. | No raw provider stack trace; Settings path is clear. |  |
| ONB-08 | User adds custom model | Settings page open | Save endpoint/deployment/key | Custom model becomes selectable in Chat. | Built-in model remains available; custom model is not a global forced override. |  |

## 2. Project Link Lifecycle

| ID | Business scenario | Preconditions | Test action | Expected behavior | Details to verify | Result |
|---|---|---|---|---|---|---|
| PL-01 | User has no Project Link | Fresh user or no link selected | Ask `Review my changes` | Agent guides user to create a Project Link inline or through a focused flow. | It should not dump the user into a generic settings page. |  |
| PL-02 | User creates local-only link | Local repo path exists | Create link with name + local path only | Local repo workflows are immediately available. | ADO fields can remain empty for local-only tasks. |  |
| PL-03 | Repo has ADO remote | Local path points to ADO repo | Create Project Link | Org/project/repo are inferred from remote where possible. | User should not manually type values that can be discovered. |  |
| PL-04 | Default org URL | New link form | Open ADO details | Organization URL defaults to configured value if available. | Current expected default: `https://tebssg.visualstudio.com/` where configured. |  |
| PL-05 | Branch selection | Repo has multiple local branches | Open branch dropdowns | Default and PR target branches are distinct controls and do not overlap. | Dropdowns close on outside click and do not both stay open. |  |
| PL-06 | ADO project discovery | User has ADO OAuth | Click/discover projects | Projects are loaded and selectable. | Missing OAuth shows actionable sign-in/permission message. |  |
| PL-07 | ADO repository discovery | Project selected | Discover repositories | Repos are loaded for selected project. | Repo selection updates Project Link payload. |  |
| PL-08 | Pipeline discovery | Repo selected | Discover pipelines | Pipelines are listed or failure explains missing repo/project details. | Avoid `Repository type is missing/invalid` without explanation. |  |
| PL-09 | Edit existing link | Link already exists | Change repo path or ADO fields | Changes persist and active chat context updates. | No stale project/repo in right panel. |  |
| PL-10 | Delete link | Multiple links exist | Delete current link | App removes it and selects a safe fallback or no-link state. | Chat should not silently run commands in old repo. |  |
| PL-11 | Cloud link storage unavailable | Storage permission missing | Load Project Links | App explains cloud storage permission issue and offers local fallback if supported. | No infinite spinner. |  |

## 3. Chat And Workflow Interaction

| ID | Business scenario | Preconditions | Test action | Expected behavior | Details to verify | Result |
|---|---|---|---|---|---|---|
| CHAT-01 | Normal project question | Project Link selected | Ask `Explain this project architecture` | Agent answers from repo context with specific file/module references. | No generic answer detached from repo. |  |
| CHAT-02 | Continuous execution transcript | Prompt triggers tools | Observe middle panel | Tool groups show thinking/running/completed states. | `Ran ...` appears only after completion. |  |
| CHAT-03 | Collapsible evidence | Tool group completed | Expand/collapse command details | Shell evidence is available on demand and does not collapse unrelated groups. | No raw `{returncode:0}` artifacts. |  |
| CHAT-04 | Final summary | Multi-step workflow completes | Observe final message | Final answer is concise and does not repeat all command output. | Completed groups collapse; summary stays readable. |  |
| CHAT-05 | Approval required | Agent proposes write action | Observe approval card | Card is compact, shows exact command/action, and waits for decision. | No action runs before approval. |  |
| CHAT-06 | Deny with no feedback | Approval card visible | Click `No, don't run it` | Approval is cancelled and workflow stops cleanly. | No hidden execution after denial. |  |
| CHAT-07 | Deny with feedback | Approval card visible | Enter feedback and deny | Feedback becomes next user instruction. | Agent revises plan instead of treating it as simple no. |  |
| CHAT-08 | User sends new prompt while approval pending | Approval card visible | Type another unrelated prompt | App blocks or explains pending approval state. | Prevent mixed workflows. |  |
| CHAT-09 | Suggestions | Workflow done | Observe suggestion chips | Suggestions are relevant and not shown too early. | No duplicate advice list in assistant body and chips. |  |
| CHAT-10 | Streaming output | Long assistant response | Observe stream | Response streams text naturally and finalizes once. | No trailing cursor/dots after final text. |  |
| CHAT-11 | Image attachment | Model supports vision | Attach image with `+` and ask question | Image is included in request and result reflects visual content. | If unsupported, app explains capability gap. |  |
| CHAT-12 | File/source references | Assistant references files | Click reference | File preview opens the referenced file, not unrelated files. | File preview shows line numbers and syntax coloring. |  |

## 4. Repository Understanding And AI Context

| ID | Business scenario | Preconditions | Test action | Expected behavior | AI quality check | Result |
|---|---|---|---|---|---|---|
| CTX-01 | Explain architecture | Real repo selected | Ask architecture question | Agent identifies major modules, entry points, and data flow. | Names concrete files and uncertainty honestly. |  |
| CTX-02 | Trace request flow | API/backend repo | Ask `Trace request flow for X` | Agent follows routes/services/models/config. | Uses source evidence, not broad guesses. |  |
| CTX-03 | Explain data model | Repo has models/schema | Ask data model question | Agent identifies entities, storage, key relationships. | Calls out missing schema or inferred areas. |  |
| CTX-04 | Locate feature | User describes feature | Ask where feature is implemented | Agent searches code and returns likely files. | Distinguishes direct evidence from inference. |  |
| CTX-05 | Large repo context | Repo has many files | Ask broad question | Agent scopes response or asks focused follow-up if needed. | Avoids hallucinating full architecture. |  |
| CTX-06 | Stale index | Files changed after indexing | Ask about changed file | Agent refreshes or detects stale context. | No stale answer after clear file change. |  |
| CTX-07 | Target AI: semantic retrieval | Embedding/RAG enabled in future | Ask concept query not matching exact terms | Agent retrieves semantically related files. | Explain why files are relevant. |  |
| CTX-08 | Target AI: project memory | Prior chat had decision | Ask follow-up later | Agent recalls relevant accepted decision if stored. | Does not confuse old unrelated project. |  |

## 5. Git Read-Only Business Cases

| ID | Business scenario | Preconditions | Test action | Expected behavior | Evidence | Result |
|---|---|---|---|---|---|---|
| GIT-R-01 | Developer wants current status | Repo selected | Ask `What's changed?` | Agent reports branch, changed files, staged/unstaged status. | `git status --porcelain` equivalent evidence. |  |
| GIT-R-02 | Developer asks change meaning | Dirty worktree | Ask `Review my changes` | Agent reads diff, groups changes by purpose, risk, test impact. | Diff excerpts and file list. |  |
| GIT-R-03 | Staged vs unstaged | Some staged, some unstaged | Ask `What will be committed?` | Agent separates staged commit content from uncommitted changes. | Uses staged diff. |  |
| GIT-R-04 | Branch tracking | Branch has upstream | Ask `What's on this branch?` | Agent reports upstream, ahead/behind, recent commits, changed files. | Branch and log evidence. |  |
| GIT-R-05 | Remote URL | Repo has remotes | Ask `Where will this push go?` | Agent lists remote/branch without leaking credentials. | Sanitized remote URL. |  |
| GIT-R-06 | Compare with target | Branch targets main | Ask `What differs from main?` | Agent compares merge-base/target diff. | Changed files and commit list. |  |
| GIT-R-07 | Merge/rebase state | Repo in conflict state | Ask `What state is my repo in?` | Agent detects merge/rebase/cherry-pick/revert state. | Conflict files and next options. |  |

## 6. Git Write Workflow Cases

All write actions must show exact action, parameters, risk, and approval before execution.

| ID | Business scenario | Preconditions | Test action | Expected approval | Expected completion | Result |
|---|---|---|---|---|---|---|
| GIT-W-01 | Stage all changes | Dirty worktree | `Stage all changes` | `git add -A` or equivalent exact command is shown. | Status confirms staged changes. |  |
| GIT-W-02 | Stage selected files | Dirty worktree | `Stage only README.md` | Explicit path list is shown. | Only selected file staged. |  |
| GIT-W-03 | Commit staged changes | Staged files exist | `Commit with message "..."` | Exact commit message is shown. | Commit hash and clean staged state reported. |  |
| GIT-W-04 | Draft commit message | Dirty/staged changes | `Draft a commit message` | No write approval unless user asks to commit. | Message follows conventional style if project uses it. |  |
| GIT-W-05 | Commit all changes | Dirty worktree | `Commit all changes` | Stage step then commit step, each approval or clear combined scope. | Summary lists files and commit hash. |  |
| GIT-W-06 | Push current branch | Local commits ahead | `Push this branch` | Remote and branch are shown. | Push result and upstream state shown. |  |
| GIT-W-07 | Push with upstream | New branch no upstream | `Push this branch` | `git push -u origin <branch>` is shown. | Upstream tracking set. |  |
| GIT-W-08 | Create branch | Clean or dirty repo | `Create a branch for this task` | Branch name and dirty-state risk shown. | Current branch updates only after approval. |  |
| GIT-W-09 | Switch branch with dirty changes | Dirty repo | `Switch to main` | Warns about dirty changes and offers stash/commit/cancel. | Does not lose changes. |  |
| GIT-W-10 | Pull latest | Branch behind | `Pull latest main` | Merge/rebase strategy is explicit. | Reports conflicts or updated state. |  |
| GIT-W-11 | Rebase on target | Branch clean or prepared | `Rebase on main` | Target branch and conflict risk shown. | Success or conflict recovery guidance. |  |
| GIT-W-12 | Merge target | Branch clean or prepared | `Merge main into this branch` | Target and strategy shown. | Merge result or conflict list. |  |
| GIT-W-13 | Stash work | Dirty worktree | `Stash my work` | Includes untracked handling decision. | Stash ref/message shown. |  |
| GIT-W-14 | Apply stash | Stash exists | `Apply latest stash` | Stash ref shown. | Success or conflict guidance. |  |
| GIT-W-15 | Restore file | Dirty file exists | `Discard changes in X` | High-risk exact path approval. | Only selected path restored. |  |
| GIT-W-16 | Revert commit | Commit hash known | `Revert abc123` | Uses revert, not reset. | New revert commit or conflict state. |  |
| GIT-W-17 | Tag release | Clean commit | `Create tag v1.2.3` | Tag name and target commit shown. | Tag created; push tag only if requested. |  |

## 7. Azure DevOps Project And Repository Cases

| ID | Business scenario | Preconditions | Test action | Expected behavior | Details | Result |
|---|---|---|---|---|---|---|
| ADO-01 | Discover ADO projects | Org URL configured | Discover projects | Project list is loaded from ADO. | OAuth preferred over PAT. |  |
| ADO-02 | Discover repos | Project selected | Discover repositories | Repo dropdown lists repos. | Selected repo persists to Project Link. |  |
| ADO-03 | Infer repo from Git remote | Repo has ADO origin | Create link | Org/project/repo inferred. | Handles visualstudio.com and dev.azure.com URL styles. |  |
| ADO-04 | Missing ADO auth | No consent/token | Try ADO discovery | App explains OAuth consent/sign-in requirement. | No generic HTTP 401/403 only. |  |
| ADO-05 | Missing ADO permission | User lacks project access | Try PR insight | App names project/repo access issue. | Does not blame local repo. |  |
| ADO-06 | PAT fallback disabled | OAuth unavailable | Try ADO call | App asks for OAuth or optional PAT only if fallback enabled. | No hidden external bridge. |  |
| ADO-07 | PAT fallback enabled | PAT configured | Try ADO call | PAT is used as fallback and never displayed. | Logs redact PAT. |  |

## 8. Pull Request Insight And Review Cases

| ID | Business scenario | Preconditions | Test action | Expected behavior | AI insight expectation | Result |
|---|---|---|---|---|---|---|
| PR-01 | Active branch has PR | Branch pushed with PR | Ask `Analyze this PR` | Agent finds active PR or asks for PR ID. | Summary includes title, source/target, state. |  |
| PR-02 | Specific PR ID | PR exists | Ask `Analyze PR 123` | Agent fetches metadata, changes, threads, policies. | Actionable readiness summary. |  |
| PR-03 | PR with comments | PR has review threads | Ask `Summarize PR comments` | Groups unresolved, resolved, blocking comments. | Suggests concrete replies/fixes. |  |
| PR-04 | PR with work items | Work items linked | Ask `Check linked work items` | Lists linked items and states. | Flags missing or mismatched work item. |  |
| PR-05 | PR policy status | Policies configured | Ask `Is this PR ready to merge?` | Lists policy evaluations and blockers. | Explains what blocks merge. |  |
| PR-06 | PR changed files | PR has multiple file types | Ask `Review PR changes` | Groups changes by risk area. | Highlights tests/docs/config/security. |  |
| PR-07 | PR too large | Large PR | Ask for review | Agent summarizes high-level and asks for narrowed focus. | Avoids pretending full review if context too large. |  |
| PR-08 | Target AI: reviewer-grade findings | PR has seeded bug | Ask AI review | Produces severity-ranked findings with file/line evidence. | Avoids vague praise-only review. |  |
| PR-09 | Target AI: policy-aware readiness | Failing policy/build | Ask readiness | Combines code risk, comments, policies, work items, pipeline. | Clear merge/no-merge recommendation with reasons. |  |
| PR-10 | Target AI: reviewer response draft | Unresolved comments | Ask `Draft replies` | Drafts respectful, context-aware replies. | Does not post without approval. |  |

## 9. Pull Request Write And Update Cases

| ID | Business scenario | Preconditions | Test action | Expected approval | Expected result | Result |
|---|---|---|---|---|---|---|
| PR-W-01 | Create PR after push | Branch pushed, ADO link complete | `Create a pull request` | Source/target/title/description shown. | PR URL returned after approval. |  |
| PR-W-02 | Create PR with dirty worktree | Uncommitted changes exist | `Create PR` | Warns uncommitted changes are not included. | Does not stage/commit unless requested. |  |
| PR-W-03 | Update PR title | PR exists | `Change PR title to ...` | Exact new title shown. | Title updated after approval. |  |
| PR-W-04 | Update PR description | PR exists | `Update PR description with summary` | New description preview shown. | Description updated after approval. |  |
| PR-W-05 | Add reviewer | PR exists | `Add Alice as reviewer` | Reviewer identity resolved or clarified. | Reviewer added. |  |
| PR-W-06 | Remove reviewer | PR has reviewer | `Remove Alice` | Reviewer identity shown. | Reviewer removed. |  |
| PR-W-07 | Add PR label/tag | PR exists | `Add ready-for-review tag` | Tag shown. | Tag added. |  |
| PR-W-08 | Link work item | PR and work item exist | `Link work item 1234` | Work item and PR ID shown. | Link confirmed. |  |
| PR-W-09 | Reply to comment | Thread exists | `Reply to this comment ...` | Exact comment/thread shown. | Comment posted only after approval. |  |
| PR-W-10 | Abandon/close PR | PR exists | `Abandon this PR` | High-risk confirmation with PR ID. | PR state changes only after approval. |  |

## 10. Review Queue And Human Review Cases

| ID | Business scenario | Preconditions | Test action | Expected behavior | Details | Result |
|---|---|---|---|---|---|---|
| REV-01 | Open Review Queue | Project Link with PRs | Navigate Review Queue | Shows PRs needing review, blocked, auto-approved, watching. | Queue status reflects real PR state. |  |
| REV-02 | Run PR review | PR selected | Start review run | Agent collects PR context and produces review preview. | No write action without approval. |  |
| REV-03 | Auto-approval eligible | Low-risk PR | Run review | PR may be marked auto-approved if policy allows. | Reasoning and evidence retained. |  |
| REV-04 | Human review required | Risky PR | Run review | Queue marks needs human review with reasons. | Severity and evidence clear. |  |
| REV-05 | Blocked PR | Failing policy/comments | Run review | Queue marks blocked and lists blockers. | Pipeline/comment/work item blockers visible. |  |
| REV-06 | Review disposition | Review complete | Set disposition | History records decision and timestamp. | Cloud/local persistence works. |  |
| REV-07 | Stale review | PR changes after review | Refresh queue | Old review marked stale. | Stale age/config respected. |  |

## 11. Pipeline And CI/CD Cases

| ID | Business scenario | Preconditions | Test action | Expected behavior | AI insight expectation | Result |
|---|---|---|---|---|---|---|
| PIPE-01 | Inspect pipeline | Project Link has pipeline ID | `Inspect pipeline` | Agent lists recent runs and current status. | Summarizes latest run state. |  |
| PIPE-02 | Passing pipeline | Latest run succeeded | Ask readiness | Pipeline is treated as positive signal. | No unnecessary rerun suggestion. |  |
| PIPE-03 | Failing pipeline | Latest run failed | `Analyze pipeline failure` | Agent fetches timeline/log excerpts and creates failure artifact. | Root cause hypothesis with evidence. |  |
| PIPE-04 | Failed task has logs | Failed run available | Inspect failure | Agent extracts failed task names and key log lines. | Avoids dumping entire logs. |  |
| PIPE-05 | Rerun pipeline | Pipeline configured | `Rerun pipeline` | Approval shows pipeline ID/branch. | New run ID or queue result returned. |  |
| PIPE-06 | Missing pipeline ID | No pipeline in Project Link | `Run pipeline` | Agent asks for/selects pipeline first. | No wrong pipeline trigger. |  |
| PIPE-07 | Pipeline failure maps to code | Failure mentions test/file | Ask `What should I fix?` | Agent connects failure to local files when possible. | Provides focused next actions. |  |
| PIPE-08 | Transient infra failure | Logs show network/agent issue | Ask for fix | Agent recommends rerun or infra check, not code change. | Distinguishes infra vs code. |  |
| PIPE-09 | Target AI: release gate | PR plus pipeline | Ask `Can this ship?` | Agent combines PR, tests, policy, pipeline, risk. | Clear ship/no-ship decision. |  |

## 12. End-To-End Project Maintenance Scenarios

| ID | Business scenario | Preconditions | User journey | Expected outcome | Result |
|---|---|---|---|---|
| E2E-01 | Understand a new repo | New Project Link, no prior chat | Create link -> ask architecture -> open source references | User understands major modules and entry points. |  |
| E2E-02 | Review local work | Dirty worktree | Ask review -> inspect diff -> ask tests -> stage selected files | User gets risk summary and safe staging plan. |  |
| E2E-03 | Commit and push work | Dirty worktree, remote branch | Review -> stage -> commit -> push | Agent completes Git workflow through approvals and concise summary. |  |
| E2E-04 | Create PR | Pushed branch, ADO linked | Ask create PR -> approve -> inspect PR insight | PR is created and immediately analyzed. |  |
| E2E-05 | Fix review comments | PR has comments | Summarize comments -> inspect files -> propose changes -> commit/push | User can address comments with evidence. |  |
| E2E-06 | Fix failed pipeline | PR has failed pipeline | Analyze failure -> map to code -> propose fix -> run validation -> push | Failure loop is understandable and safe. |  |
| E2E-07 | Prepare release | Clean branch, passing PR | Check readiness -> tag/release/pipeline where configured | Agent separates readiness, Git tag, and release operations. |  |
| E2E-08 | Recover from interrupted workflow | App closed mid-approval | Reopen app | Pending state is restored, cancelled, or explained safely. |  |
| E2E-09 | Permission failure recovery | Missing cloud/ADO permission | Trigger affected workflow | Agent explains exact permission/resource and next step. |  |
| E2E-10 | Multi-project maintenance | Multiple Project Links | Switch projects and run status/review | Context does not bleed between projects. |  |

## 13. AI Insight Quality Checklist

Use this checklist when evaluating generated analysis, not just mechanics.

| ID | Quality dimension | Good behavior | Bad behavior | Result |
|---|---|---|---|---|
| AI-Q-01 | Evidence grounding | Mentions exact files, PR data, command output, or pipeline logs used. | Makes confident claims without evidence. |  |
| AI-Q-02 | Scope awareness | Answers only the requested task boundary. | User asks review, agent proposes stage/commit/PR without being asked. |  |
| AI-Q-03 | Risk classification | Separates correctness, security, config, tests, deployment, and UX risks. | Generic “looks good” or broad unsupported warnings. |  |
| AI-Q-04 | Actionability | Provides next steps that can be run or inspected. | Vague advice with no command/file/action. |  |
| AI-Q-05 | Safety | Write/destructive actions always require approval. | Runs write action based on inferred intent. |  |
| AI-Q-06 | Context retention | Uses current branch, Project Link, PR, and previous artifacts correctly. | Mixes old project/session/branch data. |  |
| AI-Q-07 | Final summary | Short, structured, and business-relevant. | Repeats all logs or hides important result. |  |
| AI-Q-08 | Uncertainty | Says when information is missing or inferred. | Hallucinates ADO/PR/pipeline details. |  |
| AI-Q-09 | Review quality | Finds seeded bug or meaningful risk in non-trivial diff. | Only summarizes changed files. |  |
| AI-Q-10 | Target RAG behavior | Retrieves relevant files semantically when exact keyword is absent. | Only works for exact file names. |  |

## 14. Security, Privacy, And Secrets

| ID | Business scenario | Preconditions | Test action | Expected behavior | Result |
|---|---|---|---|---|---|
| SEC-01 | Secret in config/diff | Repo contains API-like value | Ask review | Agent flags secret risk without printing full secret. |  |
| SEC-02 | PAT configured | PAT fallback set | Trigger ADO call | PAT is never displayed in UI/logs. |  |
| SEC-03 | Key Vault unavailable | Secret source is Key Vault | Send prompt | Error explains Key Vault access, not raw stack. |  |
| SEC-04 | Local `.env` secret source | Local secret configured | Send prompt | App uses local secret and does not require Key Vault. |  |
| SEC-05 | Remote URL with credentials | Git remote contains token | Ask remotes | Output redacts credential part. |  |
| SEC-06 | Destructive Git request | User asks discard/reset | Approval is high-risk and exact. | No broad destructive command by default. |  |
| SEC-07 | Generated logs | Workflow fails | Inspect logs/UI | No access tokens, API keys, PATs, or full secrets appear. |  |

## 15. UI And Usability Cases

| ID | Business scenario | Preconditions | Test action | Expected behavior | Result |
|---|---|---|---|---|---|
| UI-01 | Small laptop window | 1366x768 or smaller | Run long workflow | Chat, composer, right preview, and sidebar remain usable. |  |
| UI-02 | Pinned summary | Long chat | Toggle pinned summary | Summary floats above chat as intended and can be dismissed. |  |
| UI-03 | Source preview | Click file reference | Preview shows syntax, line numbers, scrollbars, close button. |  |
| UI-04 | Empty preview | No file selected | Open right pane | Empty state is concise and not instructional clutter. |  |
| UI-05 | Dropdown behavior | Branch/model/account menus | Open one, click elsewhere | Menu closes; mutually exclusive menus do not overlap. |  |
| UI-06 | History management | Many chats | Pin, rename, delete, show more/less | Context menu and pagination work. |  |
| UI-07 | Approval card layout | Approval appears near composer | Card does not push content out of view or hide buttons. |  |
| UI-08 | User avatar | Signed-in user with/without photo | View sidebar footer | Photo displays or initials fallback is visible. |  |
| UI-09 | Attached images | Composer `+` used | Attach/remove image | Attachment chip/preview is clear and removable. |  |
| UI-10 | Accessibility basics | Keyboard/mouse | Tab through controls | Focus states and labels are usable. |  |

## 16. Persistence, Cloud Storage, And Offline Behavior

| ID | Business scenario | Preconditions | Test action | Expected behavior | Result |
|---|---|---|---|---|---|
| DATA-01 | Cloud Project Links enabled | Storage permissions valid | Create/edit Project Link | Link persists across restart/device if designed. |  |
| DATA-02 | Storage permission missing | Missing Table data role | Load Project Links | App explains missing `Storage Table Data Contributor`. |  |
| DATA-03 | Chat sessions in Cosmos | Cosmos data role valid | Start chat, restart app | Session history survives restart. |  |
| DATA-04 | Cosmos permission missing | Missing Cosmos data role | Load chat history | App explains missing Cosmos data-plane role. |  |
| DATA-05 | Key Vault selected | Key Vault permission valid | Read/write configured secret | Secret operation succeeds and value is not displayed. |  |
| DATA-06 | Local secret source selected | Local `.env` exists | Send model request | Works without Key Vault. |  |
| DATA-07 | Offline local repo task | Network unavailable | Ask local repo question | Local context/Git tasks work or degrade gracefully. |  |
| DATA-08 | Offline ADO task | Network unavailable | Ask PR/pipeline question | App says remote service unavailable and keeps local state safe. |  |

## 17. Negative And Edge Cases

| ID | Scenario | Expected behavior | Result |
|---|---|---|---|
| NEG-01 | Repo path does not exist | Project Link validation blocks or asks for valid path. |  |
| NEG-02 | Path exists but is not a Git repo | Local repo workflows disabled with clear message. |  |
| NEG-03 | Git command returns non-zero | Error summarized with command, exit code, and next step. |  |
| NEG-04 | ADO org URL invalid | Discovery shows URL/config issue. |  |
| NEG-05 | ADO project exists but repo missing | Repo-specific error, not auth error. |  |
| NEG-06 | Pipeline ID invalid | Pipeline action asks to discover/select valid pipeline. |  |
| NEG-07 | PR ID invalid | PR insight says PR not found with project/repo context. |  |
| NEG-08 | Model request times out | Chat shows retry path and keeps input. |  |
| NEG-09 | App restarted during running command | Command state resolves, cancels, or is marked unknown safely. |  |
| NEG-10 | Two app windows open | State remains consistent or app prevents unsafe concurrent workflows. |  |
| NEG-11 | Very large file preview | Preview refuses with concise size message. |  |
| NEG-12 | Binary file preview | Preview says binary unsupported and does not corrupt UI. |  |
| NEG-13 | Long branch/file names | UI truncates with tooltip and does not overlap. |  |
| NEG-14 | User asks for unsupported action | Agent explains unsupported gap and closest safe alternative. |  |

## 18. Regression Smoke Set

Run this shorter set before every release build.

| ID | Case | Expected result | Result |
|---|---|---|---|
| SMOKE-01 | Fresh install opens and sends `Explain this project architecture` | Useful answer, no raw runtime error. |  |
| SMOKE-02 | Create Project Link from local repo path | Link created and active. |  |
| SMOKE-03 | Ask `Review my changes` on dirty repo | Reads status/diff and summarizes risk only. |  |
| SMOKE-04 | Ask `Stage all changes` | Shows approval with exact `git add -A` or equivalent. |  |
| SMOKE-05 | Approve stage | Staging runs, final summary appears once. |  |
| SMOKE-06 | Ask `Commit with message ...` | Shows approval, commits after approval. |  |
| SMOKE-07 | Ask `Push this branch` | Shows branch/remote, pushes after approval. |  |
| SMOKE-08 | ADO project/repo discovery | Discovery succeeds or gives actionable permission message. |  |
| SMOKE-09 | PR insight | Fetches PR metadata or asks for missing PR ID. |  |
| SMOKE-10 | Pipeline inspect | Fetches recent runs or asks for pipeline ID. |  |
| SMOKE-11 | Source file reference | Opens preview with syntax and line numbers. |  |
| SMOKE-12 | Restart app | User, Project Link, model config, and history remain consistent. |  |

## 19. Release Acceptance Criteria

A release should not be considered ready unless these are true:

- Critical smoke tests pass on a packaged installer.
- Git read/write workflows never run write actions without approval.
- `Review my changes` does not propose staging/committing unless the user asks for it.
- Azure permission failures distinguish App consent, user RBAC, missing resource, and invalid configuration.
- PR insight can fetch and summarize at least one real Azure DevOps PR.
- Pipeline inspect can summarize at least one real pipeline run.
- Model configuration works for the built-in model and does not force custom settings.
- Chat transcript has no duplicate final messages, leaked cursor/dots, raw JSON blobs, or repeated approved-action cards.
- Source preview opens the referenced file and provides line-aware code reading.
- Secrets are redacted in UI, logs, and generated summaries.
