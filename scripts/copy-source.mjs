import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Configuration for shipping source code within the extension.
 * This allows the AI agent to access its own source code for help and documentation.
 */
const SOURCE_COPY_CONFIG = {
	includeFolders: ["src", "cli", "webview-ui", "proto"],
	excludePatterns: [
		// Directories to skip (anchored to prevent false positives)
		/(^|\/)node_modules($|\/)/,
		/(^|\/)out($|\/)/,
		/(^|\/)dist($|\/)/,
		/(^|\/)build($|\/)/,
		/(^|\/)staging($|\/)/,
		/(^|\/)locales($|\/)/,
		/(^|\/)scripts($|\/)/,
		/(^|\/)scratch($|\/)/,
		/(^|\/)mjs($|\/)/,
		/(^|\/)asset($|\/)/,
		/(^|\/)woff($|\/)/,
		/(^|\/)package-lock($|\/)/,
		/(^|\/)evals($|\/)/,
		/(^|\/)\.dirac($|\/)/,
		/(^|\/)\.env($|\..*)/,
		/(^|\/)\.git($|\/)/,
		/(^|\/)generated($|\/)/,
		/(^|\/)__tests__($|\/)/,
		/(^|\/)test($|\/)/,
		/(^|\/)fixtures($|\/)/,
		/(^|\/)samples($|\/)/,
		/(^|\/)dev($|\/)/,
		/(^|\/)\.vscode($|\/)/,
		/(^|\/)\.github($|\/)/,
		/(^|\/)\.husky($|\/)/,
		/(^|\/)\.history($|\/)/,
		/(^|\/)\.bin($|\/)/,
		/(^|\/)\.idea($|\/)/,
		/(^|\/)man($|\/)/,

		// File patterns to skip
		/.*\.test\.ts$/,
		/.*\.spec\.ts$/,
		/.*\.stories\.tsx$/,
		/.*\.png$/,
		/.*\.jpg$/,
		/.*\.jpeg$/,
		/.*\.gif$/,
		/.*\.svg$/,
		/.*\.wasm$/,
		/.*\.woff$/,
		/.*\.woff2$/,
		/.*\.ttf$/,
		/package-lock\.json$/,
		/\.DS_Store$/,
		/.*\.map$/,
		/.*\.grit$/,
		/.*\.py$/,
		/.*\.sh$/,
		/.*\.rb$/,
		/.*\.pb$/,
		/.*\.md$/,
		/.*\.vite-port$/,
		/workspaceState\.json$/,
		/tsconfig.*\.json$/,
		/components\.json$/,

		// Specific large generated files
		/src\/shared\/proto/,
	],
}

/**
 * Generates a visual tree representation of the directory structure.
 * @param {string} dir The directory to start from
 * @param {string} prefix The prefix for the current line
 * @returns {string} The tree representation
 */
function generateTree(dir, prefix = "") {
	let result = ""
	if (!fs.existsSync(dir)) return result

	const entries = fs.readdirSync(dir, { withFileTypes: true })
	const dirs = entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort()

	dirs.forEach((d, i) => {
		const isLast = i === dirs.length - 1
		result += `${prefix}${isLast ? "└── " : "├── "}${d}/\n`
		result += generateTree(path.join(dir, d), `${prefix}${isLast ? "    " : "│   "}`)
	})
	return result
}

/**
 * Copies relevant source code to the destination directory.
 * @param {string} rootDir The root directory of the project
 * @param {string} destDir The destination directory (e.g., 'dist' or 'cli/dist')
 */
function copySourceCode(rootDir, destDir) {
	const sourceDest = path.join(destDir, "source")

	// Clear destination directory to avoid stale files
	if (fs.existsSync(sourceDest)) {
		fs.rmSync(sourceDest, { recursive: true, force: true })
	}
	fs.mkdirSync(sourceDest, { recursive: true })

	SOURCE_COPY_CONFIG.includeFolders.forEach((folder) => {
		const srcPath = path.join(rootDir, folder)
		const destPath = path.join(sourceDest, folder)

		if (fs.existsSync(srcPath)) {
			fs.mkdirSync(destPath, { recursive: true })
			const entries = fs.readdirSync(srcPath)

			for (const entry of entries) {
				const entrySrc = path.join(srcPath, entry)
				const entryDest = path.join(destPath, entry)

				// Skip the destination directory itself if it's inside the source
				// (e.g., when building CLI, dist/ is inside cli/)
				if (sourceDest.startsWith(entrySrc + path.sep) || sourceDest === entrySrc) {
					continue
				}

				const relativePath = path.relative(rootDir, entrySrc)
				if (SOURCE_COPY_CONFIG.excludePatterns.some((pattern) => pattern.test(relativePath))) {
					continue
				}

				fs.cpSync(entrySrc, entryDest, {
					recursive: true,
					filter: (src) => {
						const rel = path.relative(rootDir, src)
						return !SOURCE_COPY_CONFIG.excludePatterns.some((pattern) => pattern.test(rel))
					},
				})
			}
		}
	})

	// Generate tree.txt for the copied source code
	const tree = ".\n" + generateTree(sourceDest)
	fs.writeFileSync(path.join(sourceDest, "tree.txt"), tree)
}

// Run if called directly
const args = process.argv.slice(2)
if (args.length >= 2) {
	const rootDir = path.resolve(args[0])
	const destDir = path.resolve(args[1])
	copySourceCode(rootDir, destDir)
}

export { copySourceCode }
