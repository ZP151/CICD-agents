/**
 * Integration smoke for the GAP-03 verifier (Checkpoint A): drives the real
 * daemon and real Azure DevOps through exactly the same helper the Pipeline
 * E2E uses. Requires a live source daemon on DAEMON_URL with a working ADO
 * session. Run explicitly (excluded from the default unit include):
 *
 *   pnpm exec vitest run --config tests/e2e/vitest.config.ts \
 *     --include "lib/adoDaemon.smoke.test.ts"
 */
import { request } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { latestClaimBotPipelineRunViaDaemon } from "./adoVerifier";

const DAEMON_URL = "http://127.0.0.1:8787";
const claimBotRepoPath =
  process.env.MERGEPILOT_E2E_CLAIMBOT_REPO_PATH ||
  "C:\\Users\\15492\\Develop\\ClaimBot_API";

describe("daemon inspect_pipeline integration (needs live daemon + ADO auth)", () => {
  it("reads the latest ClaimBot_API pipeline #117 run through the daemon verifier", async () => {
    const api = await request.newContext();
    try {
      const health = await api.get(`${DAEMON_URL}/healthz`);
      expect(health.ok(), `daemon healthz: HTTP ${health.status()}`).toBeTruthy();

      const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
      const createResponse = await api.post(`${DAEMON_URL}/project-links`, {
        data: {
          name: `mp-live-smoke-${runId}`,
          repoPath: claimBotRepoPath,
          defaultBranch: "main",
          targetBranch: "main",
          adoOrgUrl: "https://tebssg.visualstudio.com/",
          adoProject: "TeBS-ClaimBot",
          adoRepoName: "ClaimBot_API",
          adoPat: "",
          adoPipelineId: "",
          adoPipelineName: "",
          adoMcpEnabled: false,
          adoMcpCommand: "",
          adoMcpAuthentication: "",
          adoMcpDomains: "repositories,pipelines,work-items",
          projectTemplate: "",
          buildCommand: "",
          testCommand: "",
        },
      });
      expect(
        createResponse.ok(),
        `fixture project link create: HTTP ${createResponse.status()} ${await createResponse.text().catch(() => "")}`,
      ).toBeTruthy();
      const projectLink = (await createResponse.json()) as { id: string };
      try {
        const latest = await latestClaimBotPipelineRunViaDaemon(api, DAEMON_URL, projectLink.id);
        expect(latest.id).toBeGreaterThan(0);
        console.log(
          `[adoDaemon.smoke] latest ClaimBot_API pipeline #117 run id=${latest.id} ` +
            `name=${latest.name} state=${latest.state} result=${latest.result}`,
        );
      } finally {
        await api.delete(`${DAEMON_URL}/project-links/${projectLink.id}`).catch(() => undefined);
      }
    } finally {
      await api.dispose();
    }
  });
});
