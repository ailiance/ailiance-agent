import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import { subprocessTransport, type Transport } from "../transport"

/** Spawns `ssh <host> node <remoteDaemonPath> <remoteCwd>` and frames JSON-RPC over its stdio. */
export function sshTransport(host: string, remoteDaemonPath: string, remoteCwd: string): Transport {
	const child = spawn("ssh", [host, "node", remoteDaemonPath, remoteCwd]) as ChildProcessWithoutNullStreams
	return subprocessTransport(child)
}
