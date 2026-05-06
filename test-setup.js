// Path alias resolution for VS Code integration tests.
// Referenced from .vscode-test.mjs as `require: ["./test-setup.js"]`.
// Maps tsconfig.test.json paths so compiled CJS test files in out/ can
// resolve "@/...", "@core/...", etc. at runtime.

require("tsconfig-paths").register({
	baseUrl: __dirname,
	paths: {
		"@/*": ["out/src/*"],
		"@api/*": ["out/src/core/api/*"],
		"@core/*": ["out/src/core/*"],
		"@generated/*": ["out/src/generated/*"],
		"@hosts/*": ["out/src/hosts/*"],
		"@integrations/*": ["out/src/integrations/*"],
		"@packages/*": ["out/src/packages/*"],
		"@services/*": ["out/src/services/*"],
		"@shared/*": ["out/src/shared/*"],
		"@utils/*": ["out/src/utils/*"],
	},
})
