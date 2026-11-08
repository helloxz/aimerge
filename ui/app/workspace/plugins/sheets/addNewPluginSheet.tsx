import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getErrorMessage, useCreatePluginMutation, useUpdatePluginMutation } from "@/lib/store";
import { Plugin } from "@/lib/types/plugins";
import { RbacOperation, RbacResource, useRbac } from "@enterprise/lib";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { PluginFormFragment } from "../fragments/pluginFormFragments";

const pluginFormSchema = z.object({
	name: z
		.string()
		.min(1, "插件名称为必填项")
		.regex(/^[A-Za-z0-9-_]+$/, "插件名称只能包含字母、数字、连字符和下划线"),
	path: z
		.string()
		.min(1, "插件路径/URL 为必填项")
		.refine(
			(val) => {
				// Accept either absolute file paths or HTTP/HTTPS URLs
				return val.startsWith("/") || val.startsWith("http://") || val.startsWith("https://");
			},
			{
				message: "请输入有效的绝对文件路径（以 / 开头）或 HTTP/HTTPS URL",
			},
		),
	hasConfig: z.boolean(),
	config: z
		.string()
		.optional()
		.refine(
			(val) => {
				if (!val) return true;
				try {
					JSON.parse(val);
					return true;
				} catch {
					return false;
				}
			},
			{
				message: "配置必须是合法的 JSON",
			},
		),
});

type PluginFormData = z.infer<typeof pluginFormSchema>;

interface AddNewPluginSheetProps {
	open: boolean;
	onClose: () => void;
	onCreate?: (pluginName: string) => void;
	plugin?: Plugin | null;
}

export default function AddNewPluginSheet({ open, onClose, onCreate, plugin }: AddNewPluginSheetProps) {
	const hasCreatePluginAccess = useRbac(RbacResource.Plugins, RbacOperation.Create);
	const hasUpdatePluginAccess = useRbac(RbacResource.Plugins, RbacOperation.Update);
	const [createPlugin, { isLoading: isCreating }] = useCreatePluginMutation();
	const [updatePlugin, { isLoading: isUpdating }] = useUpdatePluginMutation();

	const isEditMode = !!plugin;
	const isLoading = isCreating || isUpdating;

	const form = useForm<PluginFormData>({
		resolver: zodResolver(pluginFormSchema),
		mode: "onChange",
		defaultValues: {
			name: "",
			path: "",
			hasConfig: false,
			config: undefined,
		},
	});

	// Load plugin data when editing
	useEffect(() => {
		if (plugin) {
			const hasConfig = plugin.config && Object.keys(plugin.config).length > 0;
			form.reset({
				name: plugin.name,
				path: plugin.path || "",
				hasConfig,
				config: hasConfig ? JSON.stringify(plugin.config, null, 2) : undefined,
			});
		} else {
			form.reset({
				name: "",
				path: "",
				hasConfig: false,
				config: undefined,
			});
		}
	}, [plugin, form]);

	const onSubmit = async (data: PluginFormData) => {
		try {
			let parsedConfig = {};

			if (data.hasConfig && data.config) {
				try {
					parsedConfig = JSON.parse(data.config);
				} catch {
					toast.error("JSON 配置无效");
					return;
				}
			}

			if (isEditMode && plugin) {
				// Update existing plugin
				await updatePlugin({
					name: plugin.name,
					data: {
						enabled: plugin.enabled,
						config: parsedConfig,
					},
				}).unwrap();
				toast.success("插件已更新");
			} else {
				// Create new plugin
				await createPlugin({
					name: data.name,
					path: data.path,
					enabled: true,
					config: parsedConfig,
				}).unwrap();
				toast.success("插件已创建");
				// Notify parent with the config name to select it
				onCreate?.(data.name);
			}

			form.reset();
			onClose();
		} catch (error) {
			toast.error(getErrorMessage(error));
		}
	};

	const handleClose = () => {
		form.reset();
		onClose();
	};

	const disableAction = isEditMode ? !hasUpdatePluginAccess : !hasCreatePluginAccess;

	return (
		<Sheet open={open} onOpenChange={handleClose}>
			<SheetContent className="flex w-full flex-col overflow-x-hidden pt-4">
				<SheetHeader className="flex flex-col items-start px-8 py-4" headerClassName="mb-0 sticky top-0 bg-card z-10">
					<SheetTitle>{isEditMode ? "更新插件" : "安装新插件"}</SheetTitle>
					<SheetDescription>
						{isEditMode
							? "更新插件配置。注意：插件名称和路径不可更改。"
							: "通过提供名称、路径/URL 以及可选配置来添加自定义插件。"}
					</SheetDescription>
				</SheetHeader>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="flex h-full flex-col gap-6">
						<div className="flex-1 space-y-4 px-8">
							<PluginFormFragment form={form} isEditMode={isEditMode} />
						</div>

						<div className="bg-card sticky bottom-0 flex justify-end gap-2 border-t px-8 py-4">
							<Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
								取消
							</Button>
							<Button type="submit" disabled={isLoading || !form.formState.isValid || disableAction} isLoading={isLoading}>
								{isEditMode ? "更新插件" : "安装插件"}
							</Button>
						</div>
					</form>
				</Form>
			</SheetContent>
		</Sheet>
	);
}