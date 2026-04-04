/**
 * Team management.
 * Discovers and manages agent teams from the filesystem.
 * Teams are experimental (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1).
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

/** Information about a team */
export interface TeamInfo {
  name: string;
  configPath: string;
  members: TeamMemberInfo[];
  taskListPath: string;
}

/** Information about a team member */
export interface TeamMemberInfo {
  name: string;
  agentId: string;
  agentType?: string;
  status: "active" | "idle" | "stopped";
}

/** A task in a team's task list */
export interface TeamTaskInfo {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "completed";
  assignee?: string;
  dependencies: string[];
}

/**
 * Team manager for discovering and managing agent teams.
 */
export class TeamManager {
  private teamsDir: string;
  private tasksDir: string;

  constructor(options?: { teamsDir?: string; tasksDir?: string }) {
    this.teamsDir =
      options?.teamsDir ?? join(homedir(), ".claude", "teams");
    this.tasksDir =
      options?.tasksDir ?? join(homedir(), ".claude", "tasks");
  }

  /**
   * Discover existing teams from the filesystem.
   */
  async discoverTeams(): Promise<TeamInfo[]> {
    try {
      const entries = await readdir(this.teamsDir, { withFileTypes: true });
      const teams: TeamInfo[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const team = await this.readTeamConfig(entry.name);
          if (team) {
            teams.push(team);
          }
        }
      }

      return teams;
    } catch {
      // Directory doesn't exist
      return [];
    }
  }

  /**
   * Get a specific team by name.
   */
  async getTeam(name: string): Promise<TeamInfo | undefined> {
    return this.readTeamConfig(name);
  }

  /**
   * Read team tasks from the task list directory.
   */
  async getTeamTasks(teamName: string): Promise<TeamTaskInfo[]> {
    const taskDir = join(this.tasksDir, teamName);

    try {
      const entries = await readdir(taskDir, { withFileTypes: true });
      const tasks: TeamTaskInfo[] = [];

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".json")) {
          try {
            const content = await readFile(join(taskDir, entry.name), "utf-8");
            const data = JSON.parse(content) as Record<string, unknown>;
            tasks.push({
              id: (data.id as string) ?? entry.name.replace(".json", ""),
              description: (data.description as string) ?? "",
              status:
                (data.status as TeamTaskInfo["status"]) ?? "pending",
              assignee: data.assignee as string | undefined,
              dependencies: (data.dependencies as string[]) ?? [],
            });
          } catch {
            // Skip invalid task files
          }
        }
      }

      return tasks;
    } catch {
      // Task directory doesn't exist
      return [];
    }
  }

  /**
   * Read a team config from the filesystem.
   */
  private async readTeamConfig(
    teamName: string
  ): Promise<TeamInfo | undefined> {
    const configPath = join(this.teamsDir, teamName, "config.json");
    const taskListPath = join(this.tasksDir, teamName);

    try {
      const content = await readFile(configPath, "utf-8");
      const data = JSON.parse(content) as Record<string, unknown>;

      const members: TeamMemberInfo[] = [];
      if (Array.isArray(data.members)) {
        for (const m of data.members) {
          const member = m as Record<string, unknown>;
          members.push({
            name: (member.name as string) ?? "",
            agentId: (member.agentId as string) ?? (member.agent_id as string) ?? "",
            agentType: member.agentType as string | undefined,
            status: (member.status as TeamMemberInfo["status"]) ?? "idle",
          });
        }
      }

      return {
        name: (data.name as string) ?? teamName,
        configPath,
        members,
        taskListPath,
      };
    } catch {
      return undefined;
    }
  }
}

/**
 * Create a new team manager.
 */
export function createTeamManager(options?: {
  teamsDir?: string;
  tasksDir?: string;
}): TeamManager {
  return new TeamManager(options);
}
