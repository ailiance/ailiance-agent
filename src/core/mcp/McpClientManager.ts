import { Client } from "@modelcontextprotocol/sdk/client"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

import { Logger } from "../../shared/services/Logger"
import { loadMcpConfigsFromPlugins } from "./McpServerConfigLoader"
import type { ConnectedClient, McpServerConfig, McpToolMetadata, McpToolResult } from "./types"
import { makeQualifiedToolName } from "./types"

class McpClientManager {
	private clients = new Map<string, ConnectedClient>()
	private configs = new Map<string, McpServerConfig>()
	private tools = new Map<string, McpToolMetadata[]>()

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

	async listTools(serverId: string): Promise<McpToolMetadata[]> {
		const cached = this.tools.get(serverId)
		if (cached) return cached

		const client = await this.connect(serverId)
		const config = this.configs.get(serverId)!
		const result = await client.listTools()
		const metadata: McpToolMetadata[] = result.tools.map((t) => ({
			qualifiedName: makeQualifiedToolName(config.pluginName, serverId, t.name),
			serverId,
			pluginName: config.pluginName,
			rawName: t.name,
			description: t.description,
			inputSchema: t.inputSchema as object,
		}))
		this.tools.set(serverId, metadata)
		return metadata
	}

	async listAllTools(): Promise<McpToolMetadata[]> {
		const all: McpToolMetadata[] = []
		for (const serverId of this.configs.keys()) {
			try {
				const tools = await this.listTools(serverId)
				all.push(...tools)
			} catch (err) {
				Logger.warn(`Failed to list tools for MCP server "${serverId}":`, err)
			}
		}
		return all
	}

	findTool(qualifiedName: string): McpToolMetadata | undefined {
		for (const tools of this.tools.values()) {
			const found = tools.find((t) => t.qualifiedName === qualifiedName)
			if (found) return found
		}
		return undefined
	}

	invalidateToolCache(serverId?: string): void {
		if (serverId) this.tools.delete(serverId)
		else this.tools.clear()
	}

	/**
	 * Execute an MCP tool via its qualified name.
	 * Lazy-spawns the underlying server if not connected yet.
	 * Returns the raw MCP result (text + isError).
	 */
	async callTool(qualifiedName: string, args: Record<string, unknown>): Promise<McpToolResult> {
		let meta = this.findTool(qualifiedName)
		if (!meta) {
			// Lazy: populate cache via listAllTools, then retry
			await this.listAllTools()
			meta = this.findTool(qualifiedName)
			if (!meta) {
				throw new Error(`Unknown MCP tool: ${qualifiedName}`)
			}
		}

		const client = await this.connect(meta.serverId)
		const result = await client.callTool({
			name: meta.rawName,
			arguments: args,
		})

		return {
			qualifiedName,
			isError: result.isError === true,
			content: result.content,
		}
	}
}

export const mcpClientManager = new McpClientManager()
