import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { IS_ENTERPRISE } from "@/lib/constants/config";
import { getErrorMessage, useGetCoreConfigQuery, useUpdateProxyConfigMutation } from "@/lib/store";
import { DefaultGlobalProxyConfig, GlobalProxyConfig } from "@/lib/types/config";
import { globalProxyConfigSchema } from "@/lib/types/schemas";
import { cn } from "@/lib/utils";
import { RbacOperation, RbacResource, useRbac } from "@enterprise/lib";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Info } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

export default function ProxyView() {
	const hasSettingsUpdateAccess = useRbac(RbacResource.Settings, RbacOperation.Update);
	const { data: bifrostConfig } = useGetCoreConfigQuery({ fromDB: true });
	const proxyConfig = bifrostConfig?.proxy_config;
	const [updateProxyConfig, { isLoading }] = useUpdateProxyConfigMutation();

	const form = useForm<GlobalProxyConfig>({
		resolver: zodResolver(globalProxyConfigSchema),
		mode: "onChange",
		reValidateMode: "onChange",
		defaultValues: DefaultGlobalProxyConfig,
	});

	useEffect(() => {
		if (proxyConfig) {
			form.reset({
				...DefaultGlobalProxyConfig,
				...proxyConfig,
			});
		}
	}, [proxyConfig, form]);

	const watchedEnabled = form.watch("enabled");
	const watchedType = form.watch("type");

	const onSubmit = async (data: GlobalProxyConfig) => {
		try {
			await updateProxyConfig(data).unwrap();
			toast.success("代理配置已更新。");
		} catch (error) {
			toast.error(getErrorMessage(error));
		}
	};

	const isTypeUnsupported = watchedType === "socks5" || watchedType === "tcp";

	return (
		<div className="mx-auto w-full max-w-4xl space-y-4">
			<Form {...form}>
				<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
					<div>
						<h2 className="text-lg font-semibold tracking-tight">代理设置</h2>
						<p className="text-muted-foreground text-sm">配置出站请求使用的全局代理。</p>
					</div>

					<fieldset disabled={!hasSettingsUpdateAccess} className="space-y-4">
						{/* Enable Proxy */}
						<div className="flex items-center justify-between space-x-2 rounded-sm border p-4">
							<div className="space-y-0.5">
								<FormLabel className="text-sm font-medium">启用代理</FormLabel>
								<p className="text-muted-foreground text-sm">为出站 HTTP 请求启用全局代理。</p>
							</div>
							<FormField
								control={form.control}
								name="enabled"
								render={({ field }) => (
									<FormItem>
										<FormControl>
											<Switch checked={field.value} onCheckedChange={field.onChange} />
										</FormControl>
									</FormItem>
								)}
							/>
						</div>

						{/* Proxy Configuration Section */}
						<div className={cn("space-y-4 rounded-sm border p-4 transition-opacity", !watchedEnabled && "pointer-events-none opacity-50")}>
							<h3 className="text-lg font-medium">代理配置</h3>

							{/* Proxy Type */}
							<FormField
								control={form.control}
								name="type"
								render={({ field }) => (
									<FormItem>
										<FormLabel>代理类型</FormLabel>
										<Select onValueChange={field.onChange} value={field.value} disabled={!watchedEnabled}>
											<FormControl>
												<SelectTrigger className="w-48">
													<SelectValue placeholder="选择类型" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value="http">HTTP / HTTPS</SelectItem>
												<SelectItem value="socks5" disabled>
													SOCKS5{" "}
													<Badge variant="outline" className="ml-2 text-xs">
														即将推出
													</Badge>
												</SelectItem>
												<SelectItem value="tcp" disabled>
													TCP{" "}
													<Badge variant="outline" className="ml-2 text-xs">
														即将推出
													</Badge>
												</SelectItem>
											</SelectContent>
										</Select>
										<FormDescription>选择代理协议类型。目前仅支持 HTTP 代理。</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							{isTypeUnsupported && watchedEnabled && (
								<Alert variant="destructive">
									<AlertTriangle className="h-4 w-4" />
									<AlertDescription>暂不支持 {watchedType.toUpperCase()} 代理，请使用 HTTP 代理。</AlertDescription>
								</Alert>
							)}

							{/* Proxy URL */}
							<FormField
								control={form.control}
								name="url"
								render={({ field }) => (
									<FormItem>
										<FormLabel>代理 URL</FormLabel>
										<FormControl>
											<Input placeholder="http://proxy.example.com:8080" disabled={!watchedEnabled} {...field} />
										</FormControl>
										<FormDescription>代理服务器的完整 URL，包含协议和端口。</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							{/* Authentication Section */}
							<div className="bg-muted/20 space-y-4 rounded-sm border p-4">
								<h4 className="text-sm font-medium">身份验证（可选）</h4>
								<div className="grid grid-cols-2 gap-4">
									<FormField
										control={form.control}
										name="username"
										render={({ field }) => (
											<FormItem>
												<FormLabel>用户名</FormLabel>
												<FormControl>
													<Input placeholder="代理用户名" disabled={!watchedEnabled} {...field} value={field.value || ""} />
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="password"
										render={({ field }) => (
											<FormItem>
												<FormLabel>密码</FormLabel>
												<FormControl>
													<Input
														type="password"
														placeholder="代理密码"
														disabled={!watchedEnabled}
														{...field}
														value={field.value || ""}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
							</div>

							{/* Advanced Settings */}
							<div className="bg-muted/20 space-y-4 rounded-sm border p-4">
								<h4 className="text-sm font-medium">高级设置</h4>

								{/* No Proxy */}
								<FormField
									control={form.control}
									name="no_proxy"
									render={({ field }) => (
										<FormItem>
											<FormLabel>不使用代理的主机</FormLabel>
											<FormControl>
												<Textarea
													placeholder="localhost, 127.0.0.1, .internal.example.com"
													className="h-20"
													disabled={!watchedEnabled}
													{...field}
													value={field.value || ""}
												/>
											</FormControl>
											<FormDescription>绕过代理的主机列表，以逗号分隔。</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>

								{/* Timeout */}
								<FormField
									control={form.control}
									name="timeout"
									render={({ field }) => (
										<FormItem>
											<FormLabel>连接超时（秒）</FormLabel>
											<FormControl>
												<Input
													type="number"
													min={0}
													max={300}
													placeholder="30"
													className="w-32"
													disabled={!watchedEnabled}
													{...field}
													value={field.value ?? ""}
													onChange={(e) => field.onChange(e.target.value !== "" ? parseInt(e.target.value, 10) : undefined)}
												/>
											</FormControl>
											<FormDescription>
												建立代理连接的超时时间。0 表示不超时，默认为 60 秒。
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>

								{/* CA Certificate */}
								<FormField
									control={form.control}
									name="ca_cert_pem"
									render={({ field }) => (
										<FormItem>
											<FormLabel>CA 证书（PEM）（可选）</FormLabel>
											<FormControl>
												<Textarea
													placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
													className="font-mono text-xs"
													rows={6}
													disabled={!watchedEnabled}
													{...field}
													value={field.value || ""}
												/>
											</FormControl>
											<FormDescription>
												经过 SSL 拦截代理建立 TLS 连接时信任的 PEM 编码 CA 证书。
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>

								{/* Skip TLS Verify */}
								<div className="flex items-center justify-between">
									<div className="space-y-0.5">
										<FormLabel className="text-sm font-medium">跳过 TLS 验证</FormLabel>
										<p className="text-muted-foreground text-sm">
											对 HTTPS 代理禁用 TLS 证书验证。不建议在生产环境使用。
										</p>
									</div>
									<FormField
										control={form.control}
										name="skip_tls_verify"
										render={({ field }) => (
											<FormItem>
												<FormControl>
													<Switch checked={field.value} onCheckedChange={field.onChange} disabled={!watchedEnabled} />
												</FormControl>
											</FormItem>
										)}
									/>
								</div>
							</div>
						</div>

						{/* Entity Enablement Section */}
						<div className={cn("space-y-4 rounded-sm border p-4 transition-opacity", !watchedEnabled && "pointer-events-none opacity-50")}>
							<div className="space-y-1">
								<h3 className="text-lg font-medium">启用代理的范围</h3>
								<p className="text-muted-foreground text-sm">选择哪些组件在发出请求时使用代理。</p>
							</div>

							{/* SCIM - Enterprise only */}
							{IS_ENTERPRISE && (
								<div className="flex items-center justify-between rounded-sm border p-4">
									<div className="space-y-0.5">
										<div className="flex items-center gap-2">
											<FormLabel className="text-sm font-medium">SCIM</FormLabel>
											<Badge variant="secondary">企业版</Badge>
										</div>
										<p className="text-muted-foreground text-sm">使用代理发送 SCIM 目录同步请求。</p>
									</div>
									<FormField
										control={form.control}
										name="enable_for_scim"
										render={({ field }) => (
											<FormItem>
												<FormControl>
													<Switch checked={field.value} onCheckedChange={field.onChange} disabled={!watchedEnabled} />
												</FormControl>
											</FormItem>
										)}
									/>
								</div>
							)}

							{/* Inference - Coming Soon */}
							<div className="flex items-center justify-between rounded-sm border p-4 opacity-60">
								<div className="space-y-0.5">
									<div className="flex items-center gap-2">
										<FormLabel className="text-sm font-medium">推理</FormLabel>
										<Badge variant="outline">即将推出</Badge>
									</div>
									<p className="text-muted-foreground text-sm">使用代理向模型提供商发送 LLM 推理请求。</p>
								</div>
								<Switch disabled checked={false} />
							</div>

							{/* API - Coming Soon */}
							<div className="flex items-center justify-between rounded-sm border p-4 opacity-60">
								<div className="space-y-0.5">
									<div className="flex items-center gap-2">
										<FormLabel className="text-sm font-medium">API</FormLabel>
										<Badge variant="outline">即将推出</Badge>
									</div>
									<p className="text-muted-foreground text-sm">使用代理发送外部 API 调用和 Webhook 请求。</p>
								</div>
								<Switch disabled checked={false} />
							</div>

							{!IS_ENTERPRISE && (
								<Alert>
									<Info className="h-4 w-4" />
									<AlertDescription>SCIM 代理支持仅在 Bifrost 企业版中提供。</AlertDescription>
								</Alert>
							)}
						</div>
					</fieldset>
					<div className="flex justify-end pt-2">
						<Tooltip>
							<TooltipTrigger asChild>
								<span tabIndex={!hasSettingsUpdateAccess ? 0 : undefined}>
									<Button
										type="submit"
										disabled={!form.formState.isDirty || !form.formState.isValid || isLoading || !hasSettingsUpdateAccess}
									>
										{isLoading ? "保存中…" : "保存更改"}
									</Button>
								</span>
							</TooltipTrigger>
							{!hasSettingsUpdateAccess && <TooltipContent>你无权更新设置</TooltipContent>}
						</Tooltip>
					</div>
				</form>
			</Form>
		</div>
	);
}