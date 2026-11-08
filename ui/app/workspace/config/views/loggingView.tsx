import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage, useGetCoreConfigQuery, useUpdateCoreConfigMutation } from "@/lib/store";
import { CoreConfig, DefaultCoreConfig } from "@/lib/types/config";
import { parseArrayFromText } from "@/lib/utils/array";
import { RbacOperation, RbacResource, useRbac } from "@enterprise/lib";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export default function LoggingView() {
	const hasSettingsUpdateAccess = useRbac(RbacResource.Settings, RbacOperation.Update);
	const { data: bifrostConfig } = useGetCoreConfigQuery({ fromDB: true });
	const config = bifrostConfig?.client_config;
	const [updateCoreConfig, { isLoading }] = useUpdateCoreConfigMutation();
	const [localConfig, setLocalConfig] = useState<CoreConfig>(DefaultCoreConfig);
	const [needsRestart, setNeedsRestart] = useState<boolean>(false);
	const [loggingHeadersText, setLoggingHeadersText] = useState<string>("");

	useEffect(() => {
		if (config) {
			setLocalConfig(config);
			setLoggingHeadersText(config.logging_headers?.join(", ") || "");
		}
	}, [config]);

	const hasChanges = useMemo(() => {
		if (!config) return false;
		return (
			localConfig.enable_logging !== config.enable_logging ||
			localConfig.disable_content_logging !== config.disable_content_logging ||
			localConfig.retain_content_in_object_storage !== config.retain_content_in_object_storage ||
			localConfig.allow_per_request_content_storage_override !== config.allow_per_request_content_storage_override ||
			localConfig.allow_per_request_raw_override !== config.allow_per_request_raw_override ||
			localConfig.log_retention_days !== config.log_retention_days ||
			localConfig.hide_deleted_virtual_keys_in_filters !== config.hide_deleted_virtual_keys_in_filters ||
			JSON.stringify(localConfig.logging_headers || []) !== JSON.stringify(config.logging_headers || [])
		);
	}, [config, localConfig]);

	const handleConfigChange = useCallback((field: keyof CoreConfig, value: boolean | number | string[]) => {
		setLocalConfig((prev) => ({ ...prev, [field]: value }));
		// Only enable_logging requires a restart (logging plugin is registered/skipped at startup).
		// disable_content_logging is read live via pointer by the logging plugin and applies on the next request.
		if (field === "enable_logging") {
			setNeedsRestart(true);
		}
	}, []);

	const handleLoggingHeadersChange = useCallback((value: string) => {
		setLoggingHeadersText(value);
		setLocalConfig((prev) => ({ ...prev, logging_headers: parseArrayFromText(value) }));
	}, []);

	const handleSave = useCallback(async () => {
		if (!bifrostConfig) {
			toast.error("配置尚未加载");
			return;
		}

		// Validate log retention days
		if (localConfig.log_retention_days < 1) {
			toast.error("日志保留天数至少为 1 天");
			return;
		}

		try {
			await updateCoreConfig({ ...bifrostConfig, client_config: localConfig }).unwrap();
			toast.success("日志配置已更新。");
		} catch (error) {
			toast.error(getErrorMessage(error));
		}
	}, [bifrostConfig, localConfig, updateCoreConfig]);

	return (
		<div className="mx-auto w-full max-w-4xl space-y-4 py-6">
			<div>
				<h2 className="text-lg font-semibold tracking-tight">日志设置</h2>
				<p className="text-muted-foreground text-sm">配置请求与响应的日志记录设置。</p>
			</div>

			<div className="space-y-4">
				{/* Enable Logs */}
				<div>
					<div className="flex items-center justify-between space-x-2 rounded-sm border p-4">
						<div className="space-y-0.5">
							<label htmlFor="enable-logging" className="text-sm font-medium">
								启用日志
							</label>
							<p className="text-muted-foreground text-sm">
								将请求与响应记录到 SQL 数据库。这会额外占用约 40-60MB 系统内存。
								{!bifrostConfig?.is_logs_connected && (
									<span className="text-destructive font-medium"> 需先在 config.json 中配置并启用日志存储。</span>
								)}
							</p>
						</div>
						<Switch
							id="enable-logging"
							size="md"
							checked={localConfig.enable_logging && bifrostConfig?.is_logs_connected}
							disabled={!bifrostConfig?.is_logs_connected}
							onCheckedChange={(checked) => {
								if (bifrostConfig?.is_logs_connected) {
									handleConfigChange("enable_logging", checked);
								}
							}}
						/>
					</div>
					{needsRestart && <RestartWarning />}
				</div>

				{/* Disable Content Logging - Only show when logging is enabled */}
				{localConfig.enable_logging && bifrostConfig?.is_logs_connected && (
					<div>
						<div className="flex items-center justify-between space-x-2 rounded-sm border p-4">
							<div className="space-y-0.5">
								<label htmlFor="disable-content-logging" className="text-sm font-medium">
									禁用内容日志
								</label>
								<p className="text-muted-foreground text-sm">
									启用后仅记录用量元数据（延迟、成本、Token 数、状态、路由 ID 等）。请求/响应内容（消息、参数、工具调用以及提供商的原始字节）会从日志记录中丢弃，即使{" "}
									<code className="text-xs">store_raw_request_response</code> 已开启。通过{" "}
									<code className="text-xs">send_back_raw_*</code> 回传给调用方的原始字节不受影响。
								</p>
							</div>
							<Switch
								id="disable-content-logging"
								size="md"
								checked={localConfig.disable_content_logging}
								onCheckedChange={(checked) => handleConfigChange("disable_content_logging", checked)}
							/>
						</div>
					</div>
				)}

				{/* Retain Content in Object Storage - Only show when logging is enabled */}
				{localConfig.enable_logging && bifrostConfig?.is_logs_connected && (
					<div className="flex items-center justify-between space-x-2 rounded-sm border p-4">
						<div className="space-y-0.5">
							<label htmlFor="retain-content-in-object-storage" className="text-sm font-medium">
								在对象存储中保留内容
							</label>
							<p className="text-muted-foreground text-sm">
								启用后，即使请求已关闭内容日志（通过上方的全局设置或{" "}
								<code className="text-xs">x-bf-disable-content-logging</code> 请求头），其完整内容仍会转存到对象存储，但这些内容不会显示在日志中：数据库行仍然只保留元数据，UI/API 也不会回读载荷。此时只有直接访问存储桶才能读取内容。关闭后，这类请求的内容会被完全丢弃（当前行为）。
								{!bifrostConfig?.is_object_storage_connected && (
									<span className="text-destructive font-medium">
										{" "}
										需在 config.json 的日志存储上配置对象存储。
									</span>
								)}
							</p>
						</div>
						<Switch
							id="retain-content-in-object-storage"
							data-testid="workspace-retain-content-in-object-storage-switch"
							size="md"
							checked={localConfig.retain_content_in_object_storage && bifrostConfig?.is_object_storage_connected === true}
							disabled={!bifrostConfig?.is_object_storage_connected}
							onCheckedChange={(checked) => {
								if (bifrostConfig?.is_object_storage_connected) {
									handleConfigChange("retain_content_in_object_storage", checked);
								}
							}}
						/>
					</div>
				)}

				{/* Allow Per-Request Content Storage Override - Only show when logging is enabled */}
				{localConfig.enable_logging && bifrostConfig?.is_logs_connected && (
					<div className="flex items-center justify-between space-x-2 rounded-sm border p-4">
						<div className="space-y-0.5">
							<label htmlFor="allow-per-request-content-storage-override" className="text-sm font-medium">
								允许按请求覆盖内容存储设置
							</label>
							<p className="text-muted-foreground text-sm">
								启用后，单个请求可通过{" "}
								<code className="text-xs">x-bf-disable-content-logging</code> 请求头或上下文键覆盖全局内容日志设置，并可通过 <code className="text-xs">x-bf-store-raw-request-response</code> 请求头选择在日志中持久化提供商的原始字节。原始字节存储要求内容日志已开启（全局开启，或在同一请求中通过{" "}
								<code className="text-xs">x-bf-disable-content-logging: false</code> 开启）。若内容日志已关闭，即使设置了 <code className="text-xs">x-bf-store-raw-request-response: true</code>，原始字节也会从日志记录中丢弃。此选项不影响向调用方回传原始字节，详见“允许按请求覆盖原始数据”。
							</p>
						</div>
						<Switch
							id="allow-per-request-content-storage-override"
							data-testid="workspace-content-storage-override-switch"
							size="md"
							checked={localConfig.allow_per_request_content_storage_override}
							onCheckedChange={(checked) => handleConfigChange("allow_per_request_content_storage_override", checked)}
						/>
					</div>
				)}

				{/* Allow Per-Request Raw Override */}
				<div className="flex items-center justify-between space-x-2 rounded-sm border p-4">
					<div className="space-y-0.5">
						<label htmlFor="allow-per-request-raw-override" className="text-sm font-medium">
							允许按请求覆盖原始数据
						</label>
						<p className="text-muted-foreground text-sm">
							启用后，单个请求可通过{" "}
							<code className="text-xs">x-bf-send-back-raw-request</code> 和 <code className="text-xs">x-bf-send-back-raw-response</code>{" "}
							请求头向调用方回传提供商的原始请求/响应字节。此项不影响日志存储；日志中原始字节的持久化由“允许按请求覆盖内容存储设置”控制。
						</p>
					</div>
					<Switch
						id="allow-per-request-raw-override"
						data-testid="workspace-raw-override-switch"
						size="md"
						checked={localConfig.allow_per_request_raw_override}
						onCheckedChange={(checked) => handleConfigChange("allow_per_request_raw_override", checked)}
					/>
				</div>

				{/* Log Retention Days */}
				{localConfig.enable_logging && bifrostConfig?.is_logs_connected && (
					<div className="flex items-center justify-between space-x-2 rounded-sm border p-4">
						<div className="space-y-0.5">
							<Label htmlFor="log-retention-days" className="text-sm font-medium">
								日志保留天数
							</Label>
							<p className="text-muted-foreground text-sm">
								日志在数据库中的保留天数，最少 1 天。更早的日志会被自动删除。
							</p>
						</div>
						<Input
							id="log-retention-days"
							type="number"
							min="1"
							value={localConfig.log_retention_days}
							onChange={(e) => {
								const value = parseInt(e.target.value) || 1;
								handleConfigChange("log_retention_days", Math.max(1, value));
							}}
							className="w-24"
						/>
					</div>
				)}

				<div className="flex items-center justify-between space-x-2 rounded-sm border p-4">
					<div className="space-y-0.5">
						<label htmlFor="hide-deleted-virtual-keys-in-filters" className="text-sm font-medium">
							在筛选中不显示已删除的虚拟密钥
						</label>
						<p className="text-muted-foreground text-sm">
							启用后，已删除的虚拟密钥不会出现在 LLM 日志、仪表盘和 MCP 日志的虚拟密钥筛选项中。
						</p>
					</div>
					<Switch
						id="hide-deleted-virtual-keys-in-filters"
						data-testid="hide-deleted-virtual-keys-in-filters-switch"
						size="md"
						checked={localConfig.hide_deleted_virtual_keys_in_filters}
						onCheckedChange={(checked) => handleConfigChange("hide_deleted_virtual_keys_in_filters", checked)}
					/>
				</div>

				{/* Logging Headers */}
				{localConfig.enable_logging && bifrostConfig?.is_logs_connected && (
					<div className="space-y-2 rounded-sm border p-4">
						<label htmlFor="logging-headers" className="text-sm font-medium">
							日志请求头
						</label>
						<p className="text-muted-foreground text-sm">
							需要记录到日志元数据中的请求头列表，以逗号分隔。支持精确名称和通配符模式（例如{" "}
							<code className="text-xs">x-custom-*</code> 会捕获所有以该前缀开头的请求头，<code className="text-xs">*</code> 会记录所有请求头；注意 <code className="text-xs">*</code> 会捕获 Authorization 等敏感请求头）。这些值会从传入请求中提取，并存储在日志条目的 metadata 字段中。带有{" "}
							<code className="text-xs">x-bf-lh-</code> 前缀的请求头始终会被自动捕获。
						</p>
						<Textarea
							id="logging-headers"
							data-testid="workspace-logging-headers-textarea"
							className="h-24"
							placeholder="X-Tenant-ID, X-Request-Source, x-custom-*"
							value={loggingHeadersText}
							onChange={(e) => handleLoggingHeadersChange(e.target.value)}
						/>
					</div>
				)}
			</div>

			<div className="flex justify-end pt-2">
				<Button onClick={handleSave} disabled={!hasChanges || isLoading || !hasSettingsUpdateAccess}>
					{isLoading ? "保存中…" : "保存更改"}
				</Button>
			</div>
		</div>
	);
}

const RestartWarning = () => {
	return <div className="text-muted-foreground mt-2 pl-4 text-xs font-semibold">需要重启 Bifrost 以应用更改。</div>;
};