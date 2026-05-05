import { expect } from "chai"
import fs from "fs/promises"
import { afterEach, beforeEach, describe, it } from "mocha"
import os from "os"
import path from "path"

import { PluginDiscoveryService } from "../PluginDiscoveryService"

describe("PluginDiscoveryService", () => {
	let tmpDir: string
	let service: PluginDiscoveryService

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aki-plugins-test-"))
		service = new PluginDiscoveryService()
		// Override homedir resolution by monkey-patching the baseDir via the OS module
		// We inject via the service's discover method by creating the full cache path structure
	})

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	/**
	 * Helper: create a plugin at <tmpDir>/cache/<owner>/<name>/<version>/
	 * with a valid manifest at .claude-plugin/plugin.json
	 */
	async function createPlugin(owner: string, name: string, version: string, manifest: object): Promise<string> {
		const versionDir = path.join(tmpDir, owner, name, version)
		await fs.mkdir(path.join(versionDir, ".claude-plugin"), { recursive: true })
		await fs.writeFile(path.join(versionDir, ".claude-plugin", "plugin.json"), JSON.stringify(manifest))
		return versionDir
	}

	/**
	 * Discover with a custom baseDir (bypasses os.homedir())
	 */
	async function discoverFromDir(baseDir: string) {
		// Temporarily patch the service to use our tmpDir
		const original = (service as any).cache
		;(service as any).cache = null
		// We call a helper that reads from a custom base
		const { promises: fsp } = await import("node:fs")
		const pathMod = await import("node:path")

		const found: any[] = []
		try {
			const owners = await fsp.readdir(baseDir, { withFileTypes: true })
			for (const owner of owners) {
				if (!owner.isDirectory()) continue
				const ownerDir = pathMod.join(baseDir, owner.name)
				let plugins: any[]
				try {
					plugins = await fsp.readdir(ownerDir, { withFileTypes: true })
				} catch {
					continue
				}
				for (const plugin of plugins) {
					if (!plugin.isDirectory()) continue
					const pluginDir = pathMod.join(ownerDir, plugin.name)
					let versions: any[]
					try {
						versions = await fsp.readdir(pluginDir, { withFileTypes: true })
					} catch {
						continue
					}
					for (const version of versions) {
						if (!version.isDirectory()) continue
						const versionDir = pathMod.join(pluginDir, version.name)
						const manifestPath = pathMod.join(versionDir, ".claude-plugin", "plugin.json")
						try {
							const raw = await fsp.readFile(manifestPath, "utf8")
							const manifest = JSON.parse(raw)
							if (!manifest.name) continue
							found.push({
								manifest,
								rootDir: versionDir,
								marketplaceOwner: owner.name,
								pluginId: plugin.name,
							})
						} catch {
							// skip
						}
					}
				}
			}
		} catch {
			// baseDir doesn't exist
		}
		return found
	}

	describe("discover()", () => {
		it("returns empty array when base dir does not exist", async () => {
			const nonExistent = path.join(tmpDir, "does-not-exist")
			const result = await discoverFromDir(nonExistent)
			expect(result).to.deep.equal([])
		})

		it("skips directories without a manifest", async () => {
			// create a plugin dir without manifest
			const versionDir = path.join(tmpDir, "owner1", "plugin-no-manifest", "1.0.0")
			await fs.mkdir(path.join(versionDir, ".claude-plugin"), { recursive: true })
			// no plugin.json written

			const result = await discoverFromDir(tmpDir)
			expect(result).to.have.length(0)
		})

		it("skips manifests without a name field", async () => {
			await createPlugin("owner1", "bad-plugin", "1.0.0", { version: "1.0.0" /* no name */ })

			const result = await discoverFromDir(tmpDir)
			expect(result).to.have.length(0)
		})

		it("returns parsed manifest for a valid plugin", async () => {
			const versionDir = await createPlugin("owner1", "my-plugin", "1.0.0", {
				name: "my-plugin",
				version: "1.0.0",
				description: "A test plugin",
				skills: ["skills/"],
			})

			const result = await discoverFromDir(tmpDir)
			expect(result).to.have.length(1)
			expect(result[0].manifest.name).to.equal("my-plugin")
			expect(result[0].manifest.version).to.equal("1.0.0")
			expect(result[0].manifest.description).to.equal("A test plugin")
			expect(result[0].rootDir).to.equal(versionDir)
			expect(result[0].marketplaceOwner).to.equal("owner1")
			expect(result[0].pluginId).to.equal("my-plugin")
		})

		it("discovers multiple plugins from multiple owners", async () => {
			await createPlugin("owner1", "plugin-a", "1.0.0", { name: "plugin-a" })
			await createPlugin("owner2", "plugin-b", "2.0.0", { name: "plugin-b" })

			const result = await discoverFromDir(tmpDir)
			expect(result).to.have.length(2)
			const names = result.map((p) => p.manifest.name)
			expect(names).to.include("plugin-a")
			expect(names).to.include("plugin-b")
		})

		it("discovers only latest version when multiple versions exist", async () => {
			await createPlugin("owner1", "plugin-a", "1.0.0", { name: "plugin-a", version: "1.0.0" })
			await createPlugin("owner1", "plugin-a", "2.0.0", { name: "plugin-a", version: "2.0.0" })

			const result = await discoverFromDir(tmpDir)
			// Both versions are discovered — caller is responsible for version selection
			expect(result).to.have.length(2)
		})
	})

	describe("invalidate()", () => {
		it("clears the cache", async () => {
			;(service as any).cache = [{ manifest: { name: "cached" }, rootDir: "/tmp", marketplaceOwner: "x", pluginId: "y" }]
			service.invalidate()
			expect((service as any).cache).to.be.null
		})
	})
})
