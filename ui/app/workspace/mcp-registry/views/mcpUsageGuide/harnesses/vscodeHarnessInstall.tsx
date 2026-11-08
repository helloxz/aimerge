import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";
import { buildVSCodeConfig, buildVSCodeDeeplink } from "../commandBuilders";
import { HarnessCommandSection } from "../harnessCommandSection";
import type { HarnessInstallProps, VSCodeConfigScope } from "../types";
import { getRegistrationLabel } from "../utils";

export function VSCodeHarnessInstall({
	canGenerateCommand,
	clientConfig,
	platform,
	selectedServers,
	serverScope,
	virtualKey,
}: HarnessInstallProps) {
	const [configScope, setConfigScope] = useState<VSCodeConfigScope>("workspace");

	const serverArgs = useMemo(
		() => ({
			clientConfig,
			selectedServers: serverScope === "selected" ? selectedServers : undefined,
			virtualKey: virtualKey!,
		}),
		[clientConfig, selectedServers, serverScope, virtualKey],
	);

	const config = useMemo(() => {
		if (!virtualKey) return "";
		return buildVSCodeConfig(serverArgs);
	}, [serverArgs, virtualKey]);

	const deeplink = useMemo(() => {
		if (!virtualKey) return "";
		return buildVSCodeDeeplink(serverArgs);
	}, [serverArgs, virtualKey]);

	const userConfigPath = {
		linux: "~/.config/Code/User/mcp.json",
		macos: "~/Library/Application Support/Code/User/mcp.json",
		windows: "%APPDATA%/Code/User/mcp.json",
	}[platform];
	const configPath = configScope === "workspace" ? ".vscode/mcp.json" : userConfigPath;

	return (
		<HarnessCommandSection
			canCopyCommand={canGenerateCommand}
			command={config}
			controls={
				<Select value={configScope} onValueChange={(value) => setConfigScope(value as VSCodeConfigScope)}>
					<SelectTrigger className="w-32" data-testid="mcp-usage-guide-vscode-config-scope" size="sm">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="workspace">工作区</SelectItem>
						<SelectItem value="user">用户</SelectItem>
					</SelectContent>
				</Select>
			}
			copySuccessMessage="配置已复制"
			deeplink={deeplink}
			emptyMessage={virtualKey ? "请选择服务器，或使用网关根路径。" : "请选择虚拟密钥以生成配置。"}
			harnessName="VS Code"
			label="配置"
			logoSrc="/images/harness/vscode.svg"
			registrationLabel={`${configPath} · ${getRegistrationLabel(serverScope, selectedServers)}`}
		/>
	);
}