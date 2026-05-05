import { type Dirent, promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

export interface PluginManifest {
	name: string
	version?: string
	description?: string
	author?: { name: string; email?: string; url?: string }
	homepage?: string
	repository?: string
	license?: string
	keywords?: string[]
	agents?: string[]
	skills?: string[]
	commands?: string[]
}

export interface DiscoveredPlugin {
	manifest: PluginManifest
	rootDir: string // absolute path to <owner>/<name>/<version>/
	marketplaceOwner: string // <owner>
	pluginId: string // <name>
}

export class PluginDiscoveryService {
	private cache: DiscoveredPlugin[] | null = null

	async discover(): Promise<DiscoveredPlugin[]> {
		if (this.cache) return this.cache
		const baseDir = path.join(os.homedir(), ".claude", "plugins", "cache")
		const found: DiscoveredPlugin[] = []
		try {
			const owners: Dirent[] = await fs.readdir(baseDir, { withFileTypes: true })
			for (const owner of owners) {
				if (!owner.isDirectory()) continue
				const ownerDir = path.join(baseDir, owner.name)
				let plugins: Dirent[]
				try {
					plugins = await fs.readdir(ownerDir, { withFileTypes: true })
				} catch {
					continue
				}
				for (const plugin of plugins) {
					if (!plugin.isDirectory()) continue
					const pluginDir = path.join(ownerDir, plugin.name)
					let versions: Dirent[]
					try {
						versions = await fs.readdir(pluginDir, { withFileTypes: true })
					} catch {
						continue
					}
					for (const version of versions) {
						if (!version.isDirectory()) continue
						const versionDir = path.join(pluginDir, version.name)
						const manifestPath = path.join(versionDir, ".claude-plugin", "plugin.json")
						try {
							const raw = await fs.readFile(manifestPath, "utf8")
							const manifest = JSON.parse(raw) as PluginManifest
							if (!manifest.name) continue // skip invalid
							found.push({
								manifest,
								rootDir: versionDir,
								marketplaceOwner: owner.name,
								pluginId: plugin.name,
							})
						} catch {
							// missing manifest = skip silently
						}
					}
				}
			}
		} catch {
			// baseDir doesn't exist = no plugins, OK
		}
		this.cache = found
		return found
	}

	invalidate() {
		this.cache = null
	}
}

export const pluginDiscoveryService = new PluginDiscoveryService()
