import { expect } from "chai"
import fs from "fs/promises"
import { afterEach, beforeEach, describe, it } from "mocha"
import os from "os"
import path from "path"
import sinon from "sinon"

import * as pluginModule from "@/core/plugins/PluginDiscoveryService"
import { loadPluginHooks } from "@/core/plugins/PluginHookLoader"

describe("PluginHookLoader", () => {
	let tmpDir: string
	let sandbox: sinon.SinonSandbox

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aki-plugin-hooks-"))
		sandbox = sinon.createSandbox()
	})

	afterEach(async () => {
		sandbox.restore()
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	/**
	 * Helper: create a plugin directory with an optional hooks/hooks.json
	 */
	async function createPlugin(name: string, hooksContent?: object): Promise<{ rootDir: string; manifest: { name: string } }> {
		const rootDir = path.join(tmpDir, name)
		await fs.mkdir(path.join(rootDir, ".claude-plugin"), { recursive: true })
		await fs.writeFile(path.join(rootDir, ".claude-plugin", "plugin.json"), JSON.stringify({ name }))
		if (hooksContent !== undefined) {
			await fs.mkdir(path.join(rootDir, "hooks"), { recursive: true })
			await fs.writeFile(path.join(rootDir, "hooks", "hooks.json"), JSON.stringify(hooksContent))
		}
		return { rootDir, manifest: { name } }
	}

	it("returns empty result when no plugins are discovered", async () => {
		sandbox.stub(pluginModule.pluginDiscoveryService, "discover").resolves([])

		const result = await loadPluginHooks()

		expect(result.byEvent.size).to.equal(0)
		expect(result.warnings).to.be.empty
	})

	it("skips plugins without hooks/hooks.json (fail-open)", async () => {
		const plugin = await createPlugin("no-hooks-plugin")
		sandbox
			.stub(pluginModule.pluginDiscoveryService, "discover")
			.resolves([
				{ manifest: plugin.manifest, rootDir: plugin.rootDir, marketplaceOwner: "owner", pluginId: "no-hooks-plugin" },
			])

		const result = await loadPluginHooks()

		expect(result.byEvent.size).to.equal(0)
	})

	it("loads PreToolUse hooks and expands ${CLAUDE_PLUGIN_ROOT}", async () => {
		const plugin = await createPlugin("my-plugin", {
			hooks: {
				PreToolUse: [
					{
						matcher: "Bash",
						hooks: [
							{
								type: "command",
								command: "${CLAUDE_PLUGIN_ROOT}/scripts/check.py",
								timeout: 30,
							},
						],
					},
				],
			},
		})

		sandbox
			.stub(pluginModule.pluginDiscoveryService, "discover")
			.resolves([{ manifest: plugin.manifest, rootDir: plugin.rootDir, marketplaceOwner: "owner", pluginId: "my-plugin" }])

		const result = await loadPluginHooks()

		expect(result.byEvent.has("PreToolUse")).to.be.true
		const cmds = result.byEvent.get("PreToolUse")!
		expect(cmds).to.have.length(1)
		expect(cmds[0].command).to.equal(path.join(plugin.rootDir, "scripts", "check.py"))
		expect(cmds[0].matcher).to.equal("Bash")
		expect(cmds[0].timeoutSeconds).to.equal(30)
		expect(cmds[0].pluginName).to.equal("my-plugin")
	})

	it("skips unsupported events (Stop, SessionStart, PermissionRequest) with a warning", async () => {
		const plugin = await createPlugin("plugin-with-stop", {
			hooks: {
				Stop: [
					{
						matcher: "",
						hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/stop.sh" }],
					},
				],
				PreToolUse: [
					{
						matcher: "",
						hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/pre.sh" }],
					},
				],
			},
		})

		sandbox
			.stub(pluginModule.pluginDiscoveryService, "discover")
			.resolves([
				{ manifest: plugin.manifest, rootDir: plugin.rootDir, marketplaceOwner: "owner", pluginId: "plugin-with-stop" },
			])

		const result = await loadPluginHooks()

		// Stop should be skipped, PreToolUse should be loaded
		expect(result.byEvent.has("Stop")).to.be.false
		expect(result.byEvent.has("PreToolUse")).to.be.true
	})

	it("swallows malformed hooks.json without crashing", async () => {
		const plugin = await createPlugin("bad-plugin")
		// Write invalid JSON
		await fs.mkdir(path.join(plugin.rootDir, "hooks"), { recursive: true })
		await fs.writeFile(path.join(plugin.rootDir, "hooks", "hooks.json"), "{ this is not json }")

		sandbox
			.stub(pluginModule.pluginDiscoveryService, "discover")
			.resolves([{ manifest: plugin.manifest, rootDir: plugin.rootDir, marketplaceOwner: "owner", pluginId: "bad-plugin" }])

		const result = await loadPluginHooks()

		expect(result.byEvent.size).to.equal(0)
	})

	it("merges hooks from multiple plugins", async () => {
		const pluginA = await createPlugin("plugin-a", {
			hooks: {
				PostToolUse: [
					{
						matcher: "Read",
						hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/post.sh" }],
					},
				],
			},
		})
		const pluginB = await createPlugin("plugin-b", {
			hooks: {
				PostToolUse: [
					{
						matcher: "Write",
						hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/audit.sh" }],
					},
				],
			},
		})

		sandbox.stub(pluginModule.pluginDiscoveryService, "discover").resolves([
			{ manifest: pluginA.manifest, rootDir: pluginA.rootDir, marketplaceOwner: "owner", pluginId: "plugin-a" },
			{ manifest: pluginB.manifest, rootDir: pluginB.rootDir, marketplaceOwner: "owner", pluginId: "plugin-b" },
		])

		const result = await loadPluginHooks()

		const postCmds = result.byEvent.get("PostToolUse")!
		expect(postCmds).to.have.length(2)
		const pluginNames = postCmds.map((c) => c.pluginName)
		expect(pluginNames).to.include("plugin-a")
		expect(pluginNames).to.include("plugin-b")
	})
})
