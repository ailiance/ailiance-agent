import { describe, it } from "mocha"
import "should"
import { mcpToolToSpec } from "../../bootstrap"

const meta = {
	qualifiedName: "mcp__p_s__a",
	serverId: "s",
	pluginName: "p",
	rawName: "a",
	description: "does A",
	inputSchema: { type: "object", properties: {} },
}

describe("mcpToolToSpec gating", () => {
	it("is enabled when no gating set (undefined activeMcpTools)", () => {
		const spec = mcpToolToSpec(meta as any)
		spec.contextRequirements!({ activeMcpTools: undefined } as any).should.equal(true)
	})
	it("is enabled only when present in the active set", () => {
		const spec = mcpToolToSpec(meta as any)
		spec.contextRequirements!({ activeMcpTools: new Set(["mcp__p_s__a"]) } as any).should.equal(true)
		spec.contextRequirements!({ activeMcpTools: new Set(["other"]) } as any).should.equal(false)
	})
})
