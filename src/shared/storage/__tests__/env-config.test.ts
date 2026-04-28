import { expect } from "chai"
import { afterEach, beforeEach, describe, it } from "mocha"
import { getProviderFromEnv, getSecretsFromEnv, getSettingsFromEnv, getSettingsOverridesFromEnv } from "../env-config"

// Save and restore process.env around each test
let savedEnv: NodeJS.ProcessEnv

beforeEach(() => {
	savedEnv = { ...process.env }
})

afterEach(() => {
	// Remove any keys added during test
	for (const key of Object.keys(process.env)) {
		if (!(key in savedEnv)) {
			delete process.env[key]
		}
	}
	// Restore original values
	Object.assign(process.env, savedEnv)
})

describe("getSecretsFromEnv - Bedrock credentials", () => {
	it("maps AWS_ACCESS_KEY_ID to awsAccessKey", () => {
		process.env.AWS_ACCESS_KEY_ID = "AKIATEST"
		const secrets = getSecretsFromEnv()
		expect(secrets.awsAccessKey).to.equal("AKIATEST")
	})

	it("maps AWS_SECRET_ACCESS_KEY to awsSecretKey", () => {
		process.env.AWS_SECRET_ACCESS_KEY = "secret123"
		const secrets = getSecretsFromEnv()
		expect(secrets.awsSecretKey).to.equal("secret123")
	})

	it("maps AWS_SESSION_TOKEN to awsSessionToken", () => {
		process.env.AWS_SESSION_TOKEN = "token456"
		const secrets = getSecretsFromEnv()
		expect(secrets.awsSessionToken).to.equal("token456")
	})

	it("maps all three AWS credential vars together", () => {
		process.env.AWS_ACCESS_KEY_ID = "AKIATEST"
		process.env.AWS_SECRET_ACCESS_KEY = "secret123"
		process.env.AWS_SESSION_TOKEN = "token456"
		const secrets = getSecretsFromEnv()
		expect(secrets.awsAccessKey).to.equal("AKIATEST")
		expect(secrets.awsSecretKey).to.equal("secret123")
		expect(secrets.awsSessionToken).to.equal("token456")
	})

	it("returns no AWS secrets when env vars are absent", () => {
		delete process.env.AWS_ACCESS_KEY_ID
		delete process.env.AWS_SECRET_ACCESS_KEY
		delete process.env.AWS_SESSION_TOKEN
		const secrets = getSecretsFromEnv()
		expect(secrets.awsAccessKey).to.be.undefined
		expect(secrets.awsSecretKey).to.be.undefined
		expect(secrets.awsSessionToken).to.be.undefined
	})
})

describe("getSettingsFromEnv - Bedrock region", () => {
	it("maps AWS_REGION to awsRegion", () => {
		process.env.AWS_REGION = "us-east-1"
		const settings = getSettingsFromEnv()
		expect(settings.awsRegion).to.equal("us-east-1")
	})

	it("returns no awsRegion when AWS_REGION is absent", () => {
		delete process.env.AWS_REGION
		const settings = getSettingsFromEnv()
		expect(settings.awsRegion).to.be.undefined
	})
})

describe("getSettingsOverridesFromEnv - Bedrock provider and model", () => {
	it("sets bedrock provider when AWS_REGION is present", () => {
		process.env.AWS_REGION = "us-east-1"
		const overrides = getSettingsOverridesFromEnv()
		expect(overrides.actModeApiProvider).to.equal("bedrock")
		expect(overrides.planModeApiProvider).to.equal("bedrock")
	})

	it("sets bedrock provider when AWS_ACCESS_KEY_ID is present", () => {
		process.env.AWS_ACCESS_KEY_ID = "AKIATEST"
		const overrides = getSettingsOverridesFromEnv()
		expect(overrides.actModeApiProvider).to.equal("bedrock")
		expect(overrides.planModeApiProvider).to.equal("bedrock")
	})

	it("does not set bedrock provider when no AWS env vars present", () => {
		delete process.env.AWS_REGION
		delete process.env.AWS_ACCESS_KEY_ID
		delete process.env.AWS_SECRET_ACCESS_KEY
		const overrides = getSettingsOverridesFromEnv()
		expect(overrides.actModeApiProvider).to.be.undefined
		expect(overrides.planModeApiProvider).to.be.undefined
	})

	it("applies AWS_BEDROCK_MODEL to both act and plan modes", () => {
		process.env.AWS_REGION = "us-east-1"
		process.env.AWS_BEDROCK_MODEL = "us.anthropic.claude-sonnet-4-6"
		const overrides = getSettingsOverridesFromEnv()
		expect(overrides.actModeApiModelId).to.equal("us.anthropic.claude-sonnet-4-6")
		expect(overrides.planModeApiModelId).to.equal("us.anthropic.claude-sonnet-4-6")
	})

	it("AWS_BEDROCK_MODEL_ACT overrides act mode only", () => {
		process.env.AWS_REGION = "us-east-1"
		process.env.AWS_BEDROCK_MODEL = "us.anthropic.claude-sonnet-4-6"
		process.env.AWS_BEDROCK_MODEL_ACT = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
		const overrides = getSettingsOverridesFromEnv()
		expect(overrides.actModeApiModelId).to.equal("us.anthropic.claude-haiku-4-5-20251001-v1:0")
		expect(overrides.planModeApiModelId).to.equal("us.anthropic.claude-sonnet-4-6")
	})

	it("AWS_BEDROCK_MODEL_PLAN overrides plan mode only", () => {
		process.env.AWS_REGION = "us-east-1"
		process.env.AWS_BEDROCK_MODEL = "us.anthropic.claude-sonnet-4-6"
		process.env.AWS_BEDROCK_MODEL_PLAN = "us.anthropic.claude-opus-4-6-v1"
		const overrides = getSettingsOverridesFromEnv()
		expect(overrides.actModeApiModelId).to.equal("us.anthropic.claude-sonnet-4-6")
		expect(overrides.planModeApiModelId).to.equal("us.anthropic.claude-opus-4-6-v1")
	})

	it("per-mode vars take precedence over shared fallback for both modes", () => {
		process.env.AWS_REGION = "us-east-1"
		process.env.AWS_BEDROCK_MODEL = "us.anthropic.claude-sonnet-4-6"
		process.env.AWS_BEDROCK_MODEL_ACT = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
		process.env.AWS_BEDROCK_MODEL_PLAN = "us.anthropic.claude-opus-4-6-v1"
		const overrides = getSettingsOverridesFromEnv()
		expect(overrides.actModeApiModelId).to.equal("us.anthropic.claude-haiku-4-5-20251001-v1:0")
		expect(overrides.planModeApiModelId).to.equal("us.anthropic.claude-opus-4-6-v1")
	})

	it("works with Nova model IDs (no prefix required)", () => {
		process.env.AWS_REGION = "us-east-1"
		process.env.AWS_BEDROCK_MODEL = "amazon.nova-pro-v1:0"
		const overrides = getSettingsOverridesFromEnv()
		expect(overrides.actModeApiModelId).to.equal("amazon.nova-pro-v1:0")
		expect(overrides.planModeApiModelId).to.equal("amazon.nova-pro-v1:0")
	})

	it("works with Qwen model IDs (no prefix required)", () => {
		process.env.AWS_REGION = "us-east-1"
		process.env.AWS_BEDROCK_MODEL = "qwen.qwen3-coder-480b-a35b-v1:0"
		const overrides = getSettingsOverridesFromEnv()
		expect(overrides.actModeApiModelId).to.equal("qwen.qwen3-coder-480b-a35b-v1:0")
		expect(overrides.planModeApiModelId).to.equal("qwen.qwen3-coder-480b-a35b-v1:0")
	})
})

describe("getProviderFromEnv - Bedrock detection", () => {
	it("returns bedrock when AWS_REGION is set", () => {
		process.env.AWS_REGION = "us-east-1"
		expect(getProviderFromEnv()).to.equal("bedrock")
	})

	it("returns bedrock when AWS_ACCESS_KEY_ID is set", () => {
		process.env.AWS_ACCESS_KEY_ID = "AKIATEST"
		expect(getProviderFromEnv()).to.equal("bedrock")
	})

	it("does not return bedrock when only AWS_SECRET_ACCESS_KEY is set", () => {
		delete process.env.AWS_REGION
		delete process.env.AWS_ACCESS_KEY_ID
		process.env.AWS_SECRET_ACCESS_KEY = "secret"
		expect(getProviderFromEnv()).to.not.equal("bedrock")
	})

	it("prefers anthropic over bedrock when ANTHROPIC_API_KEY also set", () => {
		process.env.ANTHROPIC_API_KEY = "sk-ant-test"
		process.env.AWS_REGION = "us-east-1"
		expect(getProviderFromEnv()).to.equal("anthropic")
	})
})
