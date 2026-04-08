/**
 * Configuration commands for Claude settings, inventory, and runtime state.
 */

import { Command } from "commander";
import chalk from "chalk";
import { MiddlewareClient } from "../client.js";
import { printTable, printJson, printKeyValue, printError, printSuccess, truncate } from "../output.js";
import type { OutputOptions } from "../output.js";

export function registerConfigCommands(parent: Command): void {
  const config = parent.command("config").description("Manage configuration");

  config
    .command("show")
    .description("Show effective merged settings")
    .option("--scope <scope>", "Show only one scope (user/project/local/managed)")
    .action(async (opts) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        if (opts.scope) {
          const result = await client.get<Record<string, unknown>>(
            `/api/v1/config/settings/${opts.scope}`,
          );

          if (outputOpts.json) {
            printJson(result);
          } else {
            console.log(chalk.bold(`\nSettings (${opts.scope} scope)\n`));
            const content = (result.content ?? result.settings ?? result) as Record<string, unknown>;
            printKeyValue(flattenObject(content), outputOpts);
            console.log("");
          }
        } else {
          const result = await client.get<Record<string, unknown>>("/api/v1/config/settings");

          if (outputOpts.json) {
            printJson(result);
          } else {
            console.log(chalk.bold("\nEffective Settings (merged)\n"));

            const settings = (result.settings ?? result) as Record<string, unknown>;
            const provenance = (result.provenance ?? {}) as Record<string, string>;
            const flat = flattenObject(settings);

            const headers = ["Key", "Value", "Source"];
            const rows = Object.entries(flat).map(([key, value]) => {
              const source = provenance[key] ?? "";
              return [
                key,
                truncate(formatValue(value), 50),
                source ? colorByScope(source, outputOpts) : "",
              ];
            });
            printTable(headers, rows, outputOpts);
            console.log("");
          }
        }
      } catch (err) {
        printError("Failed to get settings", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("get <key>")
    .description("Get a specific setting value")
    .action(async (key: string) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<Record<string, unknown>>("/api/v1/config/settings");
        const settings = (result.settings ?? result) as Record<string, unknown>;
        const provenance = (result.provenance ?? {}) as Record<string, string>;

        const flat = flattenObject(settings);
        const value = flat[key];

        if (value === undefined) {
          printError(`Setting not found: ${key}`);
          process.exit(1);
        }

        if (outputOpts.json) {
          printJson({ key, value, source: provenance[key] ?? "unknown" });
        } else {
          const source = provenance[key] ?? "";
          console.log(`${key} = ${formatValue(value)}${source ? chalk.dim(` (from: ${source})`) : ""}`);
        }
      } catch (err) {
        printError("Failed to get setting", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("set <key> <value>")
    .description("Set a setting value")
    .option("--scope <scope>", "Settings scope to write to", "project")
    .action(async (key: string, value: string, opts) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      if (opts.scope === "managed") {
        printError("Cannot modify managed settings");
        process.exit(1);
      }

      // Try to parse value as JSON, fall back to string
      let parsedValue: unknown = value;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        // Keep as string
      }

      try {
        await client.put(`/api/v1/config/settings/${opts.scope}`, { key, value: parsedValue });

        if (outputOpts.json) {
          printJson({ key, value: parsedValue, scope: opts.scope });
        } else {
          printSuccess(`Set ${key} = ${formatValue(parsedValue)} in ${opts.scope}`);
        }
      } catch (err) {
        printError("Failed to set setting", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("global")
    .description("Show sanitized Claude global config summary")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<GlobalConfigRow>("/api/v1/config/global");

        if (outputOpts.json) {
          printJson(result);
        } else {
          console.log(chalk.bold("\nClaude Global Config\n"));
          printKeyValue(
            flattenObject({
              path: result.path,
              exists: result.exists,
              featureFlagCount: result.featureFlagCount,
              userMcpCount: result.userMcpCount,
              trackedProjectCount: result.trackedProjectCount,
              stats: result.stats ?? {},
              preferences: result.preferences ?? {},
            }),
            outputOpts
          );

          const writablePreferences = Array.isArray(result.writablePreferences)
            ? result.writablePreferences
            : [];
          if (writablePreferences.length > 0) {
            console.log("");
            console.log(chalk.bold("Writable Preferences"));
            printTable(
              ["Key", "Type", "Description"],
              writablePreferences.map((pref) => [
                pref.key ?? "",
                pref.valueType ?? "",
                truncate(pref.description ?? "", 60),
              ]),
              outputOpts
            );
          }
          console.log("");
        }
      } catch (err) {
        printError("Failed to get global config", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("global-set <key> <value>")
    .description("Update one documented Claude global preference")
    .action(async (key: string, value: string) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      let parsedValue: unknown = value;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        // Keep as string when not valid JSON
      }

      try {
        const result = await client.put<Record<string, unknown>>(
          `/api/v1/config/global/preferences/${encodeURIComponent(key)}`,
          { value: parsedValue }
        );

        if (outputOpts.json) {
          printJson(result);
        } else {
          printSuccess(`Set global preference ${String(result.key ?? key)} = ${formatValue(result.after)}`);
        }
      } catch (err) {
        printError("Failed to update global preference", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("projects")
    .description("List tracked Claude projects")
    .option("--current", "Show only the current project")
    .option("--path <path>", "Show a specific tracked project path")
    .action(async (opts) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      if (opts.current && opts.path) {
        printError("Use either --current or --path, not both");
        process.exit(1);
      }

      try {
        if (opts.current) {
          const result = await client.get<TrackedProjectRow>("/api/v1/config/projects/current");
          if (outputOpts.json) {
            printJson(result);
          } else {
            console.log(chalk.bold("\nCurrent Tracked Project\n"));
            printKeyValue(flattenObject(result), outputOpts);
            console.log("");
          }
          return;
        }

        if (opts.path) {
          const result = await client.get<TrackedProjectRow>(
            "/api/v1/config/projects/lookup",
            { path: opts.path }
          );
          if (outputOpts.json) {
            printJson(result);
          } else {
            console.log(chalk.bold("\nTracked Project\n"));
            printKeyValue(flattenObject(result), outputOpts);
            console.log("");
          }
          return;
        }

        const result = await client.get<TrackedProjectRow[] | { projects: TrackedProjectRow[] }>("/api/v1/config/projects");
        const projects = Array.isArray(result) ? result : (result.projects ?? []);

        if (outputOpts.json) {
          printJson(projects);
        } else {
          if (projects.length === 0) {
            console.log(chalk.dim("No tracked projects found."));
            return;
          }

          const headers = ["Path", "Tools", "Local MCP", "Trusted"];
          const rows = projects.map((project) => [
            truncate(project.path ?? "", 50),
            String(project.allowedToolsCount ?? 0),
            String(project.localMcpCount ?? 0),
            project.hasTrustDialogAccepted ? chalk.green("yes") : chalk.yellow("no"),
          ]);
          printTable(headers, rows, outputOpts);
        }
      } catch (err) {
        printError("Failed to get tracked projects", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("plugins")
    .description("List plugins")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<PluginRow[] | { plugins: PluginRow[] }>("/api/v1/config/plugins");
        const plugins = Array.isArray(result) ? result : (result.plugins ?? []);

        if (outputOpts.json) {
          printJson(plugins);
        } else {
          if (plugins.length === 0) {
            console.log(chalk.dim("No plugins installed."));
            return;
          }

          const headers = ["Name", "Version", "Enabled", "Scope"];
          const rows = plugins.map((p) => [
            p.name ?? "",
            p.version ?? "",
            p.enabled ? chalk.green("yes") : chalk.red("no"),
            p.scope ?? "",
          ]);
          printTable(headers, rows, outputOpts);
        }
      } catch (err) {
        printError("Failed to list plugins", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("plugins-available")
    .description("List installable plugins from Claude's marketplace catalog")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<AvailablePluginCatalogRow>("/api/v1/config/plugins/available");

        if (outputOpts.json) {
          printJson(result);
        } else {
          const installed = result.installed ?? [];
          const available = result.available ?? [];

          console.log(chalk.bold("\nPlugin Catalog\n"));
          printKeyValue(
            {
              installedCount: installed.length,
              availableCount: available.length,
            },
            outputOpts
          );
          console.log("");

          if (installed.length > 0) {
            console.log(chalk.bold("Installed"));
            printTable(
              ["ID", "Scope", "Enabled"],
              installed.map((plugin) => [
                String(plugin.id ?? ""),
                String(plugin.scope ?? ""),
                plugin.enabled === true ? chalk.green("yes") : chalk.red("no"),
              ]),
              outputOpts
            );
            console.log("");
          }

          if (available.length === 0) {
            console.log(chalk.dim("No available plugins found."));
            return;
          }

          console.log(chalk.bold("Available"));
          printTable(
            ["Name", "Marketplace", "Description"],
            available.map((plugin) => [
              plugin.name ?? plugin.pluginId ?? "",
              plugin.marketplaceName ?? "",
              truncate(plugin.description ?? "", 70),
            ]),
            outputOpts
          );
        }
      } catch (err) {
        printError("Failed to list available plugins", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("plugin-install <name>")
    .description("Install a plugin via Claude CLI")
    .option("--scope <scope>", "Install scope (user/project/local)", "user")
    .option("--marketplace <name>", "Marketplace name")
    .action(async (name: string, opts) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.post<Record<string, unknown>>(
          "/api/v1/config/plugins/install",
          {
            name,
            scope: opts.scope,
            marketplace: opts.marketplace,
          }
        );

        if (outputOpts.json) {
          printJson(result);
        } else {
          printSuccess(`Installed ${String(result.name ?? name)} in ${String(result.scope ?? opts.scope)}`);
        }
      } catch (err) {
        printError("Failed to install plugin", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("plugin-update <name>")
    .description("Update a plugin via Claude CLI")
    .option("--scope <scope>", "Install scope (user/project/local/managed)", "user")
    .action(async (name: string, opts) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.post<Record<string, unknown>>(
          `/api/v1/config/plugins/${encodeURIComponent(name)}/update`,
          { scope: opts.scope }
        );

        if (outputOpts.json) {
          printJson(result);
        } else {
          printSuccess(`Updated ${String(result.name ?? name)} in ${String(result.scope ?? opts.scope)}`);
        }
      } catch (err) {
        printError("Failed to update plugin", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("plugin-uninstall <name>")
    .description("Uninstall a plugin via Claude CLI")
    .option("--scope <scope>", "Install scope (user/project/local)", "user")
    .option("--keep-data", "Preserve plugin data directory")
    .action(async (name: string, opts) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.post<Record<string, unknown>>(
          `/api/v1/config/plugins/${encodeURIComponent(name)}/uninstall`,
          {
            scope: opts.scope,
            keepData: Boolean(opts.keepData),
          }
        );

        if (outputOpts.json) {
          printJson(result);
        } else {
          printSuccess(`Uninstalled ${String(result.name ?? name)} from ${String(result.scope ?? opts.scope)}`);
        }
      } catch (err) {
        printError("Failed to uninstall plugin", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("plugin-provenance <name>")
    .description("Explain why a plugin is active, inactive, or only available")
    .action(async (name: string) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<PluginProvenanceRow>(
          `/api/v1/config/plugins/${encodeURIComponent(name)}/provenance`
        );

        if (outputOpts.json) {
          printJson(result);
        } else {
          console.log(chalk.bold(`\nPlugin Provenance (${result.id ?? name})\n`));
          printKeyValue(
            {
              status: result.status ?? "",
              explanation: result.explanation ?? "",
              installed: result.installed ?? false,
              enabled: result.enabled ?? false,
              runtimeLoaded: result.runtimeLoaded ?? false,
              marketplaceKnown: result.marketplaceKnown ?? false,
              marketplaceAvailable: result.marketplaceAvailable ?? false,
              catalogAvailable: result.catalogAvailable ?? false,
              blocked: result.blocked ?? false,
              enabledSourceScope: result.enabledSourceScope ?? "",
            },
            outputOpts
          );

          const sources = Array.isArray(result.enablementSources)
            ? result.enablementSources
            : [];
          if (sources.length > 0) {
            console.log("");
            console.log(chalk.bold("Enablement Sources"));
            printTable(
              ["Scope", "Declared", "Value", "Path"],
              sources.map((source) => [
                source.scope ?? "",
                source.declared ? chalk.green("yes") : chalk.dim("no"),
                typeof source.value === "boolean"
                  ? (source.value ? chalk.green("true") : chalk.red("false"))
                  : chalk.dim("n/a"),
                truncate(source.settingsPath ?? "", 50),
              ]),
              outputOpts
            );
          }

          if (result.runtimeInspectionError || result.catalogError) {
            console.log("");
            printKeyValue(
              {
                runtimeInspectionError: result.runtimeInspectionError ?? "",
                catalogError: result.catalogError ?? "",
              },
              outputOpts
            );
          }
          console.log("");
        }
      } catch (err) {
        printError("Failed to inspect plugin provenance", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("marketplaces")
    .description("List known Claude plugin marketplaces")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<MarketplaceRow[] | { marketplaces: MarketplaceRow[] }>("/api/v1/config/marketplaces");
        const marketplaces = Array.isArray(result) ? result : (result.marketplaces ?? []);

        if (outputOpts.json) {
          printJson(marketplaces);
        } else {
          if (marketplaces.length === 0) {
            console.log(chalk.dim("No marketplaces configured."));
            return;
          }

          const headers = ["Name", "Available", "Installed", "Blocked", "Exists"];
          const rows = marketplaces.map((marketplace) => [
            marketplace.name ?? "",
            String(marketplace.pluginCount ?? 0),
            String(marketplace.installedCount ?? 0),
            String(marketplace.blockedCount ?? 0),
            marketplace.exists ? chalk.green("yes") : chalk.red("no"),
          ]);
          printTable(headers, rows, outputOpts);
        }
      } catch (err) {
        printError("Failed to list marketplaces", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("marketplace-add <source>")
    .description("Add a Claude plugin marketplace via Claude CLI")
    .option("--scope <scope>", "Declaration scope (user/project/local)", "user")
    .option("--sparse <paths...>", "Sparse checkout directories")
    .action(async (source: string, opts) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.post<Record<string, unknown>>(
          "/api/v1/config/marketplaces",
          {
            source,
            scope: opts.scope,
            sparse: opts.sparse,
          }
        );

        if (outputOpts.json) {
          printJson(result);
        } else {
          printSuccess(`Added marketplace from ${source}`);
        }
      } catch (err) {
        printError("Failed to add marketplace", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("marketplace-remove <name>")
    .description("Remove a Claude plugin marketplace via Claude CLI")
    .action(async (name: string) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.delete<Record<string, unknown>>(
          `/api/v1/config/marketplaces/${encodeURIComponent(name)}`
        );

        if (outputOpts.json) {
          printJson(result);
        } else {
          printSuccess(`Removed marketplace ${name}`);
        }
      } catch (err) {
        printError("Failed to remove marketplace", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("marketplace-update [name]")
    .description("Update one or all Claude plugin marketplaces via Claude CLI")
    .action(async (name?: string) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.post<Record<string, unknown>>(
          "/api/v1/config/marketplaces/update",
          name ? { name } : {}
        );

        if (outputOpts.json) {
          printJson(result);
        } else {
          printSuccess(name ? `Updated marketplace ${name}` : "Updated marketplaces");
        }
      } catch (err) {
        printError("Failed to update marketplace", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("marketplace-plugins <name>")
    .description("List available plugins from one marketplace")
    .action(async (name: string) => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<{
          marketplace?: MarketplaceRow;
          plugins?: MarketplacePluginRow[];
        }>(`/api/v1/config/marketplaces/${encodeURIComponent(name)}/plugins`);
        const plugins = result.plugins ?? [];

        if (outputOpts.json) {
          printJson(result);
        } else {
          console.log(chalk.bold(`\nMarketplace Plugins (${name})\n`));

          if (result.marketplace) {
            printKeyValue(
              flattenObject({
                marketplace: {
                  name: result.marketplace.name,
                  installLocation: result.marketplace.installLocation,
                  pluginCount: result.marketplace.pluginCount,
                  installedCount: result.marketplace.installedCount,
                  blockedCount: result.marketplace.blockedCount,
                },
              }),
              outputOpts
            );
            console.log("");
          }

          if (plugins.length === 0) {
            console.log(chalk.dim("No marketplace plugins found."));
            return;
          }

          const headers = ["Name", "Type", "Installed", "Enabled", "Components"];
          const rows = plugins.map((plugin) => [
            plugin.name ?? "",
            plugin.sourceType ?? "",
            plugin.installed ? chalk.green("yes") : chalk.dim("no"),
            plugin.enabled ? chalk.green("yes") : chalk.dim("no"),
            [
              plugin.commandCount ? `cmd:${plugin.commandCount}` : "",
              plugin.skillCount ? `skill:${plugin.skillCount}` : "",
              plugin.agentCount ? `agent:${plugin.agentCount}` : "",
              plugin.hasHooks ? "hooks" : "",
              plugin.hasMcpServers ? "mcp" : "",
            ].filter(Boolean).join(", "),
          ]);
          printTable(headers, rows, outputOpts);
        }
      } catch (err) {
        printError("Failed to list marketplace plugins", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("mcp")
    .description("List MCP servers")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<McpRow[] | { servers: McpRow[] }>("/api/v1/config/mcp");
        const servers = Array.isArray(result) ? result : (result.servers ?? []);

        if (outputOpts.json) {
          printJson(servers);
        } else {
          if (servers.length === 0) {
            console.log(chalk.dim("No MCP servers configured."));
            return;
          }

          const headers = ["Name", "Transport", "Scope", "Command/URL"];
          const rows = servers.map((s) => [
            s.name ?? "",
            s.transport ?? s.type ?? "",
            s.scope ?? "",
            truncate(String(s.command ?? s.url ?? ""), 40),
          ]);
          printTable(headers, rows, outputOpts);
        }
      } catch (err) {
        printError("Failed to list MCP servers", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("runtime")
    .description("Inspect effective Claude runtime inventory")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<RuntimeRow>("/api/v1/config/runtime");

        if (outputOpts.json) {
          printJson(result);
        } else {
          console.log(chalk.bold("\nClaude Runtime\n"));
          printKeyValue(
            {
              cwd: result.cwd ?? "",
              model: result.model ?? "",
              permissionMode: result.permissionMode ?? "",
              claudeCodeVersion: result.claudeCodeVersion ?? "",
              outputStyle: result.outputStyle ?? "",
              toolsCount: result.toolsCount ?? 0,
              slashCommandCount: result.slashCommands?.length ?? 0,
              skillCount: result.skills?.length ?? 0,
              agentCount: result.agents?.length ?? 0,
              pluginCount: result.plugins?.length ?? 0,
              mcpServerCount: result.mcpServers?.length ?? 0,
            },
            outputOpts
          );
          console.log("");

          if ((result.plugins?.length ?? 0) > 0) {
            console.log(chalk.bold("Runtime Plugins"));
            printTable(
              ["Name", "Source", "Path"],
              result.plugins!.map((plugin) => [
                plugin.name ?? "",
                plugin.source ?? "",
                truncate(plugin.path ?? "", 50),
              ]),
              outputOpts
            );
            console.log("");
          }
        }
      } catch (err) {
        printError("Failed to inspect runtime", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("skills")
    .description("List skills")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<SkillRow[] | { skills: SkillRow[] }>("/api/v1/config/skills");
        const skills = Array.isArray(result) ? result : (result.skills ?? []);

        if (outputOpts.json) {
          printJson(skills);
        } else {
          if (skills.length === 0) {
            console.log(chalk.dim("No skills found."));
            return;
          }

          const headers = ["Name", "Scope", "Description"];
          const rows = skills.map((s) => [
            s.qualifiedName ?? s.name ?? "",
            s.scope ?? "",
            truncate(s.description ?? "", 50),
          ]);
          printTable(headers, rows, outputOpts);
        }
      } catch (err) {
        printError("Failed to list skills", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("commands")
    .description("List legacy slash commands")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<CommandRow[] | { commands: CommandRow[] }>("/api/v1/config/commands");
        const commands = Array.isArray(result) ? result : (result.commands ?? []);

        if (outputOpts.json) {
          printJson(commands);
        } else {
          if (commands.length === 0) {
            console.log(chalk.dim("No commands found."));
            return;
          }

          const headers = ["Name", "Scope", "Description"];
          const rows = commands.map((command) => [
            command.qualifiedName ?? command.name ?? "",
            command.scope ?? "",
            truncate(command.description ?? "", 50),
          ]);
          printTable(headers, rows, outputOpts);
        }
      } catch (err) {
        printError("Failed to list commands", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("agents")
    .description("List agent definitions (file-based)")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<AgentDefRow[] | { agents: AgentDefRow[] }>("/api/v1/config/agents");
        const agents = Array.isArray(result) ? result : (result.agents ?? []);

        if (outputOpts.json) {
          printJson(agents);
        } else {
          if (agents.length === 0) {
            console.log(chalk.dim("No agent definitions found."));
            return;
          }

          const headers = ["Name", "Scope", "Model", "Description", "Path"];
          const rows = agents.map((a) => [
            a.qualifiedName ?? a.name ?? "",
            a.scope ?? "",
            a.model ?? "",
            truncate(a.description ?? "", 30),
            truncate(a.path ?? "", 30),
          ]);
          printTable(headers, rows, outputOpts);
        }
      } catch (err) {
        printError("Failed to list agent definitions", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  config
    .command("memory")
    .description("Show memory index")
    .action(async () => {
      const globalOpts = parent.opts();
      const outputOpts = getOutputOpts(globalOpts);
      const client = new MiddlewareClient(globalOpts.server);

      try {
        const result = await client.get<Record<string, unknown>>("/api/v1/config/memory");

        if (outputOpts.json) {
          printJson(result);
        } else {
          const index = result.index ?? result.content ?? "";
          if (index) {
            console.log(chalk.bold("\nMemory Index:\n"));
            console.log(String(index));
          }

          const files = (result.files ?? []) as MemoryFileRow[];
          if (files.length > 0) {
            console.log(chalk.bold("\nMemory Files:"));
            const headers = ["Name", "Type", "Last Modified"];
            const rows = files.map((f) => [
              f.name ?? "",
              f.type ?? "",
              f.lastModified ? new Date(f.lastModified).toLocaleDateString() : "",
            ]);
            printTable(headers, rows, outputOpts);
          } else if (!index) {
            console.log(chalk.dim("No memory data found."));
          }
          console.log("");
        }
      } catch (err) {
        printError("Failed to get memory", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

/** Flatten a nested object into dot-notation key-value pairs */
function flattenObject(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

/** Format a value for display */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Color a scope label */
function colorByScope(scope: string, opts: OutputOptions): string {
  if (opts.noColor) return scope;
  switch (scope) {
    case "user":
      return chalk.blue(scope);
    case "project":
      return chalk.green(scope);
    case "local":
      return chalk.yellow(scope);
    case "managed":
      return chalk.red(scope);
    default:
      return chalk.dim(scope);
  }
}

function getOutputOpts(globalOpts: Record<string, unknown>): OutputOptions {
  return {
    json: (globalOpts.json as boolean) ?? false,
    verbose: (globalOpts.verbose as boolean) ?? false,
    noColor: !(globalOpts.color as boolean),
  };
}

interface PluginRow {
  name?: string;
  version?: string;
  enabled?: boolean;
  scope?: string;
  [key: string]: unknown;
}

interface AvailablePluginCatalogRow {
  installed?: PluginRow[];
  available?: AvailablePluginRow[];
  [key: string]: unknown;
}

interface AvailablePluginRow {
  pluginId?: string;
  name?: string;
  marketplaceName?: string;
  description?: string;
  [key: string]: unknown;
}

interface GlobalConfigRow {
  path?: string;
  exists?: boolean;
  stats?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  writablePreferences?: Array<{
    key?: string;
    valueType?: string;
    description?: string;
  }>;
  featureFlagCount?: number;
  userMcpCount?: number;
  trackedProjectCount?: number;
  [key: string]: unknown;
}

interface TrackedProjectRow {
  path?: string;
  allowedToolsCount?: number;
  localMcpCount?: number;
  hasTrustDialogAccepted?: boolean;
  [key: string]: unknown;
}

interface MarketplaceRow {
  name?: string;
  exists?: boolean;
  installLocation?: string;
  pluginCount?: number;
  installedCount?: number;
  blockedCount?: number;
  [key: string]: unknown;
}

interface MarketplacePluginRow {
  name?: string;
  sourceType?: string;
  installed?: boolean;
  enabled?: boolean;
  commandCount?: number;
  skillCount?: number;
  agentCount?: number;
  hasHooks?: boolean;
  hasMcpServers?: boolean;
  [key: string]: unknown;
}

interface McpRow {
  name?: string;
  transport?: string;
  type?: string;
  scope?: string;
  command?: string;
  url?: string;
  [key: string]: unknown;
}

interface SkillRow {
  name?: string;
  qualifiedName?: string;
  scope?: string;
  description?: string;
  [key: string]: unknown;
}

interface CommandRow {
  name?: string;
  qualifiedName?: string;
  scope?: string;
  description?: string;
  [key: string]: unknown;
}

interface AgentDefRow {
  name?: string;
  qualifiedName?: string;
  scope?: string;
  model?: string;
  description?: string;
  path?: string;
  [key: string]: unknown;
}

interface MemoryFileRow {
  name?: string;
  type?: string;
  lastModified?: string | number;
  [key: string]: unknown;
}

interface RuntimeRow {
  cwd?: string;
  model?: string;
  permissionMode?: string;
  claudeCodeVersion?: string;
  outputStyle?: string;
  toolsCount?: number;
  slashCommands?: string[];
  skills?: string[];
  agents?: string[];
  plugins?: Array<{ name?: string; source?: string; path?: string }>;
  mcpServers?: Array<{ name?: string; status?: string }>;
  [key: string]: unknown;
}

interface PluginProvenanceRow {
  id?: string;
  status?: string;
  explanation?: string;
  installed?: boolean;
  enabled?: boolean;
  runtimeLoaded?: boolean;
  marketplaceKnown?: boolean;
  marketplaceAvailable?: boolean;
  catalogAvailable?: boolean;
  blocked?: boolean;
  enabledSourceScope?: string;
  runtimeInspectionError?: string;
  catalogError?: string;
  enablementSources?: Array<{
    scope?: string;
    declared?: boolean;
    value?: boolean;
    settingsPath?: string;
  }>;
  [key: string]: unknown;
}
