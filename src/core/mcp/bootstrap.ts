import { DiracToolSet } from "@core/prompts/system-prompt"
import type { DiracToolSpec } from "@core/prompts/system-prompt/spec"
import type { ToolExecutor } from "@core/task/ToolExecutor"
import { DiracDefaultTool } from "@/shared/tools"
import { Logger } from "@/shared/services/Logger"
import { McpToolHandler } from "./McpToolHandler"
import { mcpClientManager } from "./McpClientManager"
import type { McpToolMetadata } from "./types"

/**
 * Converts a JSON Schema property type string to a DiracToolSpec parameter type.
 * Falls back to "string" for unknown types.
 */
function mapJsonSchemaType(type: unknown): "string" | "boolean" | "integer" | "array" | "object" {
	switch (type) {
		case "boolean":
			return "boolean"
		case "integer":
		case "number":
			return "integer"
		case "array":
			return "array"
		case "object":
			return "object"
		default:
			return "string"
	}
}

/**
 * Converts a flat JSON Schema (top-level properties only) to DiracToolSpec parameters.
 * Nested objects are preserved via the `properties` field but not recursed.
 */
export function convertJsonSchemaToParams(
	inputSchema: object,
): NonNullable<DiracToolSpec["parameters"]> {
	const schema = inputSchema as {
		properties?: Record<string, { type?: unknown; description?: string; items?: unknown; properties?: unknown }>
		required?: string[]
	}

	if (!schema.properties) {
		return []
	}

	const requiredSet = new Set<string>(Array.isArray(schema.required) ? schema.required : [])

	return Object.entries(schema.properties).map(([name, prop]) => {
		const paramType = mapJsonSchemaType(prop.type)
		const param: NonNullable<DiracToolSpec["parameters"]>[number] = {
			name,
			required: requiredSet.has(name),
			instruction: prop.description ?? name,
			type: paramType,
		}
		if (paramType === "array" && prop.items) {
			param.items = prop.items
		}
		if (paramType === "object" && prop.properties) {
			param.properties = prop.properties
		}
		return param
	})
}

/**
 * Converts an McpToolMetadata to a DiracToolSpec for LLM function-calling exposure.
 * Uses qualifiedName as both id and name so the LLM calls the tool by its full qualified name.
 */
export function mcpToolToSpec(tool: McpToolMetadata): DiracToolSpec {
	return {
		// Cast is intentional: MCP tools use dynamic qualified names, not enum values.
		// The same pattern is used in McpToolHandler.
		id: tool.qualifiedName as DiracDefaultTool,
		name: tool.qualifiedName,
		description: tool.description ?? `MCP tool from plugin ${tool.pluginName}`,
		parameters: convertJsonSchemaToParams(tool.inputSchema),
	}
}

/**
 * Initialize MCP integration: load plugin configs, discover tools, register handlers
 * in the ToolExecutor coordinator, and expose tool specs to the LLM via DiracToolSet.
 *
 * Lazy-spawns MCP servers (only when listAllTools is called). Failures are logged
 * but never crash the boot — agent-kiki must work without plugins.
 *
 * @param toolExecutor - The ToolExecutor instance to register MCP tool handlers on.
 * @param registerSpec - Optional override for tool spec registration (default: DiracToolSet.register).
 *                       Useful in tests to prevent polluting the shared DiracToolSet singleton.
 */
export async function initializeMcpForTask(
	toolExecutor: ToolExecutor,
	registerSpec: (spec: ReturnType<typeof mcpToolToSpec>) => void = (spec) => DiracToolSet.register(spec),
): Promise<McpToolMetadata[]> {
	try {
		await mcpClientManager.loadFromPlugins()
		const tools = await mcpClientManager.listAllTools()

		for (const tool of tools) {
			try {
				toolExecutor.registerMcpTool(tool.qualifiedName, new McpToolHandler(tool))
				registerSpec(mcpToolToSpec(tool))
			} catch (err) {
				Logger.warn(`MCP: failed to register tool ${tool.qualifiedName}:`, err)
			}
		}

		if (tools.length > 0) {
			Logger.info(`MCP: registered ${tools.length} tool(s) from plugins`)
		}

		return tools
	} catch (err) {
		Logger.warn("MCP initialization failed (continuing without plugins):", err)
		return []
	}
}
