import { Client } from "@modelcontextprotocol/sdk/client"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

import { loadMcpConfigsFromPlugins } from "./McpServerConfigLoader"
import type { ConnectedClient, McpServerConfig } from "./types"

class McpClientManager {
	private clients = new Map<string, ConnectedClient>()
	private configs = new Map<string, McpServerConfig>()

	async loadFromPlugins(): Promise<McpServerConfig[]> {
		const configs = await loadMcpConfigsFromPlugins()
		for (const cfg of configs) {
			this.configs.set(cfg.id, cfg)
		}
		return configs
	}

	async connect(serverId: string): Promise<Client> {
		const existing = this.clients.get(serverId)
		if (existing) return existing.client

		const cfg = this.configs.get(serverId)
		if (!cfg) throw new Error(`MCP server "${serverId}" not configured`)

		const transport = new StdioClientTransport({
			command: cfg.command,
			args: cfg.args,
			env: { ...process.env, CLAUDE_PLUGIN_ROOT: cfg.pluginRoot },
		})

		const client = new Client({ name: "agent-kiki", version: "0.1.0" }, { capabilities: {} })

		await client.connect(transport)

		this.clients.set(serverId, {
			config: cfg,
			client,
			transport,
			startedAt: new Date(),
		})

		return client
	}

	async disconnect(serverId: string): Promise<void> {
		const c = this.clients.get(serverId)
		if (!c) return
		try {
			await c.client.close()
		} catch {
			// swallow
		}
		this.clients.delete(serverId)
	}

	async disconnectAll(): Promise<void> {
		for (const id of [...this.clients.keys()]) {
			await this.disconnect(id)
		}
	}

	isConnected(serverId: string): boolean {
		return this.clients.has(serverId)
	}

	getKnownServerIds(): string[] {
		return [...this.configs.keys()]
	}
}

export const mcpClientManager = new McpClientManager()
