import { liteLLMProxyManager } from "../litellm/LiteLLMProxyManager"
import { jinaRouterManager } from "../jina-router/JinaRouterManager"

export interface StackStatus {
	proxy: { running: boolean; url?: string }
	router: { running: boolean; url?: string }
	ready: boolean // both up
}

export class LocalStackManager {
	async install(): Promise<{ ok: boolean; msg: string }> {
		// 1. install proxy first
		const p = await liteLLMProxyManager.install()
		if (!p.ok) return { ok: false, msg: `proxy install failed: ${p.msg}` }
		// 2. install router
		const r = await jinaRouterManager.install()
		if (!r.ok) return { ok: false, msg: `router install failed: ${r.msg}` }
		return { ok: true, msg: "stack installed" }
	}

	async start(): Promise<{ ok: boolean; msg: string; status?: StackStatus }> {
		// 1. start proxy first (router needs it as upstream)
		const p = await liteLLMProxyManager.start()
		if (!p.ok) return { ok: false, msg: `proxy start failed: ${p.msg}` }
		// 2. start router
		const r = await jinaRouterManager.start()
		if (!r.ok) {
			// leave proxy up — user can clean via aki proxy stop
			return { ok: false, msg: `router start failed (proxy is up, run aki proxy stop to clean): ${r.msg}` }
		}
		const status = await this.status()
		return { ok: true, msg: "stack ready", status }
	}

	async stop(): Promise<{ ok: boolean; msg: string }> {
		// reverse order: router first, then proxy
		const r = await jinaRouterManager.stop()
		const p = await liteLLMProxyManager.stop()
		if (!r.ok || !p.ok) {
			return { ok: false, msg: `partial stop: router=${r.msg}, proxy=${p.msg}` }
		}
		return { ok: true, msg: "stack stopped" }
	}

	async status(): Promise<StackStatus> {
		const proxyStatus = await liteLLMProxyManager.status()
		const routerStatus = await jinaRouterManager.status()
		return {
			proxy: { running: proxyStatus.running, url: proxyStatus.url },
			router: { running: routerStatus.running, url: routerStatus.url },
			ready: proxyStatus.running && routerStatus.running,
		}
	}
}

export const localStackManager = new LocalStackManager()
