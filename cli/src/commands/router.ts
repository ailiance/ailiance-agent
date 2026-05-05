import type { JinaRouterManager } from "@services/jina-router/JinaRouterManager"

async function getManager(): Promise<JinaRouterManager> {
	const { jinaRouterManager } = await import("@services/jina-router/JinaRouterManager")
	return jinaRouterManager
}

export async function runRouterInstall(): Promise<void> {
	console.log("Installing Jina semantic router...")
	const manager = await getManager()
	const r = await manager.install()
	console.log(r.ok ? `✓ ${r.msg}` : `✗ ${r.msg}`)
	process.exit(r.ok ? 0 : 1)
}

export async function runRouterStart(opts: { port?: number }): Promise<void> {
	console.log("Starting Jina semantic router...")
	const manager = await getManager()
	const r = await manager.start(opts.port)
	console.log(r.ok ? `✓ Router started: ${r.url}` : `✗ ${r.msg}`)
	process.exit(r.ok ? 0 : 1)
}

export async function runRouterStop(): Promise<void> {
	const manager = await getManager()
	const r = await manager.stop()
	console.log(r.ok ? `✓ ${r.msg}` : `✗ ${r.msg}`)
}

export async function runRouterStatus(): Promise<void> {
	const manager = await getManager()
	const s = await manager.status()
	console.log(JSON.stringify(s, null, 2))
}
