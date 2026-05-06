import * as assert from "assert"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import * as sinon from "sinon"
import { PluginInstaller } from "../PluginInstaller"

describe("PluginInstaller.parseUrl", () => {
	it("resolves short github form user/repo", () => {
		const r = PluginInstaller.parseUrl("obra/superpowers")
		assert.strictEqual(r.url, "https://github.com/obra/superpowers.git")
		assert.strictEqual(r.owner, "obra")
		assert.strictEqual(r.repo, "superpowers")
		assert.strictEqual(r.ref, undefined)
	})

	it("resolves short github form with @branch ref", () => {
		const r = PluginInstaller.parseUrl("user/repo@v1.2.3")
		assert.strictEqual(r.url, "https://github.com/user/repo.git")
		assert.strictEqual(r.ref, "v1.2.3")
		assert.strictEqual(r.owner, "user")
		assert.strictEqual(r.repo, "repo")
	})

	it("resolves short github form with #commit ref", () => {
		const r = PluginInstaller.parseUrl("user/repo#abc123")
		assert.strictEqual(r.url, "https://github.com/user/repo.git")
		assert.strictEqual(r.ref, "abc123")
	})

	it("resolves full https URL", () => {
		const r = PluginInstaller.parseUrl("https://github.com/foo/bar")
		assert.strictEqual(r.owner, "foo")
		assert.strictEqual(r.repo, "bar")
		assert.ok(r.url.endsWith(".git"))
	})

	it("resolves full https URL already ending in .git", () => {
		const r = PluginInstaller.parseUrl("https://github.com/foo/bar.git")
		assert.strictEqual(r.url, "https://github.com/foo/bar.git")
		assert.strictEqual(r.owner, "foo")
		assert.strictEqual(r.repo, "bar")
	})

	it("resolves SSH git@ URL", () => {
		const r = PluginInstaller.parseUrl("git@github.com:foo/bar.git")
		assert.strictEqual(r.owner, "foo")
		assert.strictEqual(r.repo, "bar")
	})

	it("throws on invalid input with no slash", () => {
		assert.throws(() => PluginInstaller.parseUrl("invalid"), /Cannot parse plugin URL/)
	})
})

describe("PluginInstaller.install", () => {
	let installer: PluginInstaller
	let sandbox: sinon.SinonSandbox
	let tmpDir: string

	beforeEach(async () => {
		installer = new PluginInstaller()
		sandbox = sinon.createSandbox()
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aki-plugin-test-"))
		// Override PLUGINS_DIR by monkey-patching the private field via the prototype chain
		// We stub fs.mkdir, fs.access, fs.readFile, fs.rm and child_process.execFile
	})

	afterEach(async () => {
		sandbox.restore()
		await fs.rm(tmpDir, { recursive: true, force: true })
	})

	it("returns error when target dir already exists", async () => {
		// Stub fs.access to succeed (dir exists)
		sandbox.stub(fs, "access").resolves()

		const r = await installer.install("obra/superpowers")
		assert.strictEqual(r.ok, false)
		assert.ok(r.msg.includes("Already installed"))
	})

	it("returns error when git clone fails", async () => {
		// Dir does not exist
		sandbox.stub(fs, "access").rejects(new Error("ENOENT"))
		sandbox.stub(fs, "mkdir").resolves()
		// Inject failing execFile
		installer._execFile = async () => { throw new Error("repository not found") }

		const r = await installer.install("obra/superpowers")
		assert.strictEqual(r.ok, false)
		assert.ok(r.msg.includes("git clone failed") || r.msg.includes("repository not found"))
	})

	it("cleans up and returns error when plugin.json is missing", async () => {
		sandbox.stub(fs, "access").rejects(new Error("ENOENT"))
		sandbox.stub(fs, "mkdir").resolves()

		// git clone succeeds
		installer._execFile = async () => ({ stdout: "", stderr: "" })

		// readFile fails (no plugin.json)
		sandbox.stub(fs, "readFile").rejects(new Error("ENOENT"))
		const rmStub = sandbox.stub(fs, "rm").resolves()

		const r = await installer.install("obra/superpowers")
		assert.strictEqual(r.ok, false)
		assert.ok(r.msg.includes("plugin.json"))
		assert.ok(rmStub.called, "should cleanup on failure")
	})

	it("cleans up and returns error when plugin.json has no name field", async () => {
		sandbox.stub(fs, "access").rejects(new Error("ENOENT"))
		sandbox.stub(fs, "mkdir").resolves()

		installer._execFile = async () => ({ stdout: "", stderr: "" })

		sandbox.stub(fs, "readFile").resolves(JSON.stringify({ version: "1.0.0" }) as any)
		const rmStub = sandbox.stub(fs, "rm").resolves()

		const r = await installer.install("obra/superpowers")
		assert.strictEqual(r.ok, false)
		assert.ok(r.msg.includes("missing name"))
		assert.ok(rmStub.called)
	})

	it("returns ok with plugin info on success", async () => {
		sandbox.stub(fs, "access").rejects(new Error("ENOENT"))
		sandbox.stub(fs, "mkdir").resolves()

		installer._execFile = async () => ({ stdout: "", stderr: "" })

		sandbox.stub(fs, "readFile").resolves(JSON.stringify({ name: "superpowers", version: "2.0.0" }) as any)

		const r = await installer.install("obra/superpowers")
		assert.strictEqual(r.ok, true)
		assert.ok(r.msg.includes("superpowers@2.0.0"))
		assert.ok(r.plugin)
		assert.strictEqual(r.plugin?.name, "superpowers")
		assert.strictEqual(r.plugin?.version, "2.0.0")
	})
})

describe("PluginInstaller.list", () => {
	let installer: PluginInstaller
	let sandbox: sinon.SinonSandbox

	beforeEach(() => {
		installer = new PluginInstaller()
		sandbox = sinon.createSandbox()
	})

	afterEach(() => {
		sandbox.restore()
	})

	it("returns empty array when plugins dir does not exist", async () => {
		sandbox.stub(fs, "readdir").rejects(new Error("ENOENT"))
		const result = await installer.list()
		assert.deepStrictEqual(result, [])
	})

	it("returns parsed plugins from cache dir structure", async () => {
		const readdirStub = sandbox.stub(fs, "readdir")

		// owners level
		readdirStub.onFirstCall().resolves([
			{ name: "obra", isDirectory: () => true } as any,
		])
		// repos level
		readdirStub.onSecondCall().resolves([
			{ name: "superpowers", isDirectory: () => true } as any,
		])
		// versions level
		readdirStub.onThirdCall().resolves([
			{ name: "latest", isDirectory: () => true } as any,
		])

		sandbox.stub(fs, "readFile").resolves(JSON.stringify({ name: "superpowers", version: "1.0.0" }) as any)

		const result = await installer.list()
		assert.strictEqual(result.length, 1)
		assert.strictEqual(result[0].name, "superpowers")
		assert.strictEqual(result[0].owner, "obra")
		assert.strictEqual(result[0].version, "1.0.0")
		assert.ok(result[0].rootDir.includes("obra"))
	})
})
