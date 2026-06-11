import { afterEach, describe, expect, it } from "vitest";
import { getSettings, resetSettingsForTests } from "../src/settings.js";

describe("settings", () => {
  const previousReviewStaleAgeHours = process.env.REVIEW_STALE_AGE_HOURS;

  afterEach(() => {
    if (previousReviewStaleAgeHours === undefined) {
      delete process.env.REVIEW_STALE_AGE_HOURS;
    } else {
      process.env.REVIEW_STALE_AGE_HOURS = previousReviewStaleAgeHours;
    }
    resetSettingsForTests();
  });

  it("defaults review stale age to 24 hours", () => {
    delete process.env.REVIEW_STALE_AGE_HOURS;
    resetSettingsForTests();

    expect(getSettings().reviewStaleAgeHours).toBe(24);
  });

  it("reads review stale age from the environment", () => {
    process.env.REVIEW_STALE_AGE_HOURS = "6";
    resetSettingsForTests();

    expect(getSettings().reviewStaleAgeHours).toBe(6);
  });
});
