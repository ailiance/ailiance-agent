import { localStackManager } from "@/services/local-stack/LocalStackManager"
import { stackMonitor } from "@/services/local-stack/StackMonitor"

type GrpcHandler = (body: unknown) => Promise<unknown> | unknown

export class GrpcRouter {
	private handlers = new Map<string, GrpcHandler>()

	constructor() {
		this.registerStackService()
	}

	private registerStackService() {
		this.handlers.set("StackService/getSnapshot", async () => {
			return await stackMonitor.snapshot()
		})

		this.handlers.set("StackService/startStack", async () => {
			return await localStackManager.start()
		})

		this.handlers.set("StackService/stopStack", async () => {
			return await localStackManager.stop()
		})

		this.handlers.set("StackService/restartStack", async () => {
			await localStackManager.stop()
			return await localStackManager.start()
		})

		this.handlers.set("StackService/setUseLocalStack", async (body: unknown) => {
			const { StateManager } = await import("@/core/storage/StateManager")
			const val = (body as { value?: unknown })?.value
			StateManager.get().setGlobalState("useLocalStack", !!val)
			return { ok: true }
		})

		this.handlers.set("StackService/setEnabledMcpServers", async (body: unknown) => {
			const { StateManager } = await import("@/core/storage/StateManager")
			const ids = (body as { ids?: unknown })?.ids
			StateManager.get().setGlobalState("enabledMcpServers", Array.isArray(ids) ? ids : undefined)
			return { ok: true }
		})
	}

	async handle(method: string, body: unknown): Promise<{ status: number; data: unknown }> {
		const handler = this.handlers.get(method)
		if (!handler) {
			return { status: 404, data: { error: `unknown method: ${method}` } }
		}
		try {
			const result = await handler(body)
			return { status: 200, data: result }
		} catch (err) {
			return {
				status: 500,
				data: { error: err instanceof Error ? err.message : String(err) },
			}
		}
	}
}

export const grpcRouter = new GrpcRouter()
