import { EmptyRequest } from "@shared/proto/isaac/common"
import * as vscode from "vscode"
import { ExtensionRegistryInfo } from "@/registry"
import { IsaacClient } from "@/shared/isaac"
import { GetHostVersionResponse } from "@/shared/proto/index.host"

export async function getHostVersion(_: EmptyRequest): Promise<GetHostVersionResponse> {
	return {
		platform: vscode.env.appName,
		version: vscode.version,
		isaacType: IsaacClient.VSCode,
		isaacVersion: ExtensionRegistryInfo.version,
	}
}
