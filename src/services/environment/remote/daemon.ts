import { spawn } from "node:child_process"
import { LocalEnvironment } from "../LocalEnvironment"
import type { CommandRunner } from "../types"
import { NOTIFY, RPC_METHODS } from "./protocol"
import { RpcPeer } from "./RpcPeer"
import { stdioTransport, type Transport } from "./transport"

/** Daemon-side command runner: plain spawn, streams output via NOTIFY.output. */
function makeDaemonCommandRunner(getPeer: () => RpcPeer): CommandRunner {
	let counter = 0
	return (command, _timeoutSeconds, opts) =>
		new Promise((resolve) => {
			const streamId = `s${++counter}`
			const child = spawn(command, { shell: true })
			child.stdout.on("data", (d: Buffer) => {
				const chunk = d.toString("utf8")
				opts?.onOutputLine?.(chunk)
				getPeer().notify(NOTIFY.output, { streamId, stream: "stdout", chunk })
			})
			child.stderr.on("data", (d: Buffer) =>
				getPeer().notify(NOTIFY.output, { streamId, stream: "stderr", chunk: d.toString("utf8") }),
			)
			opts?.abortSignal?.addEventListener("abort", () => child.kill())
			child.on("close", () => resolve([false, ""]))
		})
}

export function createDaemonServer(transport: Transport, cwd: string): RpcPeer {
	let peer!: RpcPeer
	const env = new LocalEnvironment(
		cwd,
		makeDaemonCommandRunner(() => peer),
	)
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
		[RPC_METHODS.runCommand]: (p) => env.runCommand(p.command, p.timeoutSeconds, p.opts ?? {}),
		[RPC_METHODS.dispose]: () => env.dispose().then(() => null),
	}
	peer = new RpcPeer(transport, handlers)
	return peer
}

// Entry when spawned as `node dist/lisael-daemon.js [cwd]`
if (require.main === module) {
	createDaemonServer(stdioTransport(), process.argv[2] ?? process.cwd())
}
