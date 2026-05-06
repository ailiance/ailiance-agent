import { execFile, spawn } from "node:child_process"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export interface ProxyStatus {
	running: boolean
	pid?: number
	port?: number
	uptime?: number // ms
	url?: string
}

const DEFAULT_CONFIG_YAML = `model_list:
  # Anthropic
  - model_name: claude-opus-4-5
    litellm_params:
      model: anthropic/claude-opus-4-5
      api_key: os.environ/ANTHROPIC_API_KEY
  - model_name: claude-sonnet-4-5
    litellm_params:
      model: anthropic/claude-sonnet-4-5
      api_key: os.environ/ANTHROPIC_API_KEY
  - model_name: claude-haiku-4-5
    litellm_params:
      model: anthropic/claude-haiku-4-5
      api_key: os.environ/ANTHROPIC_API_KEY

  # OpenAI
  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o
      api_key: os.environ/OPENAI_API_KEY
  - model_name: gpt-5-mini
    litellm_params:
      model: openai/gpt-5-mini
      api_key: os.environ/OPENAI_API_KEY

  # Ollama local
  - model_name: ollama-default
    litellm_params:
      model: ollama/llama3.1:8b
      api_base: http://localhost:11434

  # Ollama on macM1 (Tailscale 100.112.121.126)
  - model_name: gemma3-1b
    litellm_params:
      model: ollama/gemma3:1b
      api_base: http://100.112.121.126:11434
  - model_name: gemma3-4b
    litellm_params:
      model: ollama/gemma3:4b
      api_base: http://100.112.121.126:11434

  # EU sovereign workers (MLX / llama.cpp on Tailscale — always-on not guaranteed)
  - model_name: eu-kiki-apertus-70b
    litellm_params:
      model: openai/apertus-70b
      api_base: http://100.116.92.12:9301/v1
      api_key: not-used
  - model_name: eu-kiki-eurollm-22b
    litellm_params:
      model: openai/eurollm-22b
      api_base: http://100.116.92.12:9303/v1
      api_key: not-used
  - model_name: eu-kiki-devstral-24b
    litellm_params:
      model: openai/devstral
      api_base: http://100.112.121.126:9302/v1
      api_key: not-used
  - model_name: eu-kiki-gemma3-4b
    litellm_params:
      model: openai/gemma3-4b
      api_base: http://100.78.6.122:9304/v1
      api_key: not-used
  - model_name: eu-kiki-gateway
    litellm_params:
      model: openai/auto
      api_base: http://100.78.191.52:9300/v1
      api_key: not-used

litellm_settings:
  drop_params: true
  set_verbose: false
  cache: true
  cache_params:
    type: local      # local in-memory, no Redis dep

router_settings:
  routing_strategy: simple-shuffle
  num_retries: 2
  timeout: 600
`

export class LiteLLMProxyManager {
	private startedAt: Date | null = null

	static readonly DEFAULT_PORT = 4000
	static readonly VENV_PATH = path.join(os.homedir(), ".aki", "litellm-venv")
	static readonly CONFIG_PATH = path.join(os.homedir(), ".aki", "litellm", "config.yaml")
	static readonly PID_FILE = path.join(os.homedir(), ".aki", "litellm.pid")
	static readonly LOG_FILE = path.join(os.homedir(), ".aki", "litellm.log")

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
		// Prefer versioned Python ≤ 3.13: uvloop (dep of uvicorn[standard]) doesn't support 3.14+
		for (const name of ["python3.12", "python3.13", "python3.11"]) {
			try {
				const { stdout } = await execFileAsync("which", [name])
				const p = stdout.trim()
				if (p) return p
			} catch {
				// not found
			}
		}
		for (const candidate of ["/opt/homebrew/bin/python3", "/usr/bin/python3", "/usr/local/bin/python3"]) {
			try {
				await fs.access(candidate)
				return candidate
			} catch {
				// not found
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
			const raw = await fs.readFile(LiteLLMProxyManager.PID_FILE, "utf8")
			const pid = Number.parseInt(raw.trim(), 10)
			return Number.isNaN(pid) ? null : pid
		} catch {
			return null
		}
	}

	private async healthCheck(port: number, retries = 30, delayMs = 1000): Promise<boolean> {
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

	async install(): Promise<{ ok: boolean; msg: string }> {
		const uv = await this.findUv()
		const python = await this.findPython()

		if (!uv && !python) {
			return { ok: false, msg: "Python 3.10+ required (install via brew or pyenv)" }
		}

		// Ensure log dir exists
		await fs.mkdir(path.dirname(LiteLLMProxyManager.LOG_FILE), { recursive: true })

		// Create venv if needed
		const venvBin = path.join(LiteLLMProxyManager.VENV_PATH, "bin")
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
					// Pin Python ≤ 3.13: uvloop (dep of uvicorn[standard]) does not support 3.14+
					await execFileAsync(uv, ["venv", LiteLLMProxyManager.VENV_PATH, "--python", "3.12"])
				} else {
					// python is already a compatible version (findPython prefers 3.12/3.13/3.11)
					await execFileAsync(python!, ["-m", "venv", LiteLLMProxyManager.VENV_PATH])
				}
			} catch (err) {
				return { ok: false, msg: `Failed to create venv: ${(err as Error).message}` }
			}
		}

		// Install litellm[proxy]
		try {
			const logFd = await fs.open(LiteLLMProxyManager.LOG_FILE, "a")
			try {
				if (uv) {
					await execFileAsync(uv, ["pip", "install", "--python", venvPython, "litellm[proxy]"])
				} else {
					const pipPath = path.join(venvBin, "pip")
					await execFileAsync(pipPath, ["install", "litellm[proxy]"])
				}
			} finally {
				await logFd.close()
			}
		} catch (err) {
			return { ok: false, msg: `Failed to install litellm[proxy]: ${(err as Error).message}` }
		}

		// Write default config if absent
		try {
			await fs.mkdir(path.dirname(LiteLLMProxyManager.CONFIG_PATH), { recursive: true })
			try {
				await fs.access(LiteLLMProxyManager.CONFIG_PATH)
				// config already exists, skip
			} catch {
				await fs.writeFile(LiteLLMProxyManager.CONFIG_PATH, DEFAULT_CONFIG_YAML, "utf8")
			}
		} catch (err) {
			return { ok: false, msg: `Failed to write config: ${(err as Error).message}` }
		}

		return { ok: true, msg: "LiteLLM proxy installed successfully" }
	}

	async start(port = LiteLLMProxyManager.DEFAULT_PORT): Promise<{ ok: boolean; msg: string; url?: string }> {
		// Check if already running via PID file
		const existingPid = await this.readPid()
		if (existingPid !== null && this.isPidAlive(existingPid)) {
			const url = `http://127.0.0.1:${port}`
			return { ok: true, msg: `Proxy already running (pid ${existingPid})`, url }
		}

		// Check installed
		const litellmBin = path.join(LiteLLMProxyManager.VENV_PATH, "bin", "litellm")
		try {
			await fs.access(litellmBin)
		} catch {
			return { ok: false, msg: "LiteLLM not installed — run: aki proxy install" }
		}
		try {
			await fs.access(LiteLLMProxyManager.CONFIG_PATH)
		} catch {
			return { ok: false, msg: "Config not found — run: aki proxy install" }
		}

		// Ensure log dir
		await fs.mkdir(path.dirname(LiteLLMProxyManager.LOG_FILE), { recursive: true })

		// Spawn detached
		const outFd = await fs.open(LiteLLMProxyManager.LOG_FILE, "a")
		const proc = spawn(
			litellmBin,
			["--config", LiteLLMProxyManager.CONFIG_PATH, "--port", String(port), "--host", "127.0.0.1"],
			{
				detached: true,
				stdio: ["ignore", outFd.fd, outFd.fd],
			},
		)
		proc.unref()

		// Write PID
		if (proc.pid !== undefined) {
			await fs.mkdir(path.dirname(LiteLLMProxyManager.PID_FILE), { recursive: true })
			await fs.writeFile(LiteLLMProxyManager.PID_FILE, String(proc.pid), "utf8")
		}

		// Close our fd handle (child inherited it)
		await outFd.close()

		// Health check
		const healthy = await this.healthCheck(port)
		if (!healthy) {
			return { ok: false, msg: "Proxy started but health check timed out after 30s — check ~/.aki/litellm.log" }
		}

		const url = `http://127.0.0.1:${port}`
		this.startedAt = new Date()
		return { ok: true, msg: "Proxy started", url }
	}

	async stop(): Promise<{ ok: boolean; msg: string }> {
		const pid = await this.readPid()

		if (pid === null) {
			return { ok: true, msg: "Proxy not running (no PID file)" }
		}

		if (!this.isPidAlive(pid)) {
			// Stale PID file
			await fs.unlink(LiteLLMProxyManager.PID_FILE).catch(() => {})
			return { ok: true, msg: "Proxy was not running (stale PID removed)" }
		}

		// SIGTERM
		try {
			process.kill(pid, "SIGTERM")
		} catch {
			await fs.unlink(LiteLLMProxyManager.PID_FILE).catch(() => {})
			return { ok: true, msg: "Proxy stopped" }
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

		await fs.unlink(LiteLLMProxyManager.PID_FILE).catch(() => {})
		this.startedAt = null
		return { ok: true, msg: `Proxy stopped (pid ${pid})` }
	}

	async status(port = LiteLLMProxyManager.DEFAULT_PORT): Promise<ProxyStatus> {
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

		const uptime = this.startedAt ? Date.now() - this.startedAt.getTime() : undefined
		return {
			running: healthy,
			pid,
			port,
			uptime,
			url: `http://127.0.0.1:${port}`,
		}
	}
}

export const liteLLMProxyManager = new LiteLLMProxyManager()
