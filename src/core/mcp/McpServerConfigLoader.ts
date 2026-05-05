import { promises as fs } from "node:fs"
import path from "node:path"

import { Logger } from "@/shared/services/Logger"

import { pluginDiscoveryService } from "../plugins/PluginDiscoveryService"
import type { McpServerConfig } from "./types"

interface RawMcpJson {
	mcpServers?: Record<
		string,
		{
			type?: string
			command?: string
			args?: string[]
		}
	>
}

function expandPluginRoot(value: string, pluginRoot: string): string {
	return value.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, pluginRoot)
}

export async function loadMcpConfigsFromPlugins(): Promise<McpServerConfig[]> {
	const plugins = await pluginDiscoveryService.discover()
	const configs: McpServerConfig[] = []

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
			if (server.type !== "stdio" && server.type !== undefined) continue
			if (!server.command) {
				Logger.warn(`[mcp] Server "${serverId}" in plugin ${plugin.manifest.name} has no command, skipping`)
				continue
			}

			const pluginRoot = plugin.rootDir
			configs.push({
				id: serverId,
				pluginName: plugin.manifest.name,
				pluginRoot,
				type: "stdio",
				command: expandPluginRoot(server.command, pluginRoot),
				args: (server.args ?? []).map((a) => expandPluginRoot(a, pluginRoot)),
			})
		}
	}

	return configs
}
