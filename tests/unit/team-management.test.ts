/**
 * Unit tests for team management.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createTeamManager } from "../../src/agents/teams.js";

const TEST_DIR = "/tmp/cc-middleware-teams-test";
const TEAMS_DIR = join(TEST_DIR, "teams");
const TASKS_DIR = join(TEST_DIR, "tasks");

beforeAll(() => {
  // Create team config
  mkdirSync(join(TEAMS_DIR, "test-team"), { recursive: true });
  writeFileSync(
    join(TEAMS_DIR, "test-team", "config.json"),
    JSON.stringify({
      name: "test-team",
      members: [
        { name: "reviewer", agentId: "code-reviewer", agentType: "agent", status: "idle" },
        { name: "implementer", agentId: "code-writer", agentType: "agent", status: "active" },
      ],
    })
  );

  // Create task files
  mkdirSync(join(TASKS_DIR, "test-team"), { recursive: true });
  writeFileSync(
    join(TASKS_DIR, "test-team", "task-1.json"),
    JSON.stringify({
      id: "task-1",
      description: "Review the PR",
      status: "in_progress",
      assignee: "reviewer",
      dependencies: [],
    })
  );
  writeFileSync(
    join(TASKS_DIR, "test-team", "task-2.json"),
    JSON.stringify({
      id: "task-2",
      description: "Fix the bugs",
      status: "pending",
      assignee: "implementer",
      dependencies: ["task-1"],
    })
  );
});

afterAll(() => {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {
    // Ignore
  }
});

describe("TeamManager", () => {
  it("should discover teams from directory", async () => {
    const manager = createTeamManager({
      teamsDir: TEAMS_DIR,
      tasksDir: TASKS_DIR,
    });

    const teams = await manager.discoverTeams();
    expect(teams).toHaveLength(1);
    expect(teams[0].name).toBe("test-team");
    expect(teams[0].members).toHaveLength(2);
  });

  it("should get a specific team by name", async () => {
    const manager = createTeamManager({
      teamsDir: TEAMS_DIR,
      tasksDir: TASKS_DIR,
    });

    const team = await manager.getTeam("test-team");
    expect(team).toBeDefined();
    expect(team!.name).toBe("test-team");
    expect(team!.members).toHaveLength(2);

    const reviewer = team!.members.find((m) => m.name === "reviewer");
    expect(reviewer).toBeDefined();
    expect(reviewer!.agentId).toBe("code-reviewer");
    expect(reviewer!.status).toBe("idle");

    const implementer = team!.members.find((m) => m.name === "implementer");
    expect(implementer).toBeDefined();
    expect(implementer!.status).toBe("active");
  });

  it("should return undefined for non-existent team", async () => {
    const manager = createTeamManager({
      teamsDir: TEAMS_DIR,
      tasksDir: TASKS_DIR,
    });

    const team = await manager.getTeam("nonexistent");
    expect(team).toBeUndefined();
  });

  it("should read team tasks", async () => {
    const manager = createTeamManager({
      teamsDir: TEAMS_DIR,
      tasksDir: TASKS_DIR,
    });

    const tasks = await manager.getTeamTasks("test-team");
    expect(tasks).toHaveLength(2);

    const task1 = tasks.find((t) => t.id === "task-1");
    expect(task1).toBeDefined();
    expect(task1!.description).toBe("Review the PR");
    expect(task1!.status).toBe("in_progress");
    expect(task1!.assignee).toBe("reviewer");
    expect(task1!.dependencies).toEqual([]);

    const task2 = tasks.find((t) => t.id === "task-2");
    expect(task2).toBeDefined();
    expect(task2!.status).toBe("pending");
    expect(task2!.dependencies).toEqual(["task-1"]);
  });

  it("should handle non-existent teams directory", async () => {
    const manager = createTeamManager({
      teamsDir: "/nonexistent/teams",
      tasksDir: "/nonexistent/tasks",
    });

    const teams = await manager.discoverTeams();
    expect(teams).toEqual([]);
  });

  it("should handle non-existent tasks directory", async () => {
    const manager = createTeamManager({
      teamsDir: TEAMS_DIR,
      tasksDir: "/nonexistent/tasks",
    });

    const tasks = await manager.getTeamTasks("test-team");
    expect(tasks).toEqual([]);
  });
});
