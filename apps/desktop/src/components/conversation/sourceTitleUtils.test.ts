import { describe, expect, it } from "vitest";
import {
  sourceLineNumberFromTitle,
  stripSourceLineSuffix,
} from "./sourceTitleUtils.js";

describe("stripSourceLineSuffix", () => {
  it("removes single-line and range suffixes from source titles", () => {
    expect(stripSourceLineSuffix("ClaimController.cs:42")).toBe("ClaimController.cs");
    expect(stripSourceLineSuffix("ClaimController.cs:42-58")).toBe("ClaimController.cs");
    expect(stripSourceLineSuffix("ClaimController.cs:line 42")).toBe("ClaimController.cs");
    expect(stripSourceLineSuffix("ClaimController.cs:line 42-58")).toBe("ClaimController.cs");
  });

  it("leaves titles without line suffixes unchanged", () => {
    expect(stripSourceLineSuffix("README.md")).toBe("README.md");
    expect(stripSourceLineSuffix("api:v1")).toBe("api:v1");
  });

  it("extracts source line numbers from single-line and ranged titles", () => {
    expect(sourceLineNumberFromTitle(undefined, "ClaimController.cs:42")).toBe(42);
    expect(sourceLineNumberFromTitle(undefined, "ClaimController.cs:42-58")).toBe(42);
    expect(sourceLineNumberFromTitle(undefined, "ClaimController.cs:line 42")).toBe(42);
    expect(sourceLineNumberFromTitle(undefined, "ClaimController.cs:line 42-58")).toBe(42);
  });

  it("prefers explicit positive line numbers over title suffixes", () => {
    expect(sourceLineNumberFromTitle(7, "ClaimController.cs:42-58")).toBe(7);
    expect(sourceLineNumberFromTitle(0, "ClaimController.cs:42-58")).toBe(42);
    expect(sourceLineNumberFromTitle(undefined, "README.md")).toBeUndefined();
  });
});
