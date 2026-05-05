import { HuaweiCloudMaaSHandler } from "./huawei-cloud-maas"
import { pickMode, registerProvider } from "./registry"

registerProvider("huawei-cloud-maas", {
	factory: (options, mode) =>
		new HuaweiCloudMaaSHandler({
			onRetryAttempt: options.onRetryAttempt,
			huaweiCloudMaasApiKey: options.huaweiCloudMaasApiKey,
			huaweiCloudMaasModelId: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeHuaweiCloudMaasModelId",
				"actModeHuaweiCloudMaasModelId",
			),
			huaweiCloudMaasModelInfo: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeHuaweiCloudMaasModelInfo",
				"actModeHuaweiCloudMaasModelInfo",
			),
		}),
})
