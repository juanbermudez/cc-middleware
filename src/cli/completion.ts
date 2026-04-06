/**
 * Shell completion script generation for the CLI.
 */

import { Command } from "commander";

export function registerCompletionCommand(parent: Command): void {
  parent
    .command("completion")
    .description("Generate shell completion script")
    .argument("<shell>", "Shell type: bash, zsh, fish")
    .action((shell: string) => {
      switch (shell) {
        case "bash":
          console.log(generateBashCompletion());
          break;
        case "zsh":
          console.log(generateZshCompletion());
          break;
        case "fish":
          console.log(generateFishCompletion());
          break;
        default:
          console.error(`Unsupported shell: ${shell}. Supported: bash, zsh, fish`);
          process.exit(1);
      }
    });
}

function generateBashCompletion(): string {
  return `# ccm bash completion
# Add to ~/.bashrc: eval "$(ccm completion bash)"

_ccm_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local prev="\${COMP_WORDS[COMP_CWORD-1]}"
  local commands="server sessions hooks agents teams permissions config completion"
  local server_cmds="start stop status"
  local sessions_cmds="list show launch resume stream search"
  local hooks_cmds="listen list"
  local agents_cmds="list show create"
  local teams_cmds="list show"
  local permissions_cmds="list add pending approve deny"
  local config_cmds="show get set plugins mcp skills agents memory"

  case "\${COMP_WORDS[1]}" in
    server) COMPREPLY=( $(compgen -W "\${server_cmds}" -- "\${cur}") ) ;;
    sessions) COMPREPLY=( $(compgen -W "\${sessions_cmds}" -- "\${cur}") ) ;;
    hooks) COMPREPLY=( $(compgen -W "\${hooks_cmds}" -- "\${cur}") ) ;;
    agents) COMPREPLY=( $(compgen -W "\${agents_cmds}" -- "\${cur}") ) ;;
    teams) COMPREPLY=( $(compgen -W "\${teams_cmds}" -- "\${cur}") ) ;;
    permissions) COMPREPLY=( $(compgen -W "\${permissions_cmds}" -- "\${cur}") ) ;;
    config) COMPREPLY=( $(compgen -W "\${config_cmds}" -- "\${cur}") ) ;;
    *) COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") ) ;;
  esac
}

complete -F _ccm_completions ccm`;
}

function generateZshCompletion(): string {
  return `#compdef ccm
# ccm zsh completion
# Add to ~/.zshrc: eval "$(ccm completion zsh)"

_ccm() {
  local -a commands
  commands=(
    'server:Manage the middleware server'
    'sessions:Manage Claude Code sessions'
    'hooks:Hook events'
    'agents:Manage agent definitions'
    'teams:Manage agent teams'
    'permissions:Manage permission policies'
    'config:Manage configuration'
    'completion:Generate shell completion script'
  )

  _arguments -C \\
    '-j[Output as JSON]' \\
    '--json[Output as JSON]' \\
    '-s[Middleware server URL]:url:' \\
    '--server[Middleware server URL]:url:' \\
    '-v[Verbose output]' \\
    '--verbose[Verbose output]' \\
    '--no-color[Disable colors]' \\
    '--auto-start[Auto-start server if not running]' \\
    '1:command:->cmds' \\
    '*:: :->args'

  case "$state" in
    cmds)
      _describe 'command' commands
      ;;
    args)
      case "\${words[1]}" in
        server)
          local -a subcmds=('start:Start the middleware server' 'stop:Stop the middleware server' 'status:Show server status')
          _describe 'subcommand' subcmds
          ;;
        sessions)
          local -a subcmds=('list:List sessions' 'show:Show session details' 'launch:Launch a new session' 'resume:Resume a session' 'stream:Stream session output' 'search:Search sessions')
          _describe 'subcommand' subcmds
          ;;
        hooks)
          local -a subcmds=('listen:Live-stream hook events' 'list:List event types and subscriptions')
          _describe 'subcommand' subcmds
          ;;
        agents)
          local -a subcmds=('list:List all agents' 'show:Show agent details' 'create:Create a new agent')
          _describe 'subcommand' subcmds
          ;;
        teams)
          local -a subcmds=('list:List active teams' 'show:Show team details')
          _describe 'subcommand' subcmds
          ;;
        permissions)
          local -a subcmds=('list:List policies' 'add:Add a rule' 'pending:Show pending requests' 'approve:Approve a request' 'deny:Deny a request')
          _describe 'subcommand' subcmds
          ;;
        config)
          local -a subcmds=('show:Show settings' 'get:Get a setting' 'set:Set a setting' 'plugins:List plugins' 'mcp:List MCP servers' 'skills:List skills' 'agents:List agent definitions' 'memory:Show memory')
          _describe 'subcommand' subcmds
          ;;
      esac
      ;;
  esac
}

_ccm`;
}

function generateFishCompletion(): string {
  return `# ccm fish completion
# Save to: ~/.config/fish/completions/ccm.fish

# Top-level commands
complete -c ccm -n "__fish_use_subcommand" -a "server" -d "Manage the middleware server"
complete -c ccm -n "__fish_use_subcommand" -a "sessions" -d "Manage Claude Code sessions"
complete -c ccm -n "__fish_use_subcommand" -a "hooks" -d "Hook events"
complete -c ccm -n "__fish_use_subcommand" -a "agents" -d "Manage agent definitions"
complete -c ccm -n "__fish_use_subcommand" -a "teams" -d "Manage agent teams"
complete -c ccm -n "__fish_use_subcommand" -a "permissions" -d "Manage permission policies"
complete -c ccm -n "__fish_use_subcommand" -a "config" -d "Manage configuration"
complete -c ccm -n "__fish_use_subcommand" -a "completion" -d "Generate shell completion"

# server subcommands
complete -c ccm -n "__fish_seen_subcommand_from server" -a "start" -d "Start the server"
complete -c ccm -n "__fish_seen_subcommand_from server" -a "stop" -d "Stop the server"
complete -c ccm -n "__fish_seen_subcommand_from server" -a "status" -d "Show status"

# sessions subcommands
complete -c ccm -n "__fish_seen_subcommand_from sessions" -a "list" -d "List sessions"
complete -c ccm -n "__fish_seen_subcommand_from sessions" -a "show" -d "Show session details"
complete -c ccm -n "__fish_seen_subcommand_from sessions" -a "launch" -d "Launch a new session"
complete -c ccm -n "__fish_seen_subcommand_from sessions" -a "resume" -d "Resume a session"
complete -c ccm -n "__fish_seen_subcommand_from sessions" -a "stream" -d "Stream session output"
complete -c ccm -n "__fish_seen_subcommand_from sessions" -a "search" -d "Search sessions"

# Global flags
complete -c ccm -l json -s j -d "Output as JSON"
complete -c ccm -l server -s s -d "Middleware server URL" -r
complete -c ccm -l verbose -s v -d "Verbose output"
complete -c ccm -l no-color -d "Disable colors"
complete -c ccm -l auto-start -d "Auto-start server"`;
}
