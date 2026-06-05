import path from "path"
import { defineConfig } from "vitest/config"

// Root vitest project for the MCP unit tests. These were migrated off the
// mocha + ts-node harness because that setup pairs `module: commonjs` with
// `moduleResolution: bundler` (invalid, TS5095) and pathologically flips MCP
// test files to native ESM on any structural change to the shared MCP types —
// which also blocked HTTP MCP transport support (streamableHttp pulls the
// ESM-only eventsource-parser). vitest (esbuild) handles ESM-only deps natively.
export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["src/core/mcp/__tests__/**/*.test.ts"],
		// The first test in a fresh worker pays the esbuild transform + module
		// import cost; on a loaded CI runner this intermittently exceeds the 5s
		// default and trips a spurious timeout (notably bootstrap.test.ts). These
		// tests are fully stubbed (no real I/O), so a generous budget removes the
		// flake without masking real hangs. See AUDIT-DETTE #19.
		testTimeout: 30000,
		hookTimeout: 30000,
	},
	resolve: {
		alias: {
			vscode: path.resolve(__dirname, "src/test/vscode-mock.ts"),
			// Match tsconfig paths (baseUrl = repo root)
			"@": path.resolve(__dirname, "src"),
			"@api": path.resolve(__dirname, "src/core/api"),
			"@core": path.resolve(__dirname, "src/core"),
			"@generated": path.resolve(__dirname, "src/generated"),
			"@hosts": path.resolve(__dirname, "src/hosts"),
			"@integrations": path.resolve(__dirname, "src/integrations"),
			"@packages": path.resolve(__dirname, "src/packages"),
			"@services": path.resolve(__dirname, "src/services"),
			"@shared": path.resolve(__dirname, "src/shared"),
			"@utils": path.resolve(__dirname, "src/utils"),
		},
	},
})
