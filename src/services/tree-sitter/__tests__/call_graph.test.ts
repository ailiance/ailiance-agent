import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import "should"
import { parseFile } from ".."
import { loadRequiredLanguageParsers } from "../languageParser"

describe("parseFile call graph", () => {
	const tmpDir = path.join(os.tmpdir(), `isaac-tree-sitter-test-${Math.random().toString(36).slice(2)}`)

	before(async () => {
		await fs.mkdir(tmpDir, { recursive: true })
	})

	after(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
	})

	it("should generate call graph for Python", async () => {
		const filePath = path.join(tmpDir, "test.py")
		await fs.writeFile(
			filePath,
			`
def helper():
    pass

def main():
    helper()
    external_call()

if __name__ == "__main__":
    main()
`,
		)

		const languageParsers = await loadRequiredLanguageParsers([filePath])
		const result = await parseFile(filePath, languageParsers, undefined, { showCallGraph: true })

		const helperDef = result!.find((d) => d.text.includes("def main():"))
		helperDef!.calls!.should.containEql("helper")
	})

	it("should generate call graph for TypeScript", async () => {
		const filePath = path.join(tmpDir, "test.ts")
		await fs.writeFile(
			filePath,
			`
function helper() {
  console.log("helper");
}

class Test {
  method() {
    helper();
    this.anotherMethod();
  }

  anotherMethod() {
    console.log("another");
  }
}

function main() {
  const t = new Test();
  t.method();
}
`,
		)

		const languageParsers = await loadRequiredLanguageParsers([filePath])
		const result = await parseFile(filePath, languageParsers, undefined, { showCallGraph: true })

		const methodDef = result!.find((d) => d.text.includes("method() {"))
		methodDef!.calls!.should.containEql("anotherMethod")
		methodDef!.calls!.should.containEql("helper")
		const mainDef = result!.find((d) => d.text.includes("function main() {"))
		mainDef!.calls!.should.containEql("method")
	})
})
