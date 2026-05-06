/**
 * Tests for plugin hook runtime wiring (R3 — PR3-M4 plugin hooks runtime).
 *
 * Verifies that HookFactory.registerPluginHooks / getPluginHooksForEvent /
 * createWithStreaming correctly integrate plugin-defined hooks.
 *
 * No real child processes are spawned in these tests.
 */

import { afterEach, beforeEach, describe, it } from "mocha"
import "should"
import { EventEmitter } from "events"
import sinon from "sinon"
import { setDistinctId } from "@/services/logging/distinctId"
import type { LoadPluginHooksResult, PluginHookCommand } from "../../plugins/PluginHookLoader"
import { HookFactory } from "../hook-factory"
import { createHookTestEnv, HookTestEnv } from "./test-utils"

// Access the CJS child_process module object so sinon can mutate it
// (ESM named exports are non-configurable; require() returns a plain object)
// biome-ignore lint/security/noNodeRequire: test-only require for stubbing
const childProcess = require("child_process") as typeof import("child_process")

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePluginHook(overrides: Partial<PluginHookCommand> = {}): PluginHookCommand {
	return {
		command: "/fake/plugin/hook.sh",
		matcher: "",
		event: "PreToolUse",
		pluginName: "test-plugin",
		timeoutSeconds: 5,
		...overrides,
	}
}

function makeResult(byEvent: Record<string, PluginHookCommand[]>): LoadPluginHooksResult {
	return {
		byEvent: new Map(Object.entries(byEvent)),
		warnings: [],
	}
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("HookFactory — plugin hooks", () => {
	let sandbox: sinon.SinonSandbox
	let hookTestEnv: HookTestEnv

	beforeEach(async () => {
		setDistinctId("test-id")
		hookTestEnv = await createHookTestEnv()
		sandbox = hookTestEnv.sandbox
		HookFactory.clearPluginHooks()
	})

	afterEach(async () => {
		HookFactory.clearPluginHooks()
		await hookTestEnv.cleanup()
	})

	// -------------------------------------------------------------------------
	// registerPluginHooks / getPluginHooksForEvent
	// -------------------------------------------------------------------------

	it("registerPluginHooks stores hooks keyed by event", () => {
		const hook1 = makePluginHook({ event: "PreToolUse" })
		const hook2 = makePluginHook({ event: "PostToolUse", pluginName: "other-plugin" })

		HookFactory.registerPluginHooks(
			makeResult({
				PreToolUse: [hook1],
				PostToolUse: [hook2],
			}),
		)

		HookFactory.getPluginHooksForEvent("PreToolUse").should.have.length(1)
		HookFactory.getPluginHooksForEvent("PostToolUse").should.have.length(1)
		HookFactory.getPluginHooksForEvent("Notification").should.have.length(0)
	})

	it("registerPluginHooks replaces previous registration (idempotent)", () => {
		const hookA = makePluginHook({ command: "/a.sh" })
		const hookB = makePluginHook({ command: "/b.sh" })

		HookFactory.registerPluginHooks(makeResult({ PreToolUse: [hookA] }))
		HookFactory.registerPluginHooks(makeResult({ PreToolUse: [hookB] }))

		const hooks = HookFactory.getPluginHooksForEvent("PreToolUse")
		hooks.should.have.length(1)
		hooks[0].command.should.equal("/b.sh")
	})

	it("clearPluginHooks removes all registered hooks", () => {
		HookFactory.registerPluginHooks(makeResult({ PreToolUse: [makePluginHook()] }))
		HookFactory.clearPluginHooks()
		HookFactory.getPluginHooksForEvent("PreToolUse").should.have.length(0)
	})

	// -------------------------------------------------------------------------
	// hasHook — returns true when only plugin hooks are registered
	// -------------------------------------------------------------------------

	it("hasHook returns true when only a plugin hook is registered (no filesystem script)", async () => {
		HookFactory.registerPluginHooks(makeResult({ PreToolUse: [makePluginHook()] }))
		const factory = new HookFactory()
		const result = await factory.hasHook("PreToolUse")
		result.should.be.true()
	})

	it("hasHook returns false when no hooks at all", async () => {
		const factory = new HookFactory()
		const result = await factory.hasHook("PreToolUse")
		result.should.be.false()
	})

	// -------------------------------------------------------------------------
	// Matcher logic
	// -------------------------------------------------------------------------

	it("createWithStreaming skips plugin hook when matcher does not match toolName", async () => {
		const spawnStub = sandbox.stub(childProcess, "spawn")

		HookFactory.registerPluginHooks(
			makeResult({
				PreToolUse: [makePluginHook({ matcher: "^Bash$" })],
			}),
		)

		const factory = new HookFactory()
		// toolName = "ReadFile" — does not match "^Bash$"
		const runner = await factory.createWithStreaming("PreToolUse", undefined, undefined, "task-1", "ReadFile")
		await runner.run({ taskId: "task-1", preToolUse: { toolName: "ReadFile", parameters: {} } })

		spawnStub.called.should.be.false()
	})

	it("createWithStreaming includes plugin hook when matcher matches toolName", async () => {
		// Build a minimal fake child process that immediately emits close
		const fakeChild = new EventEmitter() as any
		fakeChild.stdout = new EventEmitter()
		fakeChild.stderr = new EventEmitter()
		fakeChild.stdin = { write: sinon.stub(), end: sinon.stub() }

		const spawnStub = sandbox.stub(childProcess, "spawn").returns(fakeChild)

		HookFactory.registerPluginHooks(
			makeResult({
				PreToolUse: [makePluginHook({ matcher: "^Bash$", command: "/plugin/hook.sh" })],
			}),
		)

		const factory = new HookFactory()
		const runner = await factory.createWithStreaming("PreToolUse", undefined, undefined, "task-1", "Bash")

		// Resolve the child process immediately (no stdout output → NoOp result)
		const runPromise = runner.run({ taskId: "task-1", preToolUse: { toolName: "Bash", parameters: {} } })
		setTimeout(() => fakeChild.emit("close", 0), 5)
		await runPromise

		spawnStub.calledOnce.should.be.true()
		// Verify CLAUDE_TASK_ID is in env passed to spawn
		const spawnEnv = spawnStub.firstCall.args[2]?.env as Record<string, string>
		spawnEnv.should.have.property("CLAUDE_TASK_ID").which.is.a.String()
	})

	it("createWithStreaming fires plugin hook with no matcher for any toolName", async () => {
		const fakeChild = new EventEmitter() as any
		fakeChild.stdout = new EventEmitter()
		fakeChild.stderr = new EventEmitter()
		fakeChild.stdin = { write: sinon.stub(), end: sinon.stub() }

		const spawnStub = sandbox.stub(childProcess, "spawn").returns(fakeChild)

		// Empty matcher = match all
		HookFactory.registerPluginHooks(makeResult({ PreToolUse: [makePluginHook({ matcher: "" })] }))

		const factory = new HookFactory()
		const runner = await factory.createWithStreaming("PreToolUse", undefined, undefined, "task-1", "AnyTool")

		const runPromise = runner.run({ taskId: "task-1", preToolUse: { toolName: "AnyTool", parameters: {} } })
		setTimeout(() => fakeChild.emit("close", 0), 5)
		await runPromise

		spawnStub.calledOnce.should.be.true()
	})

	it("createWithStreaming fires plugin hook when toolName is undefined and matcher is empty", async () => {
		const fakeChild = new EventEmitter() as any
		fakeChild.stdout = new EventEmitter()
		fakeChild.stderr = new EventEmitter()
		fakeChild.stdin = { write: sinon.stub(), end: sinon.stub() }

		const spawnStub = sandbox.stub(childProcess, "spawn").returns(fakeChild)

		HookFactory.registerPluginHooks(makeResult({ PreToolUse: [makePluginHook({ matcher: "" })] }))

		const factory = new HookFactory()
		// toolName omitted
		const runner = await factory.createWithStreaming("PreToolUse")

		const runPromise = runner.run({ taskId: "task-1", preToolUse: { toolName: "X", parameters: {} } })
		setTimeout(() => fakeChild.emit("close", 0), 5)
		await runPromise

		spawnStub.calledOnce.should.be.true()
	})

	// -------------------------------------------------------------------------
	// Timeout default
	// -------------------------------------------------------------------------

	it("PluginHookRunner uses default 10s timeout when timeoutSeconds absent", async () => {
		const fakeChild = new EventEmitter() as any
		fakeChild.stdout = new EventEmitter()
		fakeChild.stderr = new EventEmitter()
		fakeChild.stdin = { write: sinon.stub(), end: sinon.stub() }

		const spawnStub = sandbox.stub(childProcess, "spawn").returns(fakeChild)

		// Hook with no timeoutSeconds — verifies spawn is called (default timeout = 10s)
		const hook = makePluginHook({ timeoutSeconds: undefined })
		HookFactory.registerPluginHooks(makeResult({ PreToolUse: [hook] }))

		const factory = new HookFactory()
		const runner = await factory.createWithStreaming("PreToolUse", undefined, undefined, "task-1", "Bash")

		// Run and immediately resolve the child so the hook completes (no timeout triggered)
		const runPromise = runner.run({ taskId: "task-1", preToolUse: { toolName: "Bash", parameters: {} } })
		setTimeout(() => fakeChild.emit("close", 0), 5)
		const result = await runPromise

		// When no stdout JSON is emitted, the hook falls back to cancel:false
		result.cancel.should.be.false()
		spawnStub.calledOnce.should.be.true()
	})

	// -------------------------------------------------------------------------
	// Unsupported events (warning already emitted by PluginHookLoader, not HookFactory)
	// registerPluginHooks doesn't know about supported events — it trusts the loader.
	// But we verify it doesn't blow up if an unknown event is passed.
	// -------------------------------------------------------------------------

	it("registerPluginHooks silently accepts unknown event names", () => {
		const weirdHook = makePluginHook({ event: "SessionStart" })
		;(() => {
			HookFactory.registerPluginHooks(makeResult({ SessionStart: [weirdHook] }))
		}).should.not.throw()
		HookFactory.getPluginHooksForEvent("SessionStart").should.have.length(1)
	})
})
