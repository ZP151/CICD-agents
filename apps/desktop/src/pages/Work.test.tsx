import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  azureWorkItemUrl,
  deliveryActionBelongsToProjectLink,
  deliveryActionCommentText,
  deliveryActionTargetWorkItemId,
  deliveryActionSummary,
  WorkItemLoadingState,
} from "./Work.js";

describe("deliveryActionSummary", () => {
  it("formats work item updates instead of coercing the fields object", () => {
    expect(deliveryActionSummary({
      id: "action-1",
      status: "pending",
      kind: "work_item.update",
      target: {},
      payload: { fields: { "System.State": "In Progress" } },
    })).toBe("Set the work item state to In Progress");
  });

  it("keeps an approved comment readable", () => {
    expect(deliveryActionSummary({
      id: "action-2",
      status: "pending",
      kind: "work_item.comment",
      target: {},
      payload: { text: "Validated the deployment evidence." },
    })).toBe("Add this update: Validated the deployment evidence.");
  });

  it("never leaks an object coercion into an approval summary", () => {
    expect(deliveryActionSummary({
      id: "action-3",
      status: "pending",
      kind: "work_item.comment",
      target: {},
      payload: { text: { value: "not plain text" } },
    })).toBe("Add a work item update");

    expect(deliveryActionSummary({
      id: "action-4",
      status: "pending",
      kind: "work_item.update",
      target: {},
      payload: { fields: { "System.State": { value: "In Progress" } } },
    })).toBe("Update the work item");

    expect(deliveryActionCommentText({ payload: { text: { value: "not plain text" } } })).toBe("");
  });

  it("does not keep a work-item approval visible after Context switches Project Link", () => {
    const action = {
      id: "action-3",
      status: "pending",
      kind: "work_item.update",
      target: { projectLinkId: "project-link-a" },
      payload: {},
    };

    expect(deliveryActionBelongsToProjectLink(action, "project-link-a")).toBe(true);
    expect(deliveryActionBelongsToProjectLink(action, "project-link-b")).toBe(false);
    expect(deliveryActionBelongsToProjectLink(action, "")).toBe(false);
  });

  it("keeps a proposed write traceable to its work item while it awaits approval", () => {
    expect(deliveryActionTargetWorkItemId({ target: { id: 7914 } })).toBe(7914);
    expect(deliveryActionTargetWorkItemId({ target: { id: "not-a-work-item" } })).toBeNull();
  });
});

describe("azureWorkItemUrl", () => {
  it("keeps a work item traceable to its authoritative Azure Boards record", () => {
    expect(azureWorkItemUrl({
      adoOrgUrl: "https://tebssg.visualstudio.com/",
      adoProject: "TeBS ClaimBot",
    }, 7914)).toBe("https://tebssg.visualstudio.com/TeBS%20ClaimBot/_workitems/edit/7914");
  });
});

describe("WorkItemLoadingState", () => {
  it("keeps the worklist structure visible while Azure Boards is loading", () => {
    const html = renderToStaticMarkup(<WorkItemLoadingState />);

    expect(html).toContain("Loading work items");
    expect(html).toContain('role="status"');
    expect(html).toContain("workbench-skeleton-block");
  });
});
