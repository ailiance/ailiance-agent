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
