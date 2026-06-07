import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import path from "node:path"
import { LocalEnvironment } from "./LocalEnvironment"
import { bootstrapDaemonToContainer } from "./remote/docker/bootstrap"
import { dockerTransport } from "./remote/docker/dockerTransport"
import { RemoteEnvironment } from "./remote/RemoteEnvironment"
import { SshRemoteSession } from "./remote/ssh/SshRemoteSession"
import { subprocessTransport } from "./remote/transport"
import type { CommandRunner, Environment } from "./types"

export interface ResolveEnvironmentOptions {
	cwd: string
	commandRunner?: CommandRunner
}

export function resolveEnvironment(opts: ResolveEnvironmentOptions): Environment {
	// Opt-in SSH path: run tool I/O on a remote host over an ssh-spawned daemon,
	// with rsync workspace seed/pull. Default callers are unaffected.
	const isaacEnv = process.env.ISAAC_ENV
	if (isaacEnv?.startsWith("ssh:")) {
		return SshRemoteSession.create(isaacEnv.slice("ssh:".length), opts.cwd)
	}
	// Opt-in Docker path: run tool I/O inside a running container via `docker exec`.
	// ISAAC_ENV=docker:<container>:<wsPathInContainer>. The workspace is bind-mounted
	// by the user (shared FS → no sync); only the daemon bundle needs copying in.
	if (isaacEnv?.startsWith("docker:")) {
		const rest = isaacEnv.slice("docker:".length)
		const idx = rest.lastIndexOf(":")
		const container = idx === -1 ? rest : rest.slice(0, idx)
		const wsPath = idx === -1 ? opts.cwd : rest.slice(idx + 1)
		const remoteDaemon = "/tmp/lisael-daemon.js"
		const localBundle = path.join(__dirname, "lisael-daemon.js")
		// Best-effort daemon copy; runs concurrently with the exec. If the bundle is
		// already present (or the user pre-seeded it), a cp failure is non-fatal.
		void bootstrapDaemonToContainer(container, localBundle, remoteDaemon).catch(() => {})
		return new RemoteEnvironment(dockerTransport(container, remoteDaemon, wsPath), wsPath, {
			id: `docker:${container}`,
		})
	}
	// Opt-in remote path: spawn the bundled daemon and talk to it over stdio.
	// Default (and every existing caller) stays on LocalEnvironment, unchanged.
	if (isaacEnv === "remote-local") {
		const daemonPath = path.join(__dirname, "lisael-daemon.js")
		// Use process.execPath (the running Node binary), not a bare "node" that may
		// be absent from PATH. The transport is wired before listeners so a spawn
		// failure surfaces as a transport close that rejects pending requests.
		const child = spawn(process.execPath, [daemonPath, opts.cwd]) as ChildProcessWithoutNullStreams
		const transport = subprocessTransport(child)
		child.on("error", () => transport.close())
		child.on("exit", () => transport.close())
		return new RemoteEnvironment(transport, opts.cwd, { onClose: () => child.kill() })
	}
	return new LocalEnvironment(opts.cwd, opts.commandRunner)
}
