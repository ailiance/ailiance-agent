import { DifyHandler } from "./dify"
import { registerProvider } from "./registry"

registerProvider("dify", {
	factory: (options, _mode) =>
		new DifyHandler({
			difyApiKey: options.difyApiKey,
			difyBaseUrl: options.difyBaseUrl,
		}),
})
