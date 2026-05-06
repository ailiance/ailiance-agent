import { execFile } from "node:child_process"
import { type Dirent, promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

type ExecFileP = (cmd: string, args: string[], opts?: { timeout?: number }) => Promise<{ stdout: string; stderr: string }>

const defaultExecFileP: ExecFileP = promisify(execFile) as ExecFileP

export interface PluginInstallResult {
	ok: boolean
	msg: string
	plugin?: { name: string; version?: string; rootDir: string }
}

export interface InstalledPlugin {
	name: string
	version?: string
	rootDir: string
	owner: string
}

export class PluginInstaller {
	private static readonly PLUGINS_DIR = path.join(os.homedir(), ".claude", "plugins", "cache")

	/** Injectable for testing */
	_execFile: ExecFileP = defaultExecFileP

	/**
	 * Resolves a user input into a git URL.
	 * Supports: full URL, github short (user/repo), with optional @branch or #commit.
	 */
	static parseUrl(input: string): { url: string; ref?: string; owner: string; repo: string } {
		let ref: string | undefined
		let core = input

		// Extract ref (@branch or #commit) — but not the @ in git@ SSH URLs
		// Only match @ or # that come after the repo path, not in protocol prefix
		const refMatch = input.match(/^(.+?)(?:[#](.+)|(?<!git)@([^@]+))$/)
		if (refMatch) {
			core = refMatch[1]
			ref = refMatch[2] ?? refMatch[3]
		}

		// Short github form: user/repo (no protocol, no dots except in names)
		if (/^[\w.-]+\/[\w.-]+$/.test(core)) {
			const [owner, repo] = core.split("/")
			return { url: `https://github.com/${owner}/${repo}.git`, ref, owner, repo }
		}

		// SSH: git@github.com:foo/bar.git
		let urlStr = core
		if (core.startsWith("git@")) {
			urlStr = `ssh://${core.replace(":", "/")}`
		}

		let url: URL
		try {
			url = new URL(urlStr)
		} catch {
			throw new Error(`Cannot parse plugin URL: ${input}`)
		}

		const segments = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean)
		if (segments.length < 2) {
			throw new Error(`Cannot parse plugin URL: ${input}`)
		}

		const [owner, repo] = segments.slice(-2)
		const gitUrl = core.endsWith(".git") ? core : `${core}.git`
		return { url: gitUrl, ref, owner, repo }
	}

	async install(input: string): Promise<PluginInstallResult> {
		let parsed: ReturnType<typeof PluginInstaller.parseUrl>
		try {
			parsed = PluginInstaller.parseUrl(input)
		} catch (e) {
			return { ok: false, msg: (e as Error).message }
		}

		const targetDir = path.join(PluginInstaller.PLUGINS_DIR, parsed.owner, parsed.repo, "latest")

		if (await this.exists(targetDir)) {
			return { ok: false, msg: `Already installed: ${parsed.owner}/${parsed.repo}` }
		}

		await fs.mkdir(path.dirname(targetDir), { recursive: true })

		const cloneArgs = ["clone", "--depth", "1"]
		if (parsed.ref) {
			cloneArgs.push("--branch", parsed.ref)
		}
		cloneArgs.push(parsed.url, targetDir)

		try {
			await this._execFile("git", cloneArgs, { timeout: 120_000 })
		} catch (e) {
			// Cleanup partial clone
			await fs.rm(targetDir, { recursive: true, force: true })
			const msg = (e as Error).message
			if (msg.includes("ENOENT") && msg.includes("git")) {
				return { ok: false, msg: "git required — install with: brew install git" }
			}
			return { ok: false, msg: `git clone failed: ${msg}` }
		}

		const manifestPath = path.join(targetDir, ".claude-plugin", "plugin.json")
		let manifest: { name?: string; version?: string }
		try {
			const raw = await fs.readFile(manifestPath, "utf8")
			manifest = JSON.parse(raw)
		} catch {
			await fs.rm(targetDir, { recursive: true, force: true })
			return { ok: false, msg: "No valid .claude-plugin/plugin.json found in repo" }
		}

		if (!manifest.name || typeof manifest.name !== "string") {
			await fs.rm(targetDir, { recursive: true, force: true })
			return { ok: false, msg: "Invalid plugin.json: missing name field" }
		}

		return {
			ok: true,
			msg: `Installed ${manifest.name}@${manifest.version ?? "unknown"}`,
			plugin: { name: manifest.name, version: manifest.version, rootDir: targetDir },
		}
	}

	async remove(name: string): Promise<{ ok: boolean; msg: string }> {
		const plugins = await this.list()
		const match = plugins.find((p) => p.name === name || p.rootDir.endsWith(`/${name}/latest`))
		if (!match) {
			return { ok: false, msg: `Plugin not found: ${name}` }
		}
		// Remove the version dir (e.g. .../owner/repo/latest)
		await fs.rm(match.rootDir, { recursive: true, force: true })

		// Cleanup empty parent dirs (repo dir and owner dir if empty)
		const repoDir = path.dirname(match.rootDir)
		const ownerDir = path.dirname(repoDir)
		try {
			const repoDirents = await fs.readdir(repoDir)
			if (repoDirents.length === 0) {
				await fs.rm(repoDir, { recursive: true, force: true })
				const ownerDirents = await fs.readdir(ownerDir)
				if (ownerDirents.length === 0) {
					await fs.rm(ownerDir, { recursive: true, force: true })
				}
			}
		} catch {
			// best-effort cleanup
		}

		return { ok: true, msg: `Removed ${match.owner}/${name}` }
	}

	async list(): Promise<InstalledPlugin[]> {
		const baseDir = PluginInstaller.PLUGINS_DIR
		const result: InstalledPlugin[] = []

		let owners: Dirent[]
		try {
			owners = await fs.readdir(baseDir, { withFileTypes: true })
		} catch {
			return []
		}

		for (const owner of owners) {
			if (!owner.isDirectory()) continue
			const ownerDir = path.join(baseDir, owner.name)
			let repos: Dirent[]
			try {
				repos = await fs.readdir(ownerDir, { withFileTypes: true })
			} catch {
				continue
			}
			for (const repo of repos) {
				if (!repo.isDirectory()) continue
				const repoDir = path.join(ownerDir, repo.name)
				let versions: Dirent[]
				try {
					versions = await fs.readdir(repoDir, { withFileTypes: true })
				} catch {
					continue
				}
				for (const version of versions) {
					if (!version.isDirectory()) continue
					const versionDir = path.join(repoDir, version.name)
					const manifestPath = path.join(versionDir, ".claude-plugin", "plugin.json")
					try {
						const raw = await fs.readFile(manifestPath, "utf8")
						const manifest = JSON.parse(raw) as { name?: string; version?: string }
						if (!manifest.name) continue
						result.push({
							name: manifest.name,
							version: manifest.version,
							rootDir: versionDir,
							owner: owner.name,
						})
					} catch {
						// skip invalid
					}
				}
			}
		}

		return result
	}

	async update(name?: string): Promise<{ ok: boolean; msg: string; updated: string[] }> {
		const plugins = await this.list()
		const targets = name ? plugins.filter((p) => p.name === name) : plugins

		if (name && targets.length === 0) {
			return { ok: false, msg: `Plugin not found: ${name}`, updated: [] }
		}

		const updated: string[] = []
		const errors: string[] = []

		for (const plugin of targets) {
			try {
				await this._execFile("git", ["-C", plugin.rootDir, "pull", "--ff-only"], { timeout: 60_000 })
				updated.push(plugin.name)
			} catch (e) {
				errors.push(`${plugin.name}: ${(e as Error).message}`)
			}
		}

		if (errors.length > 0 && updated.length === 0) {
			return { ok: false, msg: `Update failed: ${errors.join("; ")}`, updated }
		}

		const msg =
			errors.length > 0
				? `Updated ${updated.length} plugin(s), ${errors.length} failed: ${errors.join("; ")}`
				: `Updated ${updated.length} plugin(s)`

		return { ok: true, msg, updated }
	}

	private async exists(dir: string): Promise<boolean> {
		try {
			await fs.access(dir)
			return true
		} catch {
			return false
		}
	}
}

export const pluginInstaller = new PluginInstaller()
