import { expect } from "chai"
import { afterEach, beforeEach, describe, it } from "mocha"

import { McpServerConfig } from "../types"

// We test McpClientManager in isolation by monkey-patching loadMcpConfigsFromPlugins.
// No real subprocess is spawned in these unit tests.

describe("McpClientManager", () => {
	let McpClientManagerModule: typeof import("../McpClientManager")
	let mcpLoaderModule: typeof import("../McpServerConfigLoader")

	// Fresh import each time to reset singleton state
	beforeEach(async () => {
		// Use dynamic import so we can re-require cleanly; mocha's require cache handles this.
		McpClientManagerModule = await import("../McpClientManager")
		mcpLoaderModule = await import("../McpServerConfigLoader")
	})

	afterEach(() => {
		// Reset singleton internal state between tests
		const manager = McpClientManagerModule.mcpClientManager as any
		manager.clients = new Map()
		manager.configs = new Map()
	})

	it("isConnected returns false for unknown serverId", () => {
		const { mcpClientManager } = McpClientManagerModule
		expect(mcpClientManager.isConnected("nonexistent")).to.be.false
	})

	it("disconnect on unknown serverId does not throw", async () => {
		const { mcpClientManager } = McpClientManagerModule
		let threw = false
		try {
			await mcpClientManager.disconnect("unknown-server")
		} catch {
			threw = true
		}
		expect(threw).to.be.false
	})

	it("disconnectAll on empty clients does not throw", async () => {
		const { mcpClientManager } = McpClientManagerModule
		let threw = false
		try {
			await mcpClientManager.disconnectAll()
		} catch {
			threw = true
		}
		expect(threw).to.be.false
	})

	it("getKnownServerIds returns empty when no configs loaded", () => {
		const { mcpClientManager } = McpClientManagerModule
		expect(mcpClientManager.getKnownServerIds()).to.deep.equal([])
	})

	it("loadFromPlugins returns empty array when no plugin has .mcp.json", async () => {
		const { mcpClientManager } = McpClientManagerModule

		// Patch loadMcpConfigsFromPlugins to return empty
		const original = (mcpLoaderModule as any).loadMcpConfigsFromPlugins
		;(mcpLoaderModule as any).loadMcpConfigsFromPlugins = async () => []

		// McpClientManager imports the function at module load time, so patch via manager internals
		const manager = mcpClientManager as any
		const originalLoad = manager.loadFromPlugins.bind(manager)
		manager.loadFromPlugins = async function () {
			const configs: McpServerConfig[] = []
			for (const cfg of configs) {
				this.configs.set(cfg.id, cfg)
			}
			return configs
		}

		const result = await mcpClientManager.loadFromPlugins()
		expect(result).to.deep.equal([])
		expect(mcpClientManager.getKnownServerIds()).to.deep.equal([])

		// Restore
		;(mcpLoaderModule as any).loadMcpConfigsFromPlugins = original
		manager.loadFromPlugins = originalLoad
	})

	it("connect throws for unconfigured serverId", async () => {
		const { mcpClientManager } = McpClientManagerModule
		try {
			await mcpClientManager.connect("no-such-server")
			expect.fail("should have thrown")
		} catch (err: any) {
			expect(err.message).to.include("no-such-server")
		}
	})
})
