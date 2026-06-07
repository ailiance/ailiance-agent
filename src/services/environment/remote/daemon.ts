import { type ChildProcess, spawn } from "node:child_process"
import { LocalEnvironment } from "../LocalEnvironment"
import { NOTIFY, RPC_METHODS } from "./protocol"
import { RpcPeer } from "./RpcPeer"
import { stdioTransport, type Transport } from "./transport"

/**
 * Daemon-side command runner. The streamId is provided by the CLIENT (so it can
 * demultiplex concurrent commands). Output is accumulated and returned as
 * [userRejected=false, outputString], matching the local executeCommandTool
 * contract that the ExecuteCommandToolHandler presents to the model.
 */
function makeDaemonCommandRunner(getPeer: () => RpcPeer, children: Map<string, ChildProcess>) {
	return (command: string, streamId: string): Promise<[boolean, string]> =>
		new Promise((resolve) => {
			let output = ""
			const child = spawn(command, { shell: true })
			children.set(streamId, child)
			child.stdout.on("data", (d: Buffer) => {
				const chunk = d.toString("utf8")
				output += chunk
				getPeer().notify(NOTIFY.output, { streamId, stream: "stdout", chunk })
			})
			child.stderr.on("data", (d: Buffer) => {
				const chunk = d.toString("utf8")
				output += chunk
				getPeer().notify(NOTIFY.output, { streamId, stream: "stderr", chunk })
			})
			child.on("error", () => {
				children.delete(streamId)
				resolve([false, output])
			})
			child.on("close", () => {
				children.delete(streamId)
				resolve([false, output])
			})
		})
}

export function createDaemonServer(transport: Transport, cwd: string): RpcPeer {
	let peer!: RpcPeer
	// Live children keyed by client streamId, for targeted abort/kill.
	const children = new Map<string, ChildProcess>()
	// Live exec() children keyed by client streamId (separate from runCommand's).
	const execChildren = new Map<string, ChildProcess>()
	const runCommand = makeDaemonCommandRunner(() => peer, children)
	const env = new LocalEnvironment(cwd)
	const handlers: Record<string, (p: any) => Promise<any>> = {
		[RPC_METHODS.readFile]: (p) => env.readFile(p.path),
		[RPC_METHODS.writeFile]: (p) => env.writeFile(p.path, p.content).then(() => null),
		[RPC_METHODS.exists]: (p) => env.exists(p.path),
		[RPC_METHODS.stat]: (p) => env.stat(p.path),
		[RPC_METHODS.list]: (p) => env.list(p.path, p.opts),
		[RPC_METHODS.mkdir]: (p) => env.mkdir(p.path, p.opts).then(() => null),
		[RPC_METHODS.delete]: (p) => env.delete(p.path, p.opts).then(() => null),
		[RPC_METHODS.rename]: (p) => env.rename(p.from, p.to).then(() => null),
		[RPC_METHODS.listFilesNative]: (p) => env.listFilesNative(p.path, p.recursive, p.limit),
		[RPC_METHODS.searchFormatted]: (p) => env.searchFormatted(p.directoryPath, p.regex, p.opts),
		[RPC_METHODS.runCommand]: (p) => runCommand(p.command, p.streamId),
		[RPC_METHODS.exec]: (p) =>
			new Promise<{ exitCode: number }>((resolve) => {
				const streamId: string = p.streamId
				const child = spawn(p.cmd, { shell: true, cwd: p.cwd })
				execChildren.set(streamId, child)
				child.stdout.on("data", (d: Buffer) =>
					peer.notify(NOTIFY.output, { streamId, stream: "stdout", chunk: d.toString("utf8") }),
				)
				child.stderr.on("data", (d: Buffer) =>
					peer.notify(NOTIFY.output, { streamId, stream: "stderr", chunk: d.toString("utf8") }),
				)
				child.on("error", () => {
					execChildren.delete(streamId)
					resolve({ exitCode: 1 })
				})
				child.on("close", (code, signal) => {
					execChildren.delete(streamId)
					resolve({ exitCode: code ?? (signal ? 1 : 0) })
				})
			}),
		[RPC_METHODS.dispose]: () => {
			for (const c of children.values()) {
				try {
					c.kill()
				} catch {}
			}
			children.clear()
			for (const c of execChildren.values()) {
				try {
					c.kill()
				} catch {}
			}
			execChildren.clear()
			return env.dispose().then(() => null)
		},
	}
	peer = new RpcPeer(transport, handlers)
	// Targeted abort: the client sends NOTIFY.abort {streamId} when its caller's
	// abortSignal fires; kill the matching child if it is still running.
	peer.onNotify(NOTIFY.abort, (params: any) => {
		const id = params?.streamId
		const child = id != null ? (children.get(id) ?? execChildren.get(id)) : undefined
		try {
			child?.kill()
		} catch {}
	})
	// exec() stdin/kill notifications target execChildren by client streamId.
	peer.onNotify(NOTIFY.stdin, (params: any) => {
		try {
			execChildren.get(params?.streamId)?.stdin?.write(params?.data)
		} catch {}
	})
	peer.onNotify(NOTIFY.kill, (params: any) => {
		try {
			execChildren.get(params?.streamId)?.kill(params?.signal)
		} catch {}
	})
	return peer
}

// Entry when spawned as `node dist/lisael-daemon.js [cwd]`
if (require.main === module) {
	createDaemonServer(stdioTransport(), process.argv[2] ?? process.cwd())
}
