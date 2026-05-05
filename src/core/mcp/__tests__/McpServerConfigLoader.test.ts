import { expect } from "chai"
import fs from "fs/promises"
import { afterEach, beforeEach, describe, it } from "mocha"
import os from "os"
import path from "path"

import type { DiscoveredPlugin } from "../../plugins/PluginDiscoveryService"

// We test loadMcpConfigsFromPlugins by patching pluginDiscoveryService.discover()
// to return fake plugins pointing at a tmpdir, without touching the real ~/.claude/plugins.

async function createFakePlugin(
	baseDir: string,
	owner: string,
	name: string,
	version: string,
	manifest: object,
): Promise<DiscoveredPlugin> {
	const versionDir = path.join(baseDir, owner, name, version)
	await fs.mkdir(path.join(versionDir, ".claude-plugin"), { recursive: true })
	await fs.writeFile(path.join(versionDir, ".claude-plugin", "plugin.json"), JSON.stringify(manifest))
	return {
		manifest: manifest as any,
		rootDir: versionDir,
		marketplaceOwner: owner,
		pluginId: name,
	}
}

describe("McpServerConfigLoader", () => {
	let tmpDir: string
	let pluginDiscoveryModule: typeof import("../../plugins/PluginDiscoveryService")
	let loaderModule: typeof import("../McpServerConfigLoader")

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aki-mcp-test-"))
		pluginDiscoveryModule = await import("../../plugins/PluginDiscoveryService")
		loaderModule = await import("../McpServerConfigLoader")
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
		// Invalidate cache so next test starts fresh
		pluginDiscoveryModule.pluginDiscoveryService.invalidate()
	})

	it("returns empty array when no plugin has .mcp.json", async () => {
		const fakePlugin = await createFakePlugin(tmpDir, "owner", "plugin-no-mcp", "1.0.0", {
			name: "plugin-no-mcp",
		})

		const original = pluginDiscoveryModule.pluginDiscoveryService.discover.bind(pluginDiscoveryModule.pluginDiscoveryService)
		;(pluginDiscoveryModule.pluginDiscoveryService as any).discover = async () => [fakePlugin]

		const { loadMcpConfigsFromPlugins } = loaderModule
		const result = await loadMcpConfigsFromPlugins()
		expect(result).to.deep.equal([])

		;(pluginDiscoveryModule.pluginDiscoveryService as any).discover = original
	})

	it("parses a valid .mcp.json and returns McpServerConfig", async () => {
		const fakePlugin = await createFakePlugin(tmpDir, "owner", "plugin-with-mcp", "1.0.0", {
			name: "plugin-with-mcp",
		})

		const mcpJson = {
			mcpServers: {
				"my-server": {
					type: "stdio",
					command: "/usr/bin/node",
					args: ["server.js", "--port", "3000"],
				},
			},
		}
		await fs.writeFile(path.join(fakePlugin.rootDir, ".mcp.json"), JSON.stringify(mcpJson))

		;(pluginDiscoveryModule.pluginDiscoveryService as any).discover = async () => [fakePlugin]

		const { loadMcpConfigsFromPlugins } = loaderModule
		const result = await loadMcpConfigsFromPlugins()
		expect(result).to.have.length(1)
		expect(result[0].id).to.equal("my-server")
		expect(result[0].pluginName).to.equal("plugin-with-mcp")
		expect(result[0].type).to.equal("stdio")
		expect(result[0].command).to.equal("/usr/bin/node")
		expect(result[0].args).to.deep.equal(["server.js", "--port", "3000"])

		;(pluginDiscoveryModule.pluginDiscoveryService as any).discover = async () => []
	})

	it("expands ${CLAUDE_PLUGIN_ROOT} in command and args", async () => {
		const fakePlugin = await createFakePlugin(tmpDir, "owner", "plugin-expand", "1.0.0", {
			name: "plugin-expand",
		})

		const mcpJson = {
			mcpServers: {
				"expand-server": {
					type: "stdio",
					command: "${CLAUDE_PLUGIN_ROOT}/bin/server",
					args: ["--root", "${CLAUDE_PLUGIN_ROOT}/data"],
				},
			},
		}
		await fs.writeFile(path.join(fakePlugin.rootDir, ".mcp.json"), JSON.stringify(mcpJson))

		;(pluginDiscoveryModule.pluginDiscoveryService as any).discover = async () => [fakePlugin]

		const { loadMcpConfigsFromPlugins } = loaderModule
		const result = await loadMcpConfigsFromPlugins()
		expect(result).to.have.length(1)
		expect(result[0].command).to.equal(`${fakePlugin.rootDir}/bin/server`)
		expect(result[0].args).to.deep.equal([`--root`, `${fakePlugin.rootDir}/data`])

		;(pluginDiscoveryModule.pluginDiscoveryService as any).discover = async () => []
	})

	it("swallows malformed .mcp.json without throwing", async () => {
		const fakePlugin = await createFakePlugin(tmpDir, "owner", "plugin-bad-json", "1.0.0", {
			name: "plugin-bad-json",
		})

		await fs.writeFile(path.join(fakePlugin.rootDir, ".mcp.json"), "{ invalid json }")

		;(pluginDiscoveryModule.pluginDiscoveryService as any).discover = async () => [fakePlugin]

		const { loadMcpConfigsFromPlugins } = loaderModule
		// Should not throw, returns empty array
		const result = await loadMcpConfigsFromPlugins()
		expect(result).to.deep.equal([])

		;(pluginDiscoveryModule.pluginDiscoveryService as any).discover = async () => []
	})
})
