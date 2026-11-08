import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModelMultiselect } from "@/components/ui/modelMultiselect";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProviderIconType, RenderProviderIcon } from "@/lib/constants/icons";
import { EmbeddingSupportedProviders, getProviderLabel } from "@/lib/constants/logs";
import {
	getErrorMessage,
	useCreatePluginMutation,
	useGetCoreConfigQuery,
	useGetPluginsQuery,
	useGetProvidersQuery,
	useUpdatePluginMutation,
} from "@/lib/store";
import { CacheConfig, EditorCacheConfig, ModelProvider, ModelProviderName } from "@/lib/types/config";
import { SEMANTIC_CACHE_PLUGIN } from "@/lib/types/plugins";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

// The local cache plugin runs in one of two modes. Direct-only is purely
// hash-based, no embedding provider needed; perfect for exact-replay
// caching. Semantic adds vector similarity on top, requiring an
// embedding-capable provider and the model's real dimension.
type CacheMode = "direct" | "semantic";

// Embedding-capable providers gate the semantic mode. Built-in providers
// are listed in EmbeddingSupportedProviders; custom providers expose
// support via custom_provider_config.allowed_requests.embedding.
const supportsEmbedding = (provider: ModelProvider): boolean => {
	if (provider.custom_provider_config) {
		return provider.custom_provider_config.allowed_requests?.embedding === true;
	}
	return (EmbeddingSupportedProviders as readonly string[]).includes(provider.name);
};

const defaultDirectConfig: EditorCacheConfig = {
	ttl: 300,
	threshold: 0.8,
	dimension: 1,
	conversation_history_threshold: 3,
	exclude_system_prompt: false,
	cache_by_model: true,
	cache_by_provider: true,
};

// Configs we treat as "the user has nothing saved": both API responses
// where every field is the type's zero value and the literal undefined
// look like this.
const isEmptyConfig = (config: Partial<EditorCacheConfig> | undefined): boolean => {
	if (!config) return true;
	// Booleans are deliberate user choices (e.g. cache_by_model: false), not
	// empty markers — only treat numeric/string zero values as empty.
	const isZero = (v: unknown) => v === undefined || v === null || v === 0 || v === "";
	return Object.values(config).every(isZero);
};

const toEditorCacheConfig = (config?: Partial<EditorCacheConfig>): EditorCacheConfig => {
	if (!config || isEmptyConfig(config)) {
		return { ...defaultDirectConfig };
	}
	return { ...defaultDirectConfig, ...config };
};

const inferMode = (config: EditorCacheConfig): CacheMode => {
	if (config.dimension && config.dimension > 1 && config.provider) return "semantic";
	return "direct";
};

// Strip semantic-only fields when persisting a direct-only payload so the
// server validator doesn't reject a stale provider choice.
const buildPayload = (config: EditorCacheConfig, mode: CacheMode): CacheConfig => {
	const base = {
		ttl: config.ttl ?? 0,
		threshold: config.threshold ?? 0,
		conversation_history_threshold: config.conversation_history_threshold,
		exclude_system_prompt: config.exclude_system_prompt,
		cache_by_model: config.cache_by_model,
		cache_by_provider: config.cache_by_provider,
		vector_store_namespace: config.vector_store_namespace?.trim() || undefined,
		default_cache_key: config.default_cache_key?.trim() || undefined,
	};
	if (mode === "direct") {
		return { ...base, dimension: 1 } as CacheConfig;
	}
	return {
		...base,
		provider: config.provider as ModelProviderName,
		embedding_model: config.embedding_model ?? "",
		dimension: config.dimension ?? 0,
	} as CacheConfig;
};

const validateForSave = (config: EditorCacheConfig, mode: CacheMode): string | null => {
	if (mode === "semantic") {
		if (!config.provider) return "请为语义模式选择嵌入提供商，或切换到仅直接匹配。";
		if (!config.embedding_model?.trim()) return "请为语义模式选择嵌入模型。";
		if (!config.dimension || config.dimension <= 1) {
			return "语义模式需要嵌入模型的真实维度（必须大于 1）。";
		}
	}
	if (config.ttl !== undefined && config.ttl < 0) return "TTL 不能为负数。";
	if (config.threshold !== undefined && (config.threshold < 0 || config.threshold > 1)) {
		return "相似度阈值必须在 0 到 1 之间。";
	}
	if (
		config.conversation_history_threshold !== undefined &&
		(config.conversation_history_threshold < 1 || config.conversation_history_threshold > 50)
	) {
		return "会话历史阈值必须在 1 到 50 之间。";
	}
	return null;
};

export default function CachingView() {
	const { data: bifrostConfig, isLoading: configLoading, error: configError } = useGetCoreConfigQuery({ fromDB: true });
	const isVectorStoreEnabled = bifrostConfig?.is_cache_connected ?? false;

	// Local cache state lives on the plugin row keyed by SEMANTIC_CACHE_PLUGIN.
	// No dedicated /local-cache-config endpoint exists — the plugins API is
	// the source of truth for both the enabled flag and the config blob.
	const { data: plugins, isLoading: pluginsLoading } = useGetPluginsQuery();
	const semanticCachePlugin = useMemo(() => plugins?.find((p) => p.name === SEMANTIC_CACHE_PLUGIN), [plugins]);
	const enabledOnServer = Boolean(semanticCachePlugin?.enabled);

	const { data: providersData, error: providersError, isLoading: providersLoading } = useGetProvidersQuery();
	const providers = useMemo(() => providersData || [], [providersData]);
	const embeddingProviders = useMemo(() => providers.filter(supportsEmbedding), [providers]);

	const [updatePlugin, { isLoading: isUpdating }] = useUpdatePluginMutation();
	const [createPlugin, { isLoading: isCreating }] = useCreatePluginMutation();
	const isSaving = isUpdating || isCreating;

	const [cacheConfig, setCacheConfig] = useState<EditorCacheConfig>(defaultDirectConfig);
	const [serverCacheConfig, setServerCacheConfig] = useState<EditorCacheConfig>(defaultDirectConfig);
	const [mode, setMode] = useState<CacheMode>("direct");

	// Hydrate from the plugin row once it lands. If the plugin doesn't exist
	// yet (first-time setup), keep the default direct-only seed so the user
	// can start typing before any save.
	useEffect(() => {
		if (plugins === undefined) return;
		if (!semanticCachePlugin?.config) return;
		const editorConfig = toEditorCacheConfig(semanticCachePlugin.config as Partial<EditorCacheConfig>);
		setCacheConfig(editorConfig);
		setServerCacheConfig(editorConfig);
		setMode(inferMode(editorConfig));
	}, [plugins, semanticCachePlugin]);

	useEffect(() => {
		if (providersError) {
			toast.error(`加载提供商失败：${getErrorMessage(providersError as any)}`);
		}
	}, [providersError]);

	// Surface validation problems inline rather than only on Save click.
	const validationError = useMemo(() => validateForSave(cacheConfig, mode), [cacheConfig, mode]);

	// Only show the dimension/namespace heads-up when the user has actually
	// touched a structural field. Showing it permanently in semantic mode
	// trains users to ignore it; showing it on diff makes it land.
	const hasStructuralChange = useMemo(() => {
		return (
			cacheConfig.provider !== serverCacheConfig.provider ||
			cacheConfig.embedding_model !== serverCacheConfig.embedding_model ||
			cacheConfig.dimension !== serverCacheConfig.dimension
		);
	}, [cacheConfig, serverCacheConfig]);

	const hasUnsavedConfigChanges = useMemo(() => {
		const fields: (keyof EditorCacheConfig)[] = [
			"provider",
			"embedding_model",
			"dimension",
			"ttl",
			"threshold",
			"conversation_history_threshold",
			"exclude_system_prompt",
			"cache_by_model",
			"cache_by_provider",
			"vector_store_namespace",
			"default_cache_key",
		];
		const changed = fields.some((k) => (cacheConfig[k] ?? "") !== (serverCacheConfig[k] ?? ""));
		const modeChanged = inferMode(serverCacheConfig) !== mode;
		return changed || modeChanged;
	}, [cacheConfig, serverCacheConfig, mode]);

	const updateLocal = (updates: Partial<EditorCacheConfig>) => {
		setCacheConfig((prev) => ({ ...prev, ...updates }));
	};

	// Toggle handler. Updates the semantic_cache plugin's enabled flag while
	// keeping the last-saved config so the backend can ReloadPlugin/RemovePlugin
	// based on the new flag. When toggling on for the first time and no plugin
	// row exists, we seed it with the current editor config (direct-only by
	// default) so the create call has a valid payload — the user can refine
	// the config and Save afterwards.
	const handleToggle = async (checked: boolean) => {
		try {
			if (semanticCachePlugin) {
				await updatePlugin({
					name: SEMANTIC_CACHE_PLUGIN,
					data: { enabled: checked, config: semanticCachePlugin.config },
				}).unwrap();
			} else {
				// No plugin row + user toggling off ⇒ nothing to disable.
				// Bail before the success toast so we don't lie about the state.
				if (!checked) return;
				const err = validateForSave(cacheConfig, mode);
				if (err) {
					toast.error(err);
					return;
				}
				const payload = buildPayload(cacheConfig, mode);
				await createPlugin({
					name: SEMANTIC_CACHE_PLUGIN,
					enabled: true,
					config: payload,
					path: "",
				}).unwrap();
			}
			toast.success(checked ? "本地缓存已启用" : "本地缓存已停用");
		} catch (error) {
			toast.error(`${checked ? "启用" : "停用"}本地缓存失败：${getErrorMessage(error)}`);
		}
	};

	const handleSave = async () => {
		const err = validateForSave(cacheConfig, mode);
		if (err) {
			toast.error(err);
			return;
		}
		const payload = buildPayload(cacheConfig, mode);
		try {
			const updated = semanticCachePlugin
				? await updatePlugin({
						name: SEMANTIC_CACHE_PLUGIN,
						data: { enabled: semanticCachePlugin.enabled, config: payload },
					}).unwrap()
				: await createPlugin({
						name: SEMANTIC_CACHE_PLUGIN,
						enabled: false,
						config: payload,
						path: "",
					}).unwrap();
			const editor = toEditorCacheConfig(updated.config as Partial<EditorCacheConfig>);
			setCacheConfig(editor);
			setServerCacheConfig(editor);
			setMode(inferMode(editor));
			toast.success("缓存配置已更新");
		} catch (error) {
			toast.error(`更新缓存配置失败：${getErrorMessage(error)}`);
		}
	};

	const cachingActive = enabledOnServer && isVectorStoreEnabled;
	const isLoading = configLoading || pluginsLoading;

	return (
		<div className="mx-auto w-full max-w-4xl space-y-6">
			<div>
				<h2 className="text-lg font-semibold tracking-tight">本地缓存</h2>
				<p className="text-muted-foreground text-sm">
					通过两条互补的查找路径在本地缓存响应：<b>直接匹配</b>对完全相同的内容做哈希重放，<b>语义匹配</b>{" "}
					则对相关内容做相似度搜索。发送 <b>x-bf-cache-key</b> 请求头可将缓存响应限定到某个租户或功能。{" "}
					{!isVectorStoreEnabled && (
						<span className="text-destructive font-medium">
							需先在 <code>config.json</code> 中配置并启用向量存储。
						</span>
					)}
				</p>
			</div>

			{configError !== undefined && (
				<div className="border-destructive/50 bg-destructive/10 rounded-sm border p-4">
					<p className="text-destructive text-sm font-medium">加载配置失败</p>
					<p className="text-muted-foreground mt-1 text-sm">
						{getErrorMessage(configError) || "发生意外错误，请重试。"}
					</p>
				</div>
			)}

			{isLoading && (
				<div className="flex items-center justify-center py-8">
					<Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
				</div>
			)}

			{!isLoading && !configError && (
				<div className="space-y-4">
					{/* Enable toggle flips plugin.enabled on the semantic_cache
					    plugin row. The plugins API handles ReloadPlugin /
					    RemovePlugin transparently on update. */}
					<div className="flex items-center justify-between space-x-2">
						<div className="space-y-0.5">
							<label htmlFor="enable-caching" className="text-sm font-medium">
								启用缓存
							</label>
							<p className="text-muted-foreground text-sm">
								无需重启服务即可加载（或卸载）该插件。下方所做的配置修改会直接作用于运行中的插件，无需重新部署。{" "}
							</p>
						</div>
						<Switch
							id="enable-caching"
							data-testid="caching-enable-switch"
							size="md"
							checked={cachingActive}
							disabled={!isVectorStoreEnabled || isSaving}
							onCheckedChange={handleToggle}
						/>
					</div>

					{providersLoading ? (
						<div className="flex items-center justify-center py-4">
							<Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
						</div>
					) : (
						<>
							<div className={cn("space-y-4", !cachingActive && "pointer-events-none opacity-50")} aria-disabled={!cachingActive}>
								{/* Mode picker. Direct-only is first-class. */}
								<div className="space-y-2">
									<Label className="text-sm font-medium">缓存模式</Label>
									<Tabs value={mode} onValueChange={(v) => setMode(v as CacheMode)}>
										<TabsList className="grid w-full grid-cols-2">
											<TabsTrigger value="direct" data-testid="caching-mode-direct-tab">
												仅直接匹配
											</TabsTrigger>
											<TabsTrigger
												value="semantic"
												data-testid="caching-mode-semantic-tab"
												disabled={embeddingProviders.length === 0}
												title={
													embeddingProviders.length === 0 ? "配置一个支持嵌入的提供商以启用语义模式。" : undefined
												}
											>
												直接 + 语义
											</TabsTrigger>
										</TabsList>
									</Tabs>
									<p className="text-muted-foreground text-xs">
										{mode === "direct" ? (
											<>
												仅直接匹配模式会对每个请求做哈希，命中完全一致的内容时直接重放。无需嵌入模型，也无需额外提供商。这是开销最低的路径，非常适合稳定的提示词。
											</>
										) : (
											<>
												直接 + 语义模式在直接哈希匹配之上增加了向量相似度搜索。需要支持嵌入的提供商以及模型的真实维度。直接命中仍会优先返回；只有在直接查找未命中时才会执行语义搜索。
											</>
										)}
									</p>
								</div>

								{validationError && (
									<div className="border-destructive/40 bg-destructive/10 text-destructive rounded-sm border p-3 text-xs">
										{validationError}
									</div>
								)}

								{/* Provider/model/dimension only appear in semantic mode. */}
								{mode === "semantic" && (
									<>
										{hasStructuralChange && (
											<div className="rounded-sm border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
												<b>注意：</b>一个向量存储命名空间只能存放 <em>同一</em>维度 的向量。每当你更改嵌入的 <b>提供商</b>、<b>模型</b>或 <b>维度</b>时，请确保 <b>维度</b>仍与模型实际输出的维度一致，否则写入现有命名空间会失败，读取也会静默未命中。命名空间不会自动重建；请改用新的命名空间，或在保存前删除向量存储中已有的 class/index。
											</div>
										)}

										<div className="space-y-4">
											<h3 className="text-sm font-medium">嵌入提供商与模型</h3>
											<div className="grid grid-cols-2 gap-4">
												<div className="space-y-2">
													<Label htmlFor="provider">已配置的提供商</Label>
													<Select
														value={cacheConfig.provider}
														onValueChange={(value: ModelProviderName) =>
															updateLocal({
																provider: value,
																embedding_model: value === cacheConfig.provider ? cacheConfig.embedding_model : "",
															})
														}
													>
														<SelectTrigger className="w-full" data-testid="caching-provider-select">
															<SelectValue placeholder="选择提供商" />
														</SelectTrigger>
														<SelectContent>
															{embeddingProviders
																.filter((provider) => provider.name)
																.map((provider) => (
																	<SelectItem key={provider.name} value={provider.name}>
																		<div className="flex items-center gap-2">
																			<RenderProviderIcon provider={provider.name as ProviderIconType} size="sm" className="h-4 w-4" />
																			<span>{getProviderLabel(provider.name)}</span>
																		</div>
																	</SelectItem>
																))}
														</SelectContent>
													</Select>
												</div>
												<div className="space-y-2">
													<Label htmlFor="embedding_model">嵌入模型*</Label>
													<ModelMultiselect
														inputId="embedding_model"
														data-testid="caching-embedding-model-select"
														isSingleSelect
														provider={cacheConfig.provider || undefined}
														value={cacheConfig.embedding_model ?? ""}
														onChange={(model) => updateLocal({ embedding_model: model })}
														placeholder={cacheConfig.provider ? "搜索或输入嵌入模型…" : "请先选择提供商"}
														disabled={!cacheConfig.provider}
													/>
												</div>
											</div>
											<p className="text-muted-foreground text-xs">
												API 密钥沿用嵌入提供商的主配置，无需在此处重复添加。
											</p>
											<div className="space-y-2">
												<Label htmlFor="dimension">维度</Label>
												<Input
													id="dimension"
													data-testid="caching-dimension-input"
													type="number"
													min="2"
													value={cacheConfig.dimension === undefined || Number.isNaN(cacheConfig.dimension) ? "" : cacheConfig.dimension}
													onChange={(e) => {
														const value = e.target.value;
														if (value === "") {
															updateLocal({ dimension: undefined });
															return;
														}
														const parsed = parseInt(value);
														if (!Number.isNaN(parsed)) {
															updateLocal({ dimension: parsed });
														}
													}}
												/>
												<p className="text-muted-foreground text-xs">
												嵌入模型输出的向量大小，必须与模型完全一致（例如 OpenAI <code>text-embedding-3-small</code> 为 <code>1536</code>，{" "}
													<code>text-embedding-3-large</code> 为 <code>3072</code>，许多 Cohere/Voyage 模型为 <code>768</code>）。
												</p>
											</div>
										</div>
									</>
								)}

								{/* Cache settings shared across modes. */}
								<div className="space-y-4">
									<h3 className="text-sm font-medium">缓存设置</h3>
									<div className={cn("grid gap-4", mode === "semantic" ? "grid-cols-2" : "grid-cols-1")}>
										<div className="space-y-2">
											<Label htmlFor="ttl">TTL（秒）</Label>
											<Input
												id="ttl"
												data-testid="caching-ttl-input"
												type="number"
												min="1"
												value={cacheConfig.ttl === undefined || Number.isNaN(cacheConfig.ttl) ? "" : cacheConfig.ttl}
												onChange={(e) => {
													const value = e.target.value;
													if (value === "") {
														updateLocal({ ttl: undefined });
														return;
													}
													const parsed = parseInt(value);
													if (!Number.isNaN(parsed)) {
														updateLocal({ ttl: parsed });
													}
												}}
											/>
											<p className="text-muted-foreground text-xs">
												缓存条目的存活时间。可通过 <b>x-bf-cache-ttl</b> 请求头按请求覆盖。
											</p>
										</div>
										{mode === "semantic" && (
											<div className="space-y-2">
												<Label htmlFor="threshold">相似度阈值</Label>
												<Input
													id="threshold"
													data-testid="caching-threshold-input"
													type="number"
													min="0"
													max="1"
													step="0.01"
													value={cacheConfig.threshold === undefined || Number.isNaN(cacheConfig.threshold) ? "" : cacheConfig.threshold}
													onChange={(e) => {
														const value = e.target.value;
														if (value === "") {
															updateLocal({ threshold: undefined });
															return;
														}
														const parsed = parseFloat(value);
														if (!Number.isNaN(parsed)) {
															updateLocal({ threshold: parsed });
														}
													}}
												/>
												<p className="text-muted-foreground text-xs">
												语义命中所需的最小余弦相似度。可通过 <b>x-bf-cache-threshold</b> 按请求覆盖。
												</p>
											</div>
										)}
									</div>
								</div>

								{/* Storage & Cache Key. */}
								<div className="space-y-4">
									<h3 className="text-sm font-medium">存储与缓存键</h3>
									<div className="grid grid-cols-2 gap-4">
										<div className="space-y-2">
											<Label htmlFor="vector_store_namespace">向量存储命名空间</Label>
											<Input
												id="vector_store_namespace"
												data-testid="caching-vector-store-namespace-input"
												type="text"
												placeholder="BifrostLocalCachePlugin"
												value={cacheConfig.vector_store_namespace ?? ""}
												onChange={(e) => updateLocal({ vector_store_namespace: e.target.value })}
											/>
											<p className="text-muted-foreground text-xs">
												缓存条目所在的桶/索引名称。留空则使用默认值（<code>BifrostLocalCachePlugin</code>）。修改后会指向另一个（可能为空的）桶。旧条目不会被删除，只是不再被查询。
											</p>
										</div>
										<div className="space-y-2">
											<Label htmlFor="default_cache_key">默认缓存键</Label>
											<Input
												id="default_cache_key"
												data-testid="caching-default-cache-key-input"
												type="text"
												placeholder="（无）"
												value={cacheConfig.default_cache_key ?? ""}
												onChange={(e) => updateLocal({ default_cache_key: e.target.value })}
											/>
											<p className="text-muted-foreground text-xs">
												当请求未设置 <b>x-bf-cache-key</b> 时使用的兜底分区键。缓存键用于隔离条目：相同的键共享同一个缓存池。留空则对未发送该请求头的请求<b>禁用缓存</b>。
											</p>
										</div>
									</div>
								</div>

								{/* Conversation Settings. */}
								<div className="space-y-4">
									<h3 className="text-sm font-medium">会话设置</h3>
									<div className="grid grid-cols-2 gap-4">
										<div className="space-y-2">
											<Label htmlFor="conversation_history_threshold">会话历史阈值</Label>
											<Input
												id="conversation_history_threshold"
												data-testid="caching-conversation-history-threshold-input"
												type="number"
												min="1"
												max="50"
												value={
													cacheConfig.conversation_history_threshold === undefined ||
													Number.isNaN(cacheConfig.conversation_history_threshold)
														? ""
														: cacheConfig.conversation_history_threshold
												}
												onChange={(e) => {
													const value = e.target.value;
													if (value === "") {
														updateLocal({ conversation_history_threshold: undefined });
														return;
													}
													const parsed = parseInt(value);
													if (!Number.isNaN(parsed)) {
														updateLocal({ conversation_history_threshold: parsed });
													}
												}}
											/>
											<p className="text-muted-foreground text-xs">
												消息数超过该值的会话将跳过缓存。过长的历史记录很少能完全匹配，只会增加缓存体积却没有收益。
											</p>
										</div>
									</div>
									<div className="space-y-2">
										<div className="flex h-fit items-center justify-between space-x-2 rounded-sm border p-3">
											<div className="space-y-0.5">
												<Label className="text-sm font-medium">排除系统提示词</Label>
												<p className="text-muted-foreground text-xs">从缓存键中剔除系统消息。</p>
											</div>
											<Switch
												data-testid="caching-exclude-system-prompt-switch"
												checked={cacheConfig.exclude_system_prompt || false}
												onCheckedChange={(checked) => updateLocal({ exclude_system_prompt: checked })}
												size="md"
											/>
										</div>
									</div>
								</div>

								{/* Cache Behavior applies to both modes. */}
								<div className="space-y-4">
									<h3 className="text-sm font-medium">缓存键组成</h3>
									<div className="space-y-3">
										<div className="flex items-center justify-between space-x-2 rounded-sm border p-3">
											<div className="space-y-0.5">
												<Label className="text-sm font-medium">按模型缓存</Label>
												<p className="text-muted-foreground text-xs">
												在缓存键中包含模型名称。不同模型之间不会共享缓存响应。
												</p>
											</div>
											<Switch
												data-testid="caching-cache-by-model-switch"
												checked={cacheConfig.cache_by_model}
												onCheckedChange={(checked) => updateLocal({ cache_by_model: checked })}
												size="md"
											/>
										</div>
										<div className="flex items-center justify-between space-x-2 rounded-sm border p-3">
											<div className="space-y-0.5">
												<Label className="text-sm font-medium">按提供商缓存</Label>
												<p className="text-muted-foreground text-xs">
												在缓存键中包含提供商名称。不同提供商之间不会共享缓存响应。
												</p>
											</div>
											<Switch
												data-testid="caching-cache-by-provider-switch"
												checked={cacheConfig.cache_by_provider}
												onCheckedChange={(checked) => updateLocal({ cache_by_provider: checked })}
												size="md"
											/>
										</div>
									</div>
								</div>

								<div className="space-y-2">
									<Label className="text-sm font-medium">按请求覆盖</Label>
									<ul className="text-muted-foreground list-inside list-disc text-xs">
										<li>
											<b>x-bf-cache-key</b>：将本次请求限定到指定的缓存分区。
										</li>
										<li>
											<b>x-bf-cache-ttl</b>：仅覆盖本次请求的 TTL。
										</li>
										<li>
											<b>x-bf-cache-threshold</b>：覆盖语义相似度阈值。
										</li>
										<li>
											<b>x-bf-cache-type</b>：发送 <code>direct</code> 或 <code>semantic</code> 以将查找限制在单一路径。
										</li>
										<li>
											<b>x-bf-cache-no-store</b>：设为 <code>true</code> 可跳过写入响应（仍会返回缓存命中结果）。
										</li>
									</ul>
								</div>
							</div>

							<div className="flex justify-end pt-2">
								<Button
									data-testid="caching-save-button"
									onClick={handleSave}
									disabled={!hasUnsavedConfigChanges || isSaving || Boolean(validationError)}
								>
									{isSaving ? "保存中…" : "保存更改"}
								</Button>
							</div>
						</>
					)}
				</div>
			)}
		</div>
	);
}