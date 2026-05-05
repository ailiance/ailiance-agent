import type { Client } from "@modelcontextprotocol/sdk/client"
import type { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

export interface McpServerConfig {
	id: string
	pluginName: string
	pluginRoot: string
	type: "stdio"
	command: string
	args: string[]
}

export interface ConnectedClient {
	config: McpServerConfig
	client: Client
	transport: StdioClientTransport
	startedAt: Date
}

export interface McpToolMetadata {
	qualifiedName: string
	serverId: string
	pluginName: string
	rawName: string
	description?: string
	inputSchema: object
}

export interface McpToolResult {
	qualifiedName: string
	isError: boolean
	content: unknown // raw from SDK; usually Array<{ type: "text"; text: string } | ...>
}

export function makeQualifiedToolName(plugin: string, server: string, tool: string): string {
	const sanitize = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_")
	return `mcp__${sanitize(plugin)}_${sanitize(server)}__${sanitize(tool)}`
}
