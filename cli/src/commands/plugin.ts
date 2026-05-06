import type { PluginInstaller } from "@services/plugin-marketplace/PluginInstaller"

async function getInstaller(): Promise<PluginInstaller> {
	const { pluginInstaller } = await import("@services/plugin-marketplace/PluginInstaller")
	return pluginInstaller
}

export async function runPluginInstall(target: string): Promise<void> {
	console.log(`Installing plugin from ${target}...`)
	const installer = await getInstaller()
	const r = await installer.install(target)
	console.log(r.ok ? `✓ ${r.msg}` : `✗ ${r.msg}`)
	process.exit(r.ok ? 0 : 1)
}

export async function runPluginList(): Promise<void> {
	const installer = await getInstaller()
	const plugins = await installer.list()
	if (plugins.length === 0) {
		console.log("No plugins installed.")
		return
	}
	for (const p of plugins) {
		console.log(`${p.owner}/${p.name}${p.version ? `@${p.version}` : ""} → ${p.rootDir}`)
	}
}

export async function runPluginRemove(name: string): Promise<void> {
	const installer = await getInstaller()
	const r = await installer.remove(name)
	console.log(r.ok ? `✓ ${r.msg}` : `✗ ${r.msg}`)
	process.exit(r.ok ? 0 : 1)
}

export async function runPluginUpdate(name?: string): Promise<void> {
	const installer = await getInstaller()
	const r = await installer.update(name)
	console.log(r.ok ? `✓ ${r.msg}${r.updated.length > 0 ? ` (updated: ${r.updated.join(", ")})` : ""}` : `✗ ${r.msg}`)
	process.exit(r.ok ? 0 : 1)
}
