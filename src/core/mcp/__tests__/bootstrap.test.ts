import { expect } from "chai"
import { afterEach, beforeEach, describe, it } from "mocha"
import sinon from "sinon"
import { convertJsonSchemaToParams, initializeMcpForTask, mcpToolToSpec } from "../bootstrap"
import { mcpClientManager } from "../McpClientManager"
import type { McpToolMetadata } from "../types"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeToolMetadata(overrides: Partial<McpToolMetadata> = {}): McpToolMetadata {
	return {
		qualifiedName: "mcp__test_plugin_server__my_tool",
		serverId: "server",
		pluginName: "test-plugin",
		rawName: "my_tool",
		description: "A test MCP tool",
		inputSchema: {
			type: "object",
			properties: {
				message: { type: "string", description: "The message" },
				count: { type: "integer", description: "How many" },
				flag: { type: "boolean", description: "A flag" },
			},
			required: ["message"],
		},
		...overrides,
	}
}

interface RegisterMcpToolCapable {
	registerMcpTool(toolName: string, handler: unknown): void
}

function makeToolExecutorStub(): RegisterMcpToolCapable {
	return {
		registerMcpTool: sinon.stub(),
	}
}

// ---------------------------------------------------------------------------
// convertJsonSchemaToParams
// ---------------------------------------------------------------------------

describe("convertJsonSchemaToParams", () => {
	it("returns empty array when schema has no properties", () => {
		const params = convertJsonSchemaToParams({})
		expect(params).to.deep.equal([])
	})

	it("maps string/integer/boolean types correctly", () => {
		const schema = {
			properties: {
				name: { type: "string", description: "A name" },
				count: { type: "integer", description: "A count" },
				active: { type: "boolean", description: "Active flag" },
			},
			required: ["name"],
		}
		const params = convertJsonSchemaToParams(schema)
		expect(params).to.have.length(3)

		const name = params.find((p) => p.name === "name")!
		expect(name.required).to.be.true
		expect(name.type).to.equal("string")
		expect(name.instruction).to.equal("A name")

		const count = params.find((p) => p.name === "count")!
		expect(count.required).to.be.false
		expect(count.type).to.equal("integer")

		const active = params.find((p) => p.name === "active")!
		expect(active.type).to.equal("boolean")
	})

	it("maps array type and preserves items", () => {
		const schema = {
			properties: {
				items: { type: "array", description: "An array", items: { type: "string" } },
			},
		}
		const params = convertJsonSchemaToParams(schema)
		expect(params[0].type).to.equal("array")
		expect(params[0].items).to.deep.equal({ type: "string" })
	})

	it("maps object type and preserves properties", () => {
		const schema = {
			properties: {
				config: {
					type: "object",
					description: "Config object",
					properties: { key: { type: "string" } },
				},
			},
		}
		const params = convertJsonSchemaToParams(schema)
		expect(params[0].type).to.equal("object")
		expect(params[0].properties).to.deep.equal({ key: { type: "string" } })
	})

	it("defaults unknown types to string", () => {
		const schema = {
			properties: {
				weird: { type: "null", description: "null type" },
			},
		}
		const params = convertJsonSchemaToParams(schema)
		expect(params[0].type).to.equal("string")
	})
})

// ---------------------------------------------------------------------------
// mcpToolToSpec
// ---------------------------------------------------------------------------

describe("mcpToolToSpec", () => {
	it("produces a spec with qualifiedName as id and name", () => {
		const tool = makeToolMetadata()
		const spec = mcpToolToSpec(tool)
		expect(spec.name).to.equal(tool.qualifiedName)
		expect(String(spec.id)).to.equal(tool.qualifiedName)
	})

	it("uses tool description when present", () => {
		const tool = makeToolMetadata({ description: "Custom desc" })
		const spec = mcpToolToSpec(tool)
		expect(spec.description).to.equal("Custom desc")
	})

	it("falls back to generated description when tool description is missing", () => {
		const tool = makeToolMetadata({ description: undefined })
		const spec = mcpToolToSpec(tool)
		expect(spec.description).to.include("test-plugin")
	})

	it("converts inputSchema to parameters", () => {
		const tool = makeToolMetadata()
		const spec = mcpToolToSpec(tool)
		expect(spec.parameters).to.have.length(3)
	})
})

// ---------------------------------------------------------------------------
// initializeMcpForTask
// ---------------------------------------------------------------------------

describe("initializeMcpForTask", () => {
	let loadFromPluginsStub: sinon.SinonStub
	let listAllToolsStub: sinon.SinonStub
	// Noop registerSpec: prevents polluting the shared DiracToolSet singleton
	const noopRegisterSpec = sinon.stub()

	beforeEach(() => {
		loadFromPluginsStub = sinon.stub(mcpClientManager, "loadFromPlugins").resolves([])
		listAllToolsStub = sinon.stub(mcpClientManager, "listAllTools").resolves([])
		noopRegisterSpec.reset()
	})

	afterEach(() => {
		sinon.restore()
	})

	it("returns empty array when no plugins are configured", async () => {
		const executor = makeToolExecutorStub()
		const result = await initializeMcpForTask(executor as Parameters<typeof initializeMcpForTask>[0], noopRegisterSpec)
		expect(result).to.deep.equal([])
		expect((executor.registerMcpTool as sinon.SinonStub).called).to.be.false
	})

	it("registers tools in coordinator when plugins expose tools", async () => {
		const tool = makeToolMetadata()
		listAllToolsStub.resolves([tool])

		const executor = makeToolExecutorStub()
		const result = await initializeMcpForTask(executor as Parameters<typeof initializeMcpForTask>[0], noopRegisterSpec)

		expect(result).to.have.length(1)
		expect(result[0].qualifiedName).to.equal(tool.qualifiedName)
		expect((executor.registerMcpTool as sinon.SinonStub).calledOnce).to.be.true
		expect((executor.registerMcpTool as sinon.SinonStub).firstCall.args[0]).to.equal(tool.qualifiedName)
		expect(noopRegisterSpec.calledOnce).to.be.true
	})

	it("swallows loadFromPlugins errors and returns empty array", async () => {
		loadFromPluginsStub.rejects(new Error("plugin load failure"))

		const executor = makeToolExecutorStub()
		const result = await initializeMcpForTask(executor as Parameters<typeof initializeMcpForTask>[0], noopRegisterSpec)

		expect(result).to.deep.equal([])
		expect((executor.registerMcpTool as sinon.SinonStub).called).to.be.false
	})

	it("swallows listAllTools errors and returns empty array", async () => {
		listAllToolsStub.rejects(new Error("discovery failure"))

		const executor = makeToolExecutorStub()
		const result = await initializeMcpForTask(executor as Parameters<typeof initializeMcpForTask>[0], noopRegisterSpec)

		expect(result).to.deep.equal([])
	})

	it("skips individual tool registration errors without aborting the loop", async () => {
		const tool1 = makeToolMetadata({ qualifiedName: "mcp__p_s__tool1" })
		const tool2 = makeToolMetadata({ qualifiedName: "mcp__p_s__tool2" })
		listAllToolsStub.resolves([tool1, tool2])

		const executor = makeToolExecutorStub()
		;(executor.registerMcpTool as sinon.SinonStub).onFirstCall().throws(new Error("registration error"))

		const result = await initializeMcpForTask(executor as Parameters<typeof initializeMcpForTask>[0], noopRegisterSpec)

		// Both tools attempted; second one succeeds
		expect(result).to.have.length(2)
		expect((executor.registerMcpTool as sinon.SinonStub).calledTwice).to.be.true
	})
})
