import { describe, expect, it } from "vitest";
import { buildSDKOptions } from "../../src/sessions/utils.js";

describe("session utils", () => {
  it("omits synthetic placeholder models from SDK launch options", () => {
    expect(buildSDKOptions({ prompt: "Continue", model: "<synthetic>" })).not.toHaveProperty("model");
    expect(buildSDKOptions({ prompt: "Continue", model: "synthetic" })).not.toHaveProperty("model");
  });

  it("preserves real model identifiers in SDK launch options", () => {
    expect(buildSDKOptions({ prompt: "Continue", model: "claude-sonnet-4-5" })).toMatchObject({
      model: "claude-sonnet-4-5",
    });
  });
});
