import { execFile, spawn } from "node:child_process"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export interface RouterStatus {
	running: boolean
	pid?: number
	port?: number
	url?: string
}

const DEFAULT_ROUTES = {
	code: {
		examples: [
			"refactor this function",
			"fix the bug in this code",
			"implement a new feature",
			"explain this algorithm",
			"write unit tests",
		],
		preferred_model: "claude-sonnet-4-5",
	},
	chat: {
		examples: ["hello", "how are you", "tell me a joke", "explain quantum physics"],
		preferred_model: "claude-haiku-4-5",
	},
	search: {
		examples: ["find documentation about", "search for examples of", "look up the API for"],
		preferred_model: "gpt-4o",
	},
	agent: {
		examples: ["use the read_file tool", "execute this command", "browse this URL", "list files in directory"],
		preferred_model: "claude-opus-4-5",
	},
}

export class JinaRouterManager {
	static readonly DEFAULT_PORT = 5000
	static readonly VENV_PATH = path.join(os.homedir(), ".aki", "jina-router-venv")
	static readonly SCRIPT_PATH = path.join(os.homedir(), ".aki", "jina-router", "server.py")
	static readonly ROUTES_PATH = path.join(os.homedir(), ".aki", "jina-router", "routes.json")
	static readonly PID_FILE = path.join(os.homedir(), ".aki", "jina-router.pid")
	static readonly LOG_FILE = path.join(os.homedir(), ".aki", "jina-router.log")

	private async findUv(): Promise<string | null> {
		for (const candidate of ["/opt/homebrew/bin/uv", "/usr/local/bin/uv"]) {
			try {
				await fs.access(candidate)
				return candidate
			} catch {
				// not found at this path
			}
		}
		try {
			const { stdout } = await execFileAsync("which", ["uv"])
			const p = stdout.trim()
			if (p) return p
		} catch {
			// not found
		}
		return null
	}

	private async findPython(): Promise<string | null> {
		for (const candidate of ["/opt/homebrew/bin/python3", "/usr/bin/python3", "/usr/local/bin/python3"]) {
			try {
				await fs.access(candidate)
				return candidate
			} catch {
				// not found at this path
			}
		}
		try {
			const { stdout } = await execFileAsync("which", ["python3"])
			const p = stdout.trim()
			if (p) return p
		} catch {
			// not found
		}
		return null
	}

	private isPidAlive(pid: number): boolean {
		try {
			process.kill(pid, 0)
			return true
		} catch {
			return false
		}
	}

	private async readPid(): Promise<number | null> {
		try {
			const raw = await fs.readFile(JinaRouterManager.PID_FILE, "utf8")
			const pid = Number.parseInt(raw.trim(), 10)
			return Number.isNaN(pid) ? null : pid
		} catch {
			return null
		}
	}

	private async healthCheck(port: number, retries = 60, delayMs = 1000): Promise<boolean> {
		const url = `http://127.0.0.1:${port}/health`
		for (let i = 0; i < retries; i++) {
			try {
				const res = await fetch(url)
				if (res.ok) return true
			} catch {
				// not ready yet
			}
			await new Promise((resolve) => setTimeout(resolve, delayMs))
		}
		return false
	}

	private resolveScriptSource(): string {
		// Walk up from src/services/jina-router/ (or dist equivalent) to repo root.
		// __dirname works in both CommonJS (ts-node tests) and bundled output.
		const here = typeof __dirname !== "undefined" ? __dirname : process.cwd()
		// From src/services/jina-router/ → 3 levels up = repo root
		const repoRoot = path.resolve(here, "..", "..", "..")
		const candidate = path.join(repoRoot, "scripts", "jina-router", "server.py")
		return candidate
	}

	async install(): Promise<{ ok: boolean; msg: string }> {
		const uv = await this.findUv()
		const python = await this.findPython()

		if (!uv && !python) {
			return { ok: false, msg: "Python 3.10+ required (install via brew or pyenv)" }
		}

		// Ensure directories exist
		await fs.mkdir(path.dirname(JinaRouterManager.LOG_FILE), { recursive: true })
		await fs.mkdir(path.dirname(JinaRouterManager.SCRIPT_PATH), { recursive: true })

		// Create venv if needed
		const venvBin = path.join(JinaRouterManager.VENV_PATH, "bin")
		const venvPython = path.join(venvBin, "python")
		let venvExists = false
		try {
			await fs.access(venvPython)
			venvExists = true
		} catch {
			// needs creation
		}

		if (!venvExists) {
			try {
				if (uv) {
					await execFileAsync(uv, ["venv", JinaRouterManager.VENV_PATH])
				} else {
					await execFileAsync(python!, ["-m", "venv", JinaRouterManager.VENV_PATH])
				}
			} catch (err) {
				return { ok: false, msg: `Failed to create venv: ${(err as Error).message}` }
			}
		}

		// Install Python dependencies
		const deps = ["fastapi", "uvicorn", "httpx", "sentence-transformers", "numpy", "pydantic"]
		try {
			if (uv) {
				await execFileAsync(uv, ["pip", "install", "--python", venvPython, ...deps])
			} else {
				const pipPath = path.join(venvBin, "pip")
				await execFileAsync(pipPath, ["install", ...deps])
			}
		} catch (err) {
			return { ok: false, msg: `Failed to install dependencies: ${(err as Error).message}` }
		}

		// Copy server.py to ~/.aki/jina-router/server.py
		try {
			const srcScript = this.resolveScriptSource()
			await fs.copyFile(srcScript, JinaRouterManager.SCRIPT_PATH)
		} catch (err) {
			return { ok: false, msg: `Failed to copy server script: ${(err as Error).message}` }
		}

		// Create default routes.json if absent
		try {
			try {
				await fs.access(JinaRouterManager.ROUTES_PATH)
				// already exists, skip
			} catch {
				await fs.writeFile(JinaRouterManager.ROUTES_PATH, JSON.stringify(DEFAULT_ROUTES, null, 2), "utf8")
			}
		} catch (err) {
			return { ok: false, msg: `Failed to write routes.json: ${(err as Error).message}` }
		}

		return {
			ok: true,
			msg: "Jina router installed. Note: first start downloads jina-embeddings-v2-small-en (~80 MB) from Hugging Face.",
		}
	}

	async start(port = JinaRouterManager.DEFAULT_PORT): Promise<{ ok: boolean; msg: string; url?: string }> {
		// Check if already running via PID file
		const existingPid = await this.readPid()
		if (existingPid !== null && this.isPidAlive(existingPid)) {
			const url = `http://127.0.0.1:${port}`
			return { ok: true, msg: `Router already running (pid ${existingPid})`, url }
		}

		// Check venv and script installed
		const venvPython = path.join(JinaRouterManager.VENV_PATH, "bin", "python")
		try {
			await fs.access(venvPython)
		} catch {
			return { ok: false, msg: "Router not installed — run: aki router install" }
		}
		try {
			await fs.access(JinaRouterManager.SCRIPT_PATH)
		} catch {
			return { ok: false, msg: "Router not installed — run: aki router install" }
		}

		// Ensure log dir
		await fs.mkdir(path.dirname(JinaRouterManager.LOG_FILE), { recursive: true })

		// Spawn detached
		const outFd = await fs.open(JinaRouterManager.LOG_FILE, "a")
		const proc = spawn(venvPython, [JinaRouterManager.SCRIPT_PATH], {
			detached: true,
			stdio: ["ignore", outFd.fd, outFd.fd],
			env: {
				...process.env,
				PORT: String(port),
				LITELLM_URL: "http://127.0.0.1:4000",
			},
		})
		proc.unref()

		// Write PID
		if (proc.pid !== undefined) {
			await fs.mkdir(path.dirname(JinaRouterManager.PID_FILE), { recursive: true })
			await fs.writeFile(JinaRouterManager.PID_FILE, String(proc.pid), "utf8")
		}

		// Close our fd handle (child inherited it)
		await outFd.close()

		// Health check — first start may download model (up to 60s)
		const healthy = await this.healthCheck(port)
		if (!healthy) {
			return {
				ok: false,
				msg: "Router started but health check timed out after 60s — check ~/.aki/jina-router.log (first run downloads ~80 MB model)",
			}
		}

		const url = `http://127.0.0.1:${port}`
		return { ok: true, msg: "Router started", url }
	}

	async stop(): Promise<{ ok: boolean; msg: string }> {
		const pid = await this.readPid()

		if (pid === null) {
			return { ok: true, msg: "Router not running (no PID file)" }
		}

		if (!this.isPidAlive(pid)) {
			// Stale PID file
			await fs.unlink(JinaRouterManager.PID_FILE).catch(() => {})
			return { ok: true, msg: "Router was not running (stale PID removed)" }
		}

		// SIGTERM
		try {
			process.kill(pid, "SIGTERM")
		} catch {
			await fs.unlink(JinaRouterManager.PID_FILE).catch(() => {})
			return { ok: true, msg: "Router stopped" }
		}

		// Wait 5s, then SIGKILL if still alive
		await new Promise((resolve) => setTimeout(resolve, 5000))
		if (this.isPidAlive(pid)) {
			try {
				process.kill(pid, "SIGKILL")
			} catch {
				// already dead
			}
		}

		await fs.unlink(JinaRouterManager.PID_FILE).catch(() => {})
		return { ok: true, msg: `Router stopped (pid ${pid})` }
	}

	async status(port = JinaRouterManager.DEFAULT_PORT): Promise<RouterStatus> {
		const pid = await this.readPid()

		if (pid === null) {
			return { running: false }
		}

		if (!this.isPidAlive(pid)) {
			return { running: false }
		}

		// Quick health check (1 attempt)
		let healthy = false
		try {
			const res = await fetch(`http://127.0.0.1:${port}/health`)
			healthy = res.ok
		} catch {
			// not reachable
		}

		return {
			running: healthy,
			pid,
			port,
			url: `http://127.0.0.1:${port}`,
		}
	}
}

export const jinaRouterManager = new JinaRouterManager()
