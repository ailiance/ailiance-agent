import type { LiteLLMProxyManager } from "@services/litellm/LiteLLMProxyManager"

async function getManager(): Promise<LiteLLMProxyManager> {
	const { liteLLMProxyManager } = await import("@services/litellm/LiteLLMProxyManager")
	return liteLLMProxyManager
}

export async function runProxyInstall(): Promise<void> {
	console.log("Installing LiteLLM proxy...")
	const manager = await getManager()
	const r = await manager.install()
	console.log(r.ok ? `✓ ${r.msg}` : `✗ ${r.msg}`)
	process.exit(r.ok ? 0 : 1)
}

export async function runProxyStart(opts: { port?: number }): Promise<void> {
	console.log("Starting LiteLLM proxy...")
	const manager = await getManager()
	const r = await manager.start(opts.port)
	console.log(r.ok ? `✓ Proxy started: ${r.url}` : `✗ ${r.msg}`)
	process.exit(r.ok ? 0 : 1)
}

export async function runProxyStop(): Promise<void> {
	const manager = await getManager()
	const r = await manager.stop()
	console.log(r.ok ? `✓ ${r.msg}` : `✗ ${r.msg}`)
}

export async function runProxyStatus(): Promise<void> {
	const manager = await getManager()
	const s = await manager.status()
	console.log(JSON.stringify(s, null, 2))
}
