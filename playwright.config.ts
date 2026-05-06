import { defineConfig } from "@playwright/test"

export default defineConfig({
	testDir: "./src/test/e2e",
	testMatch: /.*\.test\.ts/,
	timeout: 5 * 60 * 1000,
	expect: { timeout: 30 * 1000 },
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
	outputDir: "./test-results/playwright",
	use: {
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	projects: [
		{
			name: "setup",
			testMatch: /global\.setup\.ts/,
		},
		{
			name: "e2e",
			dependencies: ["setup"],
			testMatch: /.*\.test\.ts/,
		},
	],
})
