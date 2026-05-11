/**
 * Plugin Hook Loader — P2-M4
 *
 * Parses Claude Code plugin hooks/hooks.json files and converts them into
 * a structure compatible with ailiance-agent's hook system.
 *
 * Integration note (Sprint P3): to wire plugin hooks at boot, call
 * `loadPluginHooks()` and register the resulting commands via
 * `addExtraHooksDir()` in disk.ts (or equivalent boot sequence).
 * The matcher logic requires extending StdioHookRunner to filter by tool name.
 */

import { promises as fs } from "node:fs"
import path from "node:path"
import { z } from "zod"
import { Logger } from "@/shared/services/Logger"
import { pluginDiscoveryService } from "./PluginDiscoveryService"

// ---------------------------------------------------------------------------
// Claude Code hooks.json schema
// ---------------------------------------------------------------------------

const PluginHookCommandSchema = z.object({
	type: z.literal("command"),
	command: z.string().min(1),
	timeout: z.number().int().positive().optional(),
})

const PluginHookMatcherEntrySchema = z.object({
	matcher: z.string().optional().default(""),
	hooks: z.array(PluginHookCommandSchema),
})

// All Claude Code hook events (superset of ailiance-agent events)
const CLAUDE_CODE_EVENTS = [
	"PreToolUse",
	"PostToolUse",
	"UserPromptSubmit",
	"SessionStart",
	"Stop",
	"Notification",
	"PreCompact",
	"PermissionRequest",
] as const

type ClaudeCodeEvent = (typeof CLAUDE_CODE_EVENTS)[number]

const PluginHooksFileSchema = z.object({
	hooks: z.record(z.string(), z.array(PluginHookMatcherEntrySchema)).optional().default({}),
})

// ---------------------------------------------------------------------------
// ailiance-agent supported events mapping
// ---------------------------------------------------------------------------

/** Events supported by ailiance-agent (keys of Hooks interface in hook-factory.ts) */
const SUPPORTED_AGENT_KIKI_EVENTS = new Set([
	"PreToolUse",
	"PostToolUse",
	"UserPromptSubmit",
	"Notification",
	"PreCompact",
	// TaskStart / TaskResume / TaskCancel / TaskComplete exist in ailiance-agent but
	// are not in Claude Code format — not mapped here.
])

/** Claude Code events not supported by ailiance-agent — emit a warning once */
const UNSUPPORTED_EVENTS = new Set<string>()

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PluginHookCommand {
	/** Absolute path to the command, after ${CLAUDE_PLUGIN_ROOT} expansion */
	command: string
	/** Optional timeout in seconds (defaults to ailiance-agent's 10s) */
	timeoutSeconds?: number
	/** Regex matcher for tool name filtering (empty = match all) */
	matcher: string
	/** ailiance-agent event name (e.g. "PreToolUse") */
	event: string
	/** Plugin name for attribution */
	pluginName: string
}

export interface LoadPluginHooksResult {
	/** All successfully parsed hook commands, keyed by event name */
	byEvent: Map<string, PluginHookCommand[]>
	/** Warnings accumulated during loading */
	warnings: string[]
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Expands `${CLAUDE_PLUGIN_ROOT}` in a command string to the plugin root dir.
 */
function expandPluginRoot(command: string, rootDir: string): string {
	return command.replaceAll("${CLAUDE_PLUGIN_ROOT}", rootDir)
}

/**
 * Loads and parses hooks/hooks.json for a single plugin.
 * Returns null if the file doesn't exist or is malformed (fail-open).
 */
async function loadPluginHooksFile(
	hookJsonPath: string,
	pluginName: string,
	rootDir: string,
): Promise<{ event: string; commands: PluginHookCommand[] }[]> {
	let raw: string
	try {
		raw = await fs.readFile(hookJsonPath, "utf8")
	} catch {
		// hooks/hooks.json not present — OK
		return []
	}

	let parsed: z.infer<typeof PluginHooksFileSchema>
	try {
		const json = JSON.parse(raw)
		parsed = PluginHooksFileSchema.parse(json)
	} catch (err) {
		Logger.warn(`[PluginHookLoader] Malformed hooks.json in plugin '${pluginName}', skipping: ${err}`)
		return []
	}

	const results: { event: string; commands: PluginHookCommand[] }[] = []

	for (const [rawEvent, matchers] of Object.entries(parsed.hooks)) {
		if (!SUPPORTED_AGENT_KIKI_EVENTS.has(rawEvent)) {
			if (!UNSUPPORTED_EVENTS.has(rawEvent)) {
				UNSUPPORTED_EVENTS.add(rawEvent)
				Logger.warn(
					`[PluginHookLoader] Plugin '${pluginName}' declares hook for unsupported event '${rawEvent}' — skipping`,
				)
			}
			continue
		}

		const commands: PluginHookCommand[] = []
		for (const entry of matchers) {
			for (const hookCmd of entry.hooks) {
				commands.push({
					command: expandPluginRoot(hookCmd.command, rootDir),
					timeoutSeconds: hookCmd.timeout,
					matcher: entry.matcher,
					event: rawEvent,
					pluginName,
				})
			}
		}

		if (commands.length > 0) {
			results.push({ event: rawEvent, commands })
		}
	}

	return results
}

/**
 * Loads plugin hooks from all discovered plugins.
 *
 * For each plugin, reads `hooks/hooks.json` (if present), parses it, expands
 * `${CLAUDE_PLUGIN_ROOT}` to the plugin's root directory, and maps the event
 * names to ailiance-agent supported events.
 *
 * Unsupported events (Stop, SessionStart, PermissionRequest) are logged as
 * warnings and skipped. Malformed files are swallowed silently.
 *
 * @returns Map of event name → array of PluginHookCommand
 */
export async function loadPluginHooks(): Promise<LoadPluginHooksResult> {
	const byEvent = new Map<string, PluginHookCommand[]>()
	const warnings: string[] = []

	let plugins
	try {
		plugins = await pluginDiscoveryService.discover()
	} catch (error) {
		const msg = `[PluginHookLoader] Failed to discover plugins: ${error}`
		Logger.warn(msg)
		warnings.push(msg)
		return { byEvent, warnings }
	}

	for (const plugin of plugins) {
		const hookJsonPath = path.join(plugin.rootDir, "hooks", "hooks.json")
		try {
			const entries = await loadPluginHooksFile(hookJsonPath, plugin.manifest.name, plugin.rootDir)
			for (const { event, commands } of entries) {
				const existing = byEvent.get(event) ?? []
				byEvent.set(event, [...existing, ...commands])
			}
		} catch (error) {
			const msg = `[PluginHookLoader] Unexpected error loading hooks for plugin '${plugin.manifest.name}': ${error}`
			Logger.warn(msg)
			warnings.push(msg)
		}
	}

	return { byEvent, warnings }
}
