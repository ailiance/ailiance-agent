import { promises as fs } from "node:fs"
import path from "node:path"

import { Logger } from "@/shared/services/Logger"

import { pluginDiscoveryService } from "../plugins/PluginDiscoveryService"
import type { McpServerConfig } from "./types"
import { assertMcpUrlAllowed, shouldSendBearer } from "./urlSecurity"

interface RawMcpJson {
	mcpServers?: Record<
		string,
		{
			type?: string
			command?: string
			args?: string[]
			url?: string
			headers?: Record<string, string>
		}
	>
}

function expandPluginRoot(value: string, pluginRoot: string): string {
	return value.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, pluginRoot)
}

// Expand ${ENV_VAR} references from the environment (used in http url + headers so
// a plugin or the user can inject secrets without writing them into .mcp.json).
function expandEnvVars(value: string): string {
	return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, name) => process.env[name] ?? "")
}

// Env var that carries a bearer token for an http MCP server, e.g.
// supabase -> ISAAC_MCP_SUPABASE_TOKEN, mcp-search -> ISAAC_MCP_MCP_SEARCH_TOKEN.
function serverTokenEnv(serverId: string): string {
	return `ISAAC_MCP_${serverId.replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}_TOKEN`
}

// Resolve the headers for an http server: expand ${ENV} in every value, then —
// as a convenience for OAuth-bearer servers like supabase — inject
// `Authorization: Bearer <token>` from ISAAC_MCP_<ID>_TOKEN when set and no
// Authorization header was declared. The token is never persisted (the tool
// cache stores only a config hash + the tool list).
function resolveHttpHeaders(serverId: string, url: string, raw?: Record<string, string>): Record<string, string> | undefined {
	const headers: Record<string, string> = {}
	for (const [k, v] of Object.entries(raw ?? {})) {
		headers[k] = expandEnvVars(v)
	}
	const token = process.env[serverTokenEnv(serverId)]?.trim()
	const hasAuth = Object.keys(headers).some((k) => k.toLowerCase() === "authorization")
	// Token-gate: a bearer credential (injected from env OR declared in .mcp.json)
	// must not leave the machine in cleartext. Fail closed — skip the server
	// rather than silently leak the token to an insecure public endpoint.
	if ((token && !hasAuth) || hasAuth) {
		if (!shouldSendBearer(url)) {
			throw new Error(
				`refusing to send Authorization over insecure channel to ${url} ` +
					`(use https, a private/loopback/Tailscale host, or add the host to ISAAC_MCP_ALLOW_HOSTS)`,
			)
		}
	}
	if (token && !hasAuth) {
		headers.Authorization = `Bearer ${token}`
	}
	return Object.keys(headers).length > 0 ? headers : undefined
}

export async function loadMcpConfigsFromPlugins(): Promise<McpServerConfig[]> {
	const plugins = await pluginDiscoveryService.discover()
	const configs: McpServerConfig[] = []
	// Dedupe by server id across plugins: several plugins ship the same MCP
	// server (e.g. context7 + sequential-thinking from both ecc and
	// oh-my-claude). Loading both spawns duplicate processes and double-counts
	// their tools in the agent prompt. First plugin to declare it wins.
	const seenServers = new Map<string, string>()

	for (const plugin of plugins) {
		const mcpJsonPath = path.join(plugin.rootDir, ".mcp.json")
		let raw: string
		try {
			raw = await fs.readFile(mcpJsonPath, "utf8")
		} catch {
			// plugin has no .mcp.json — skip silently
			continue
		}

		let parsed: RawMcpJson
		try {
			parsed = JSON.parse(raw) as RawMcpJson
		} catch {
			// malformed JSON — warn and skip
			Logger.warn(`[mcp] Malformed .mcp.json in plugin ${plugin.manifest.name} (${mcpJsonPath}), skipping`)
			continue
		}

		const servers = parsed.mcpServers ?? {}
		for (const [serverId, server] of Object.entries(servers)) {
			const kind = server.type ?? "stdio"
			if (kind !== "stdio" && kind !== "http") continue

			// Validate + resolve per transport BEFORE claiming the id, so an invalid
			// or security-rejected entry doesn't shadow a valid same-id server from a
			// later plugin (mirrors the dedupe-by-id contract below).
			const pluginRoot = plugin.rootDir
			let resolved: McpServerConfig | null = null

			if (kind === "stdio") {
				if (!server.command) {
					Logger.warn(`[mcp] Server "${serverId}" in plugin ${plugin.manifest.name} has no command, skipping`)
					continue
				}
				resolved = {
					id: serverId,
					pluginName: plugin.manifest.name,
					pluginRoot,
					type: "stdio",
					command: expandPluginRoot(server.command, pluginRoot),
					args: (server.args ?? []).map((a) => expandPluginRoot(a, pluginRoot)),
				}
			} else {
				if (!server.url) {
					Logger.warn(`[mcp] HTTP server "${serverId}" in plugin ${plugin.manifest.name} has no url, skipping`)
					continue
				}
				const url = expandEnvVars(server.url)
				// SSRF guard: refuse cloud-metadata endpoints (unless allowlisted).
				const verdict = assertMcpUrlAllowed(url)
				if (!verdict.ok) {
					Logger.warn(`[mcp] HTTP server "${serverId}" in plugin ${plugin.manifest.name}: ${verdict.reason}, skipping`)
					continue
				}
				let headers: Record<string, string> | undefined
				try {
					headers = resolveHttpHeaders(serverId, url, server.headers)
				} catch (e) {
					Logger.warn(
						`[mcp] HTTP server "${serverId}" in plugin ${plugin.manifest.name}: ${(e as Error).message}, skipping`,
					)
					continue
				}
				resolved = { id: serverId, pluginName: plugin.manifest.name, pluginRoot, type: "http", url, headers }
			}

			const dupOwner = seenServers.get(serverId)
			if (dupOwner !== undefined) {
				Logger.warn(
					`[mcp] Duplicate server "${serverId}" from plugin ${plugin.manifest.name} ignored (already provided by ${dupOwner})`,
				)
				continue
			}
			seenServers.set(serverId, plugin.manifest.name)
			configs.push(resolved)
		}
	}

	return configs
}
