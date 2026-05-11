# Plugin Marketplace

ailiance-agent supports the Claude Code plugin format. You can install plugins from any Git repository.

## Quick start

```bash
# Short github form
aki plugin install obra/superpowers
aki plugin install TechDufus/oh-my-claude
aki plugin install affaan-m/everything-claude-code

# Full URL
aki plugin install https://github.com/foo/bar.git

# Specific branch or tag
aki plugin install user/repo@v1.0.0

# Specific commit
aki plugin install user/repo#abc123def

# List installed plugins
aki plugin list

# Update all plugins
aki plugin update

# Update a specific plugin
aki plugin update superpowers

# Remove a plugin
aki plugin remove superpowers
```

## Expected plugin format

The repository must contain a valid manifest:

```
.claude-plugin/plugin.json    # manifest (required)
skills/                        # SKILL.md files
commands/                      # *.md command templates
agents/                        # *.md agent configs
hooks/hooks.json               # optional hooks
.mcp.json                      # optional MCP servers
CLAUDE.md                      # optional plugin instructions
```

### Minimal `plugin.json`

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "What this plugin does"
}
```

See [docs/local-stack.md](./local-stack.md) for full Claude Code compatibility details.

## Cache location

Plugins are installed in `~/.claude/plugins/cache/<owner>/<repo>/latest/`.

This directory is shared with Claude Code — plugins installed via `aki plugin install`
are auto-discovered when either tool starts.

## How it works

1. `aki plugin install <target>` clones the repo into the cache directory
2. Validates `.claude-plugin/plugin.json` (must have a `name` field)
3. On next aki start, `PluginDiscoveryService` finds the plugin automatically
4. Skills, commands, agents, and MCP servers from the plugin are loaded

If validation fails (missing or invalid manifest), the cloned directory is removed.

## Recommended plugins

| Plugin | Install | What it adds |
|--------|---------|-------------|
| obra/superpowers | `aki plugin install obra/superpowers` | Framework skills + agents (14 skills) |
| TechDufus/oh-my-claude | `aki plugin install TechDufus/oh-my-claude` | Context protection, magic keywords (11 skills) |
| affaan-m/everything-claude-code | `aki plugin install affaan-m/everything-claude-code` | Mega-collection (156 skills, 72 commands, 38 agents) |
| thedotmack/claude-mem | `aki plugin install thedotmack/claude-mem` | Persistent memory via MCP |

## Requirements

- `git` must be installed and in `PATH` (`brew install git` on macOS)
- Network access to the plugin repository
- The repository must have a `.claude-plugin/plugin.json` manifest
