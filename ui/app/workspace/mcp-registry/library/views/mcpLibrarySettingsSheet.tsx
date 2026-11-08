import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getErrorMessage, useForceSyncMCPLibraryMutation, useGetCoreConfigQuery, useUpdateCoreConfigMutation } from "@/lib/store";
import { RbacOperation, RbacResource, useRbac } from "@enterprise/lib";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const mcpLibrarySettingsSchema = z.object({
	mcp_library_url: z
		.string()
		.trim()
		.refine(
			(value) => value === "" || value.startsWith("http://") || value.startsWith("https://"),
			"URL 必须以 http:// 或 https:// 开头",
		),
	mcp_library_sync_interval_hours: z
		.number({ message: "同步间隔为必填项" })
		.min(1, "同步间隔至少为 1 小时")
		.max(8760, "同步间隔不能超过 8760 小时（1 年）"),
});

type MCPLibrarySettingsFormData = z.infer<typeof mcpLibrarySettingsSchema>;

interface MCPLibrarySettingsSheetProps {
	open: boolean;
	onClose: () => void;
}

export function MCPLibrarySettingsSheet({ open, onClose }: MCPLibrarySettingsSheetProps) {
	const hasSettingsUpdateAccess = useRbac(RbacResource.Settings, RbacOperation.Update);
	const { data: bifrostConfig, isLoading: isConfigLoading, isError: isConfigError } = useGetCoreConfigQuery({ fromDB: true });
	const config = bifrostConfig?.framework_config;
	const [updateCoreConfig, { isLoading }] = useUpdateCoreConfigMutation();
	const [forceSyncMCPLibrary, { isLoading: isForceSyncing }] = useForceSyncMCPLibraryMutation();

	const {
		register,
		handleSubmit,
		formState: { errors, isDirty },
		reset,
		watch,
	} = useForm<MCPLibrarySettingsFormData>({
		resolver: zodResolver(mcpLibrarySettingsSchema),
		defaultValues: {
			mcp_library_url: "",
			mcp_library_sync_interval_hours: 24,
		},
	});

	const formValues = watch();

	useEffect(() => {
		if (!open || !config) return;
		reset({
			mcp_library_url: config.mcp_library_url || "",
			mcp_library_sync_interval_hours: Math.round((config.mcp_library_sync_interval || 86400) / 3600),
		});
	}, [config, open, reset]);

	const hasChanges = useMemo(() => {
		if (!config || !isDirty) return false;
		const serverUrl = config.mcp_library_url || "";
		const serverInterval = Math.round((config.mcp_library_sync_interval || 86400) / 3600);
		return formValues.mcp_library_url !== serverUrl || formValues.mcp_library_sync_interval_hours !== serverInterval;
	}, [config, formValues, isDirty]);

	const onSubmit = async (data: MCPLibrarySettingsFormData) => {
		if (!bifrostConfig) {
			toast.error("无法加载当前设置，请重试。");
			return;
		}
		try {
			await updateCoreConfig({
				...bifrostConfig,
				framework_config: {
					...bifrostConfig.framework_config,
					mcp_library_url: data.mcp_library_url,
					mcp_library_sync_interval: data.mcp_library_sync_interval_hours * 3600,
				},
			}).unwrap();
			toast.success("MCP 服务器库设置已更新。");
			reset(data);
		} catch (error) {
			toast.error(getErrorMessage(error));
		}
	};

	const handleForceSync = async () => {
		try {
			await forceSyncMCPLibrary().unwrap();
			toast.success("已触发 MCP 服务器库同步。");
		} catch (error) {
			toast.error(getErrorMessage(error));
		}
	};

	return (
		<Sheet open={open} onOpenChange={(sheetOpen) => !sheetOpen && onClose()}>
			<SheetContent className="flex w-full flex-col overflow-x-hidden px-0">
				<SheetHeader className="flex flex-col items-start px-7 pt-8">
					<SheetTitle>MCP 服务器库设置</SheetTitle>
					<SheetDescription>配置 MCP 服务器目录的同步源与同步间隔。</SheetDescription>
				</SheetHeader>

				<form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
					<div className="flex-1 space-y-4 overflow-y-auto px-8">
						<div className="space-y-2 rounded-sm border p-4">
							<div className="space-y-0.5">
								<Label htmlFor="mcp-library-url">服务器库同步 URL</Label>
								<p className="text-muted-foreground text-sm">
									自定义 MCP 服务器目录的 URL。留空则使用 Bifrost 默认目录。
								</p>
							</div>
							<Input
								id="mcp-library-url"
								type="text"
								placeholder="https://getbifrost.ai/mcp-library"
								data-testid="mcp-library-url-input"
								{...register("mcp_library_url")}
								className={errors.mcp_library_url ? "border-destructive" : ""}
							/>
							{errors.mcp_library_url && <p className="text-destructive text-sm">{errors.mcp_library_url.message}</p>}
						</div>

						<div className="space-y-2 rounded-sm border p-4">
							<div className="space-y-0.5">
								<Label htmlFor="mcp-library-sync-interval">同步间隔（小时）</Label>
								<p className="text-muted-foreground text-sm">从源 URL 同步 MCP 服务器目录的频率。</p>
							</div>
							<Input
								id="mcp-library-sync-interval"
								type="number"
								data-testid="mcp-library-sync-interval-input"
								className={errors.mcp_library_sync_interval_hours ? "border-destructive" : ""}
								{...register("mcp_library_sync_interval_hours", { valueAsNumber: true })}
							/>
							{errors.mcp_library_sync_interval_hours && (
								<p className="text-destructive text-sm">{errors.mcp_library_sync_interval_hours.message}</p>
							)}
						</div>
					</div>

					<div className="dark:bg-card border-border border-t bg-white px-8 py-4">
						<div className="flex justify-end gap-2">
							<Button
								variant="outline"
								type="button"
								onClick={handleForceSync}
								disabled={isForceSyncing || !hasSettingsUpdateAccess}
								data-testid="mcp-library-force-sync-btn"
							>
								{isForceSyncing ? "正在同步..." : "立即强制同步"}
							</Button>
							<Button type="button" variant="outline" onClick={onClose} disabled={isLoading} data-testid="mcp-library-settings-cancel-btn">
								取消
							</Button>
							<Button
								type="submit"
								disabled={!hasChanges || isLoading || isConfigLoading || isConfigError || !hasSettingsUpdateAccess}
								data-testid="mcp-library-settings-save-btn"
							>
								{isLoading ? "正在保存..." : "保存更改"}
							</Button>
						</div>
					</div>
				</form>
			</SheetContent>
		</Sheet>
	);
}