import { useStackStore } from "../store/stackStore"

export function LogsViewer() {
	const { snapshot } = useStackStore()
	const proxyLogs = snapshot?.proxyLogs ?? []
	const routerLogs = snapshot?.routerLogs ?? []

	return (
		<div className="space-y-4">
			<LogPanel title="LiteLLM Proxy logs" lines={proxyLogs} />
			<LogPanel title="Jina Router logs" lines={routerLogs} />
		</div>
	)
}

function LogPanel({ title, lines }: { title: string; lines: string[] }) {
	return (
		<div>
			<div className="mb-1 text-xs font-medium text-vscode-descriptionForeground">{title}</div>
			<div className="rounded-md bg-vscode-terminal-background border border-vscode-panel-border p-2 overflow-auto max-h-48">
				{lines.length === 0 ? (
					<span className="text-xs text-vscode-descriptionForeground italic">No log entries</span>
				) : (
					<pre className="text-xs text-vscode-terminal-foreground m-0 whitespace-pre-wrap break-all">
						{lines.join("\n")}
					</pre>
				)}
			</div>
		</div>
	)
}
