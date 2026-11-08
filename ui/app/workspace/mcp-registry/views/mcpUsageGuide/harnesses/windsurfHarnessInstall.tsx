import { useMemo } from "react";
import { buildWindsurfConfig } from "../commandBuilders";
import { HarnessCommandSection } from "../harnessCommandSection";
import type { HarnessInstallProps } from "../types";
import { getRegistrationLabel, getUserHomePrefix } from "../utils";

export function WindsurfHarnessInstall({
	canGenerateCommand,
	clientConfig,
	platform,
	selectedServers,
	serverScope,
	virtualKey,
}: HarnessInstallProps) {
	const configPath = `${getUserHomePrefix(platform)}/.codeium/windsurf/mcp_config.json`;

	const config = useMemo(() => {
		if (!virtualKey) return "";
		return buildWindsurfConfig({
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
			harnessName="Windsurf (Devin)"
			label="配置"
			logoSrc="/images/harness/windsurf.svg"
			registrationLabel={`${configPath} · ${getRegistrationLabel(serverScope, selectedServers)}`}
		/>
	);
}