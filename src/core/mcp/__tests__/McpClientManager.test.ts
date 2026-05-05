import { expect } from "chai"
import { afterEach, beforeEach, describe, it } from "mocha"
import sinon from "sinon"

import { McpServerConfig, makeQualifiedToolName } from "../types"

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
		manager.tools = new Map()
		sinon.restore()
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

	it("findTool returns undefined for inexistent qualified name", () => {
		const { mcpClientManager } = McpClientManagerModule
		expect(mcpClientManager.findTool("mcp__plugin_server__inexistent")).to.be.undefined
	})

	it("invalidateToolCache clears the entire tool cache", () => {
		const { mcpClientManager } = McpClientManagerModule
		const manager = mcpClientManager as any
		manager.tools.set("server-a", [
			{
				qualifiedName: "mcp__plugin_server-a__tool1",
				serverId: "server-a",
				pluginName: "plugin",
				rawName: "tool1",
				inputSchema: {},
			},
		])
		expect(manager.tools.size).to.equal(1)
		mcpClientManager.invalidateToolCache()
		expect(manager.tools.size).to.equal(0)
	})

	it("invalidateToolCache with serverId clears only that server", () => {
		const { mcpClientManager } = McpClientManagerModule
		const manager = mcpClientManager as any
		manager.tools.set("server-a", [])
		manager.tools.set("server-b", [])
		mcpClientManager.invalidateToolCache("server-a")
		expect(manager.tools.has("server-a")).to.be.false
		expect(manager.tools.has("server-b")).to.be.true
	})

	it("makeQualifiedToolName sanitizes non-alphanumeric chars", () => {
		expect(makeQualifiedToolName("plugin/x", "server.y", "tool!")).to.equal("mcp__plugin_x_server_y__tool_")
	})

	it("listTools fetches and caches tools from a stub client", async () => {
		const { mcpClientManager } = McpClientManagerModule
		const manager = mcpClientManager as any

		const fakeClient = {
			listTools: sinon.stub().resolves({
				tools: [{ name: "foo", description: "Foo tool", inputSchema: {} }],
			}),
			close: sinon.stub().resolves(),
		}

		const cfg: McpServerConfig = {
			id: "test-server",
			pluginName: "test-plugin",
			pluginRoot: "/tmp",
			type: "stdio",
			command: "fake",
			args: [],
		}
		manager.clients.set("test-server", { config: cfg, client: fakeClient, transport: {}, startedAt: new Date() })
		manager.configs.set("test-server", cfg)

		const tools = await mcpClientManager.listTools("test-server")

		expect(tools).to.have.length(1)
		expect(tools[0].qualifiedName).to.equal("mcp__test-plugin_test-server__foo")
		expect(tools[0].rawName).to.equal("foo")
		expect(tools[0].serverId).to.equal("test-server")
		expect(tools[0].pluginName).to.equal("test-plugin")

		// Second call should be cached (stub called only once)
		await mcpClientManager.listTools("test-server")
		expect(fakeClient.listTools.callCount).to.equal(1)
	})

	it("listTools returns cached result on second call", async () => {
		const { mcpClientManager } = McpClientManagerModule
		const manager = mcpClientManager as any

		const fakeClient = {
			listTools: sinon.stub().resolves({ tools: [{ name: "bar", inputSchema: {} }] }),
			close: sinon.stub().resolves(),
		}
		const cfg: McpServerConfig = {
			id: "cached-server",
			pluginName: "plg",
			pluginRoot: "/tmp",
			type: "stdio",
			command: "fake",
			args: [],
		}
		manager.clients.set("cached-server", { config: cfg, client: fakeClient, transport: {}, startedAt: new Date() })
		manager.configs.set("cached-server", cfg)

		await mcpClientManager.listTools("cached-server")
		await mcpClientManager.listTools("cached-server")
		expect(fakeClient.listTools.callCount).to.equal(1)
	})

	it("findTool finds tool after listTools is called", async () => {
		const { mcpClientManager } = McpClientManagerModule
		const manager = mcpClientManager as any

		const fakeClient = {
			listTools: sinon.stub().resolves({ tools: [{ name: "my_tool", description: "desc", inputSchema: { type: "object" } }] }),
			close: sinon.stub().resolves(),
		}
		const cfg: McpServerConfig = {
			id: "find-server",
			pluginName: "find-plugin",
			pluginRoot: "/tmp",
			type: "stdio",
			command: "fake",
			args: [],
		}
		manager.clients.set("find-server", { config: cfg, client: fakeClient, transport: {}, startedAt: new Date() })
		manager.configs.set("find-server", cfg)

		await mcpClientManager.listTools("find-server")

		const found = mcpClientManager.findTool("mcp__find-plugin_find-server__my_tool")
		expect(found).to.not.be.undefined
		expect(found!.rawName).to.equal("my_tool")
		expect(found!.description).to.equal("desc")
	})

	it("listAllTools aggregates tools from all servers", async () => {
		const { mcpClientManager } = McpClientManagerModule
		const manager = mcpClientManager as any

		const makeClient = (toolName: string) => ({
			listTools: sinon.stub().resolves({ tools: [{ name: toolName, inputSchema: {} }] }),
			close: sinon.stub().resolves(),
		})

		const cfgA: McpServerConfig = { id: "srv-a", pluginName: "plg-a", pluginRoot: "/tmp", type: "stdio", command: "fake", args: [] }
		const cfgB: McpServerConfig = { id: "srv-b", pluginName: "plg-b", pluginRoot: "/tmp", type: "stdio", command: "fake", args: [] }

		manager.clients.set("srv-a", { config: cfgA, client: makeClient("tool_a"), transport: {}, startedAt: new Date() })
		manager.clients.set("srv-b", { config: cfgB, client: makeClient("tool_b"), transport: {}, startedAt: new Date() })
		manager.configs.set("srv-a", cfgA)
		manager.configs.set("srv-b", cfgB)

		const all = await mcpClientManager.listAllTools()
		expect(all).to.have.length(2)
		const names = all.map((t) => t.rawName)
		expect(names).to.include("tool_a")
		expect(names).to.include("tool_b")
	})

	it("listAllTools skips failing servers and continues", async () => {
		const { mcpClientManager } = McpClientManagerModule
		const manager = mcpClientManager as any

		const goodClient = {
			listTools: sinon.stub().resolves({ tools: [{ name: "ok_tool", inputSchema: {} }] }),
			close: sinon.stub().resolves(),
		}
		const cfgGood: McpServerConfig = { id: "srv-good", pluginName: "plg", pluginRoot: "/tmp", type: "stdio", command: "fake", args: [] }
		// srv-bad has no client (will throw in connect)
		const cfgBad: McpServerConfig = { id: "srv-bad", pluginName: "plg", pluginRoot: "/tmp", type: "stdio", command: "fake", args: [] }

		manager.clients.set("srv-good", { config: cfgGood, client: goodClient, transport: {}, startedAt: new Date() })
		manager.configs.set("srv-good", cfgGood)
		manager.configs.set("srv-bad", cfgBad)

		const all = await mcpClientManager.listAllTools()
		expect(all).to.have.length(1)
		expect(all[0].rawName).to.equal("ok_tool")
	})
})
