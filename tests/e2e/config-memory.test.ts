/**
 * E2E test: Memory reader.
 * Tests reading project memory from real filesystem.
 */

import { describe, it, expect } from "vitest";
import { readProjectMemory, listAllProjectMemories, encodeProjectKey } from "../../src/config/memory.js";

describe("Memory Reader (E2E)", () => {
  it("should encode project key correctly", () => {
    const key = encodeProjectKey("/Users/zef/Desktop/cc-middleware");
    expect(key).toBe("-Users-zef-Desktop-cc-middleware");
  });

  it("should read project memory for current directory", async () => {
    const memory = await readProjectMemory(process.cwd());

    expect(memory.projectKey).toBeTruthy();
    expect(memory.memoryDir).toContain("memory");
    expect(memory.indexPath).toContain("MEMORY.md");

    // This project should have a MEMORY.md based on research docs
    if (memory.indexContent) {
      expect(memory.indexContent.length).toBeGreaterThan(0);
    }
  });

  it("should return memory files if they exist", async () => {
    const memory = await readProjectMemory(process.cwd());

    if (memory.files.length > 0) {
      const file = memory.files[0];
      expect(file.name).toBeTruthy();
      expect(file.path).toContain(".md");
      expect(file.content).toBeTruthy();
      expect(file.lastModified).toBeGreaterThan(0);
      expect(["user", "feedback", "project", "reference"]).toContain(file.type);
    }
  });

  it("should list all project memories", async () => {
    const memories = await listAllProjectMemories();

    expect(Array.isArray(memories)).toBe(true);

    // There should be at least one project with memory
    if (memories.length > 0) {
      expect(memories[0].projectKey).toBeTruthy();
      expect(memories[0].dir).toContain("memory");
    }
  });

  it("should handle non-existent project gracefully", async () => {
    const memory = await readProjectMemory("/nonexistent/path/12345");

    expect(memory.projectKey).toBeTruthy();
    expect(memory.indexContent).toBe("");
    expect(memory.files).toEqual([]);
  });
});
