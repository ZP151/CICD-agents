"""ReAct-lite planner.

Drives the Pipeline Agent over the LLM: builds context, asks the model to
choose actions from the tool registry, executes them, and feeds results back
until either the model emits a final answer or the step ceiling is reached.

Designed so a missing/unconfigured LLM degrades gracefully: in that case
`build_summary_offline` produces a deterministic summary from the diff only.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any

from runtime.config.settings import get_settings
from runtime.core.context_builder import ContextBundle
from runtime.core.llm_client import ChatResult, LLMClient, LLMUnavailableError
from runtime.core.tool_executor import ToolExecutor

log = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are the Pipeline Agent for an internal CI/CD assistant.
You work on a local code index of a developer's repository and have access to
tools for inspecting code, running tests/builds, and interacting with Azure
DevOps. Decide which tools to call and stop as soon as you have enough
information to produce a final answer.

Always return your final answer as a JSON object with these fields:
  title            : short pull request title (<=80 chars)
  summary          : markdown PR description, with sections "What" and "Why"
                     and a short "Risks" bullet list
  risk_level       : one of "low", "medium", "high"
  reasoning        : 2-4 sentence justification of risk_level
  next_actions     : optional list of strings for follow-up (e.g. "run flaky test")

Do not invent file paths or symbols that are not present in the context. If
the diff is empty, return a short summary that explains why.
"""


@dataclass
class PlannerResult:
    title: str
    summary: str
    risk_level: str
    reasoning: str
    next_actions: list[str] = field(default_factory=list)
    tool_calls_made: list[dict[str, Any]] = field(default_factory=list)
    used_llm: bool = True

    def as_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "summary": self.summary,
            "risk_level": self.risk_level,
            "reasoning": self.reasoning,
            "next_actions": list(self.next_actions),
            "tool_calls_made": list(self.tool_calls_made),
            "used_llm": self.used_llm,
        }


class Planner:
    def __init__(
        self,
        llm: LLMClient,
        executor: ToolExecutor,
        max_steps: int | None = None,
        token_budget: int | None = None,
    ):
        settings = get_settings()
        self.llm = llm
        self.executor = executor
        self.max_steps = max_steps or settings.planner_max_steps
        self.token_budget = token_budget or settings.planner_token_budget

    async def run(self, bundle: ContextBundle) -> PlannerResult:
        if not self.llm.configured:
            return self._offline_result(bundle)

        prompt = bundle.to_prompt(self.token_budget)
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Below is the repository context. Plan your next moves, "
                    "call tools as needed, and finish with a JSON answer.\n\n"
                    + prompt
                ),
            },
        ]
        tools = self.executor.schemas()
        tool_calls_made: list[dict[str, Any]] = []
        last_text = ""

        for step in range(self.max_steps):
            try:
                resp: ChatResult = await self.llm.chat(
                    messages, tools=tools, max_tokens=1200
                )
            except LLMUnavailableError:
                return self._offline_result(bundle)

            if resp.tool_calls:
                # Append the assistant turn with tool_calls.
                messages.append(
                    {
                        "role": "assistant",
                        "content": resp.content or None,
                        "tool_calls": [
                            {
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.name,
                                    "arguments": tc.arguments,
                                },
                            }
                            for tc in resp.tool_calls
                        ],
                    }
                )
                for tc in resp.tool_calls:
                    args: dict[str, Any] = {}
                    try:
                        args = json.loads(tc.arguments or "{}")
                    except json.JSONDecodeError:
                        args = {}
                    try:
                        result = await self.executor.call(tc.name, args)
                        tool_result = {"ok": True, "result": result}
                    except Exception as exc:
                        log.exception("tool %s failed", tc.name)
                        tool_result = {"ok": False, "error": str(exc)}
                    tool_calls_made.append(
                        {"name": tc.name, "args": args, "result": tool_result}
                    )
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc.id,
                            "name": tc.name,
                            "content": _truncate(json.dumps(tool_result), 6000),
                        }
                    )
                continue

            last_text = resp.content or ""
            messages.append({"role": "assistant", "content": last_text})

            parsed = _parse_final_json(last_text)
            if parsed:
                return PlannerResult(
                    title=str(parsed.get("title", ""))[:160],
                    summary=str(parsed.get("summary", "")),
                    risk_level=str(parsed.get("risk_level", "low")),
                    reasoning=str(parsed.get("reasoning", "")),
                    next_actions=[
                        str(x) for x in (parsed.get("next_actions") or [])
                    ],
                    tool_calls_made=tool_calls_made,
                    used_llm=True,
                )

            # Nudge the model toward the JSON contract.
            messages.append(
                {
                    "role": "user",
                    "content": (
                        "Please emit your final answer now as a JSON object "
                        "with keys: title, summary, risk_level, reasoning, "
                        "next_actions."
                    ),
                }
            )

        # Fell through without a clean JSON answer; salvage what we can.
        return PlannerResult(
            title=_extract_first_line(last_text) or "Automated PR",
            summary=last_text or "(no model output)",
            risk_level="medium",
            reasoning="Planner reached the step ceiling without a structured answer.",
            tool_calls_made=tool_calls_made,
            used_llm=True,
        )

    # ------------------------------------------------------------------

    def _offline_result(self, bundle: ContextBundle) -> PlannerResult:
        title, summary = self.build_summary_offline(bundle)
        risk = "low"
        if len(bundle.changed_files) > 10 or any(
            cf.deletions > 100 for cf in bundle.changed_files
        ):
            risk = "medium"
        return PlannerResult(
            title=title,
            summary=summary,
            risk_level=risk,
            reasoning="LLM unavailable; produced a deterministic summary from the diff.",
            tool_calls_made=[],
            used_llm=False,
        )

    @staticmethod
    def build_summary_offline(bundle: ContextBundle) -> tuple[str, str]:
        first = next(iter(bundle.changed_files), None)
        if first is None:
            return ("No changes", "There are no file changes against the target branch.")

        files_added = sum(1 for f in bundle.changed_files if f.status == "added")
        files_modified = sum(
            1 for f in bundle.changed_files if f.status == "modified"
        )
        files_deleted = sum(1 for f in bundle.changed_files if f.status == "deleted")
        additions = sum(f.additions for f in bundle.changed_files)
        deletions = sum(f.deletions for f in bundle.changed_files)

        title = f"Update {first.path}"
        if len(bundle.changed_files) > 1:
            title = f"Update {len(bundle.changed_files)} files including {first.path}"
        title = title[:80]

        lines = [
            "## What",
            f"- {len(bundle.changed_files)} file(s) changed "
            f"({files_added} added, {files_modified} modified, {files_deleted} deleted)",
            f"- +{additions} / -{deletions} lines",
            "",
            "## Why",
            "_Automatically generated; LLM unavailable. Edit before merging._",
            "",
            "## Risks",
            "- Review the diff manually.",
        ]
        if bundle.affected_symbols:
            lines.append("")
            lines.append("## Affected symbols")
            for s in bundle.affected_symbols[:20]:
                lines.append(f"- {s}")
        return title, "\n".join(lines)


def _parse_final_json(text: str) -> dict[str, Any] | None:
    if not text:
        return None
    # Try fenced JSON first.
    candidate = text.strip()
    if candidate.startswith("```"):
        fence_end = candidate.rfind("```")
        if fence_end > 3:
            inner = candidate[candidate.find("\n") + 1 : fence_end].strip()
            try:
                obj = json.loads(inner)
                if isinstance(obj, dict):
                    return obj
            except json.JSONDecodeError:
                pass
    # Fallback: scan for a top-level {...} JSON object.
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            obj = json.loads(candidate[start : end + 1])
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            return None
    return None


def _extract_first_line(text: str) -> str:
    for line in text.splitlines():
        s = line.strip()
        if s:
            return s[:80]
    return ""


def _truncate(text: str, n: int) -> str:
    if len(text) <= n:
        return text
    return text[: n - 20] + "...(truncated)..."
