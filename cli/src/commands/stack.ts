import type { LocalStackManager } from "@services/local-stack/LocalStackManager"

async function getManager(): Promise<LocalStackManager> {
	const { localStackManager } = await import("@services/local-stack/LocalStackManager")
	return localStackManager
}

export async function runStackInstall() {
	console.log("Installing local stack (LiteLLM proxy + Jina router)...")
	const manager = await getManager()
	const r = await manager.install()
	console.log(r.ok ? `✓ ${r.msg}` : `✗ ${r.msg}`)
	process.exit(r.ok ? 0 : 1)
}

export async function runStackStart() {
	console.log("Starting local stack...")
	const manager = await getManager()
	const r = await manager.start()
	if (r.ok && r.status) {
		console.log(`✓ Stack ready:`)
		console.log(`  proxy:  ${r.status.proxy.url}`)
		console.log(`  router: ${r.status.router.url}`)
		console.log(``)
		console.log(`Configure aki provider:`)
		console.log(`  apiProvider: "litellm"`)
		console.log(`  liteLlmBaseUrl: "${r.status.router.url}"`)
	} else {
		console.log(`✗ ${r.msg}`)
		process.exit(1)
	}
}

export async function runStackStop() {
	const manager = await getManager()
	const r = await manager.stop()
	console.log(r.ok ? `✓ ${r.msg}` : `✗ ${r.msg}`)
}

export async function runStackStatus() {
	const manager = await getManager()
	const s = await manager.status()
	console.log(JSON.stringify(s, null, 2))
}
