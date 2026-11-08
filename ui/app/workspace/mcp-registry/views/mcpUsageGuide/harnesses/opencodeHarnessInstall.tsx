import { useMemo } from "react";
import { buildOpenCodeConfig } from "../commandBuilders";
import { HarnessCommandSection } from "../harnessCommandSection";
import type { HarnessInstallProps } from "../types";
import { getRegistrationLabel } from "../utils";

export function OpenCodeHarnessInstall({
	canGenerateCommand,
	clientConfig,
	platform,
	selectedServers,
	serverScope,
	virtualKey,
}: HarnessInstallProps) {
	const configPath = {
		linux: "~/.config/opencode/opencode.json",
		macos: "~/.config/opencode/opencode.json",
		windows: "%APPDATA%/opencode/opencode.json",
	}[platform];

	const config = useMemo(() => {
		if (!virtualKey) return "";
		return buildOpenCodeConfig({
			clientConfig,
			selectedServers: serverScope === "selected" ? selectedServers : undefined,
			virtualKey,
		});
	}, [clientConfig, selectedServers, serverScope, virtualKey]);

	return (
		<HarnessCommandSection
			canCopyCommand={canGenerateCommand}
			command={config}
			controls={null}
			copySuccessMessage="配置已复制"
			emptyMessage={virtualKey ? "请选择服务器，或使用网关根路径。" : "请选择虚拟密钥以生成配置。"}
			harnessName="OpenCode"
			label="配置"
			logoSrc="/images/harness/opencode.svg"
			registrationLabel={`${configPath} · ${getRegistrationLabel(serverScope, selectedServers)}`}
		/>
	);
}