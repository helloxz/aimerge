import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SecretVarInput } from "@/components/ui/secretVarInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { IS_ENTERPRISE } from "@/lib/constants/config";
import { getErrorMessage, useGetCoreConfigQuery, useUpdateCoreConfigMutation } from "@/lib/store";
import { AuthConfig, CoreConfig, DefaultCoreConfig } from "@/lib/types/config";
import { SecretVar } from "@/lib/types/schemas";
import { parseArrayFromText } from "@/lib/utils/array";
import { validateOrigins } from "@/lib/utils/validation";
import { RbacOperation, RbacResource, useRbac } from "@enterprise/lib";
import { useGetAuthTypeQuery } from "@enterprise/lib/store/apis/scimApi";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const PASSWORD_REQUIREMENTS = [
	{ label: "至少 12 个字符", test: (password: string) => password.length >= 12 },
	{ label: "一个大写字母", test: (password: string) => /[A-Z]/.test(password) },
	{ label: "一个小写字母", test: (password: string) => /[a-z]/.test(password) },
	{ label: "一个数字", test: (password: string) => /\d/.test(password) },
	{ label: "一个特殊字符", test: (password: string) => /[^A-Za-z0-9]/.test(password) },
];

const getPasswordPolicyFailures = (password?: string) => {
	if (!password) return [];
	return PASSWORD_REQUIREMENTS.filter((requirement) => !requirement.test(password)).map((requirement) => requirement.label);
};

export default function SecurityView() {
	const hasSettingsUpdateAccess = useRbac(RbacResource.Settings, RbacOperation.Update);
	const { data: bifrostConfig } = useGetCoreConfigQuery({ fromDB: true });
	const { data: authType, isLoading: authTypeLoading, error: authTypeError } = useGetAuthTypeQuery(undefined, { skip: !IS_ENTERPRISE });
	const config = bifrostConfig?.client_config;
	const [updateCoreConfig, { isLoading }] = useUpdateCoreConfigMutation();
	const [localConfig, setLocalConfig] = useState<CoreConfig>(DefaultCoreConfig);
	const showPasswordSection = !IS_ENTERPRISE || (!authTypeLoading && !authTypeError && authType?.type !== "sso");
	const passwordInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

	const [localValues, setLocalValues] = useState<{
		allowed_origins: string;
		allowed_headers: string;
		required_headers: string;
		whitelisted_routes: string;
	}>({
		allowed_origins: "",
		allowed_headers: "",
		required_headers: "",
		whitelisted_routes: "",
	});

	const [authConfig, setAuthConfig] = useState<AuthConfig>({
		admin_username: { value: "", ref: "" },
		admin_password: { value: "", ref: "" },
		is_enabled: false,
	});
	const [passwordError, setPasswordError] = useState("");

	useEffect(() => {
		if (bifrostConfig && config) {
			setLocalConfig(config);
			setLocalValues({
				allowed_origins: config?.allowed_origins?.join(", ") || "",
				allowed_headers: config?.allowed_headers?.join(", ") || "",
				required_headers: config?.required_headers?.join(", ") || "",
				whitelisted_routes: config?.whitelisted_routes?.join(", ") || "",
			});
		}
		if (bifrostConfig?.auth_config) {
			setAuthConfig(bifrostConfig.auth_config);
		}
	}, [config, bifrostConfig]);

	const hasChanges = useMemo(() => {
		if (!config) return false;
		const localOrigins = localConfig.allowed_origins?.slice().sort().join(",");
		const serverOrigins = config.allowed_origins?.slice().sort().join(",");
		const originsChanged = localOrigins !== serverOrigins;

		const localHeaders = localConfig.allowed_headers?.slice().sort().join(",");
		const serverHeaders = config.allowed_headers?.slice().sort().join(",");
		const headersChanged = localHeaders !== serverHeaders;

		const usernameChanged =
			authConfig.admin_username?.value !== bifrostConfig?.auth_config?.admin_username?.value ||
			authConfig.admin_username?.ref !== bifrostConfig?.auth_config?.admin_username?.ref ||
			authConfig.admin_username?.type !== bifrostConfig?.auth_config?.admin_username?.type;
		const passwordChanged =
			authConfig.admin_password?.value !== bifrostConfig?.auth_config?.admin_password?.value ||
			authConfig.admin_password?.ref !== bifrostConfig?.auth_config?.admin_password?.ref ||
			authConfig.admin_password?.type !== bifrostConfig?.auth_config?.admin_password?.type;
		const authChanged = showPasswordSection
			? authConfig.is_enabled !== bifrostConfig?.auth_config?.is_enabled || usernameChanged || passwordChanged
			: false;

		const localRequired = localConfig.required_headers?.slice().sort().join(",");
		const serverRequired = config.required_headers?.slice().sort().join(",");
		const requiredChanged = localRequired !== serverRequired;

		const localWhitelistedRoutes = localConfig.whitelisted_routes?.slice().sort().join(",");
		const serverWhitelistedRoutes = config.whitelisted_routes?.slice().sort().join(",");
		const whitelistedRoutesChanged = localWhitelistedRoutes !== serverWhitelistedRoutes;

		const enforceAuthOnInferenceChanged = localConfig.enforce_auth_on_inference !== config.enforce_auth_on_inference;
		const allowDirectKeysChanged = localConfig.allow_direct_keys !== config.allow_direct_keys;
		const dualCredentialConflictBehaviorChanged =
			(localConfig.dual_credential_conflict_behavior || "prefer_idp") !== (config.dual_credential_conflict_behavior || "prefer_idp");

		return (
			originsChanged ||
			headersChanged ||
			requiredChanged ||
			whitelistedRoutesChanged ||
			authChanged ||
			enforceAuthOnInferenceChanged ||
			allowDirectKeysChanged ||
			dualCredentialConflictBehaviorChanged
		);
	}, [config, localConfig, authConfig, bifrostConfig, showPasswordSection]);

	const needsRestart = useMemo(() => {
		if (!config) return false;

		const localOrigins = localConfig.allowed_origins?.slice().sort().join(",");
		const serverOrigins = config.allowed_origins?.slice().sort().join(",");
		const originsChanged = localOrigins !== serverOrigins;

		const localHeaders = localConfig.allowed_headers?.slice().sort().join(",");
		const serverHeaders = config.allowed_headers?.slice().sort().join(",");
		const headersChanged = localHeaders !== serverHeaders;

		const enforceAuthOnInferenceChanged = localConfig.enforce_auth_on_inference !== config.enforce_auth_on_inference && IS_ENTERPRISE;

		return originsChanged || headersChanged || enforceAuthOnInferenceChanged;
	}, [config, localConfig]);

	const handleAllowedOriginsChange = useCallback((value: string) => {
		setLocalValues((prev) => ({ ...prev, allowed_origins: value }));
		setLocalConfig((prev) => ({ ...prev, allowed_origins: parseArrayFromText(value) }));
	}, []);

	const handleAllowedHeadersChange = useCallback((value: string) => {
		setLocalValues((prev) => ({ ...prev, allowed_headers: value }));
		setLocalConfig((prev) => ({ ...prev, allowed_headers: parseArrayFromText(value) }));
	}, []);

	const handleRequiredHeadersChange = useCallback((value: string) => {
		setLocalValues((prev) => ({ ...prev, required_headers: value }));
		setLocalConfig((prev) => ({ ...prev, required_headers: parseArrayFromText(value) }));
	}, []);

	const handleWhitelistedRoutesChange = useCallback((value: string) => {
		setLocalValues((prev) => ({ ...prev, whitelisted_routes: value }));
		setLocalConfig((prev) => ({ ...prev, whitelisted_routes: parseArrayFromText(value) }));
	}, []);

	const handleConfigChange = useCallback((field: keyof CoreConfig, value: boolean) => {
		setLocalConfig((prev) => ({ ...prev, [field]: value }));
	}, []);

	const handleAuthToggle = useCallback((checked: boolean) => {
		setAuthConfig((prev) => ({ ...prev, is_enabled: checked }));
	}, []);

	const handleAuthFieldChange = useCallback((field: "admin_username" | "admin_password", value: SecretVar) => {
		if (field === "admin_password") {
			const passwordPolicyFailures = !value.ref && value.value ? getPasswordPolicyFailures(value.value) : [];
			setPasswordError(passwordPolicyFailures.length > 0 ? `密码必须包含：${passwordPolicyFailures.join("、")}。` : "");
		}
		setAuthConfig((prev) => ({ ...prev, [field]: value }));
	}, []);

	const handleSave = useCallback(async () => {
		try {
			const validation = validateOrigins(localConfig.allowed_origins);

			if (!validation.isValid && localConfig.allowed_origins.length > 0) {
				toast.error(
					`无效的来源：${validation.invalidOrigins.join("、")}。来源必须是有效的 URL（如 https://example.com）、通配符模式（如 https://*.example.com），或使用 "*" 允许所有来源`,
				);
				return;
			}
			const hasUsername = authConfig.admin_username?.value || authConfig.admin_username?.ref;
			const hasPassword = authConfig.admin_password?.value || authConfig.admin_password?.ref;
			const passwordPolicyFailures =
				showPasswordSection && authConfig.is_enabled && !authConfig.admin_password?.ref && authConfig.admin_password?.value
					? getPasswordPolicyFailures(authConfig.admin_password.value)
					: [];

			if (passwordPolicyFailures.length > 0) {
				setPasswordError(`密码必须包含：${passwordPolicyFailures.join("、")}。`);
				passwordInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
				passwordInputRef.current?.focus({ preventScroll: true });
				return;
			}
			setPasswordError("");

			await updateCoreConfig({
				...bifrostConfig!,
				client_config: localConfig,
				...(showPasswordSection
					? {
						auth_config: authConfig.is_enabled && hasUsername && hasPassword ? authConfig : { ...authConfig, is_enabled: false },
					}
					: {}),
			}).unwrap();
			toast.success("安全设置已更新。");
		} catch (error) {
			toast.error(getErrorMessage(error));
		}
	}, [bifrostConfig, localConfig, authConfig, showPasswordSection, updateCoreConfig]);

	return (
		<div className="mx-auto w-full max-w-4xl space-y-4">
			<div>
				<h2 className="text-lg font-semibold tracking-tight">安全设置</h2>
				<p className="text-muted-foreground text-sm">配置安全与访问控制设置。</p>
			</div>

			<div className="space-y-4">
				{/* Password Protect the Dashboard */}
				{IS_ENTERPRISE && authTypeLoading ? (
					<div className="flex items-center justify-center rounded-sm border p-8" data-testid="security-auth-type-loading">
						<Loader2 className="text-muted-foreground h-5 w-5 animate-spin" aria-hidden />
						<span className="sr-only">正在加载身份验证设置</span>
					</div>
				) : null}
				{IS_ENTERPRISE && !authTypeLoading && authTypeError ? (
					<Alert variant="destructive" data-testid="security-auth-type-error">
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>
							无法加载身份验证类型。在请求成功之前，仪表盘密码设置将保持隐藏。{" "}
							{getErrorMessage(authTypeError)}
						</AlertDescription>
					</Alert>
				) : null}
				{showPasswordSection && (
					<div>
						<div className="space-y-4 rounded-sm border p-4">
							<div className="flex items-center justify-between">
								<div className="space-y-0.5">
									<Label htmlFor="auth-enabled" className="text-sm font-medium">
										为仪表盘设置密码保护 <Badge variant="secondary">BETA</Badge>
									</Label>
									<p className="text-muted-foreground text-sm">
										设置身份验证凭据以保护 Bifrost 仪表盘。配置完成后，所有管理 API 调用都需要使用生成的令牌。
									</p>
								</div>
								<Switch id="auth-enabled" checked={authConfig.is_enabled} onCheckedChange={handleAuthToggle} />
							</div>
							<div className="space-y-4">
								<div className="space-y-2">
									<Label htmlFor="admin-username">用户名</Label>
									<SecretVarInput
										id="admin-username"
										type="text"
										placeholder="输入管理员用户名或 env.VAR_NAME"
										value={authConfig.admin_username}
										disabled={!authConfig.is_enabled}
										onChange={(value) => handleAuthFieldChange("admin_username", value)}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="admin-password">密码</Label>
									<SecretVarInput
										ref={passwordInputRef}
										id="admin-password"
										aria-invalid={!!passwordError}
										aria-describedby={passwordError ? "admin-password-error" : undefined}
										type="password"
										placeholder="输入管理员密码或 env.VAR_NAME"
										value={authConfig.admin_password}
										disabled={!authConfig.is_enabled}
										onChange={(value) => handleAuthFieldChange("admin_password", value)}
									/>
									<p className="text-muted-foreground text-xs">
										至少 12 个字符，需包含大写字母、小写字母、数字和特殊字符。支持引用环境变量。
									</p>
									{passwordError ? (
										<p id="admin-password-error" className="text-destructive text-xs" role="alert">
											{passwordError}
										</p>
									) : null}
								</div>
							</div>
						</div>
					</div>
				)}
				{/* Enable Auth on Inference */}
				<div className="flex items-center justify-between space-x-2 rounded-sm border p-4">
					<div className="space-y-0.5">
						<label htmlFor="enforce-auth-on-inference" className="text-sm font-medium">
							{IS_ENTERPRISE ? "在推理时启用身份验证" : "在推理时强制使用虚拟密钥"}
						</label>
						<p className="text-muted-foreground text-sm">
							{IS_ENTERPRISE
								? "所有推理端点都需要身份验证（虚拟密钥、API 密钥或用户令牌）。"
								: "所有推理请求都必须提供虚拟密钥。"}{" "}
							详情请参阅{" "}
							<a
								href="https://docs.getbifrost.ai/features/governance/virtual-keys"
								target="_blank"
								rel="noopener noreferrer"
								className="text-primary underline"
								data-testid="security-virtual-keys-docs-link"
							>
								虚拟密钥文档
							</a>
							。
						</p>
					</div>
					<Switch
						id="enforce-auth-on-inference"
						data-testid="enforce-auth-on-inference-switch"
						checked={localConfig.enforce_auth_on_inference}
						onCheckedChange={(checked) => handleConfigChange("enforce_auth_on_inference", checked)}
					/>
				</div>
				{/* 双凭据冲突处理方式 */}
				{IS_ENTERPRISE && (
					<div className="flex items-center justify-between space-x-2 rounded-sm border p-4">
						<div className="space-y-0.5">
							<label htmlFor="dual-credential-conflict-behavior" className="text-sm font-medium">
								双凭据冲突处理方式
							</label>
							<p className="text-muted-foreground text-sm">
								当推理请求同时携带身份提供商访问令牌（<b>Authorization: Bearer</b>）和虚拟密钥（<b>x-bf-vk</b>）时如何处理。<b>优先使用 IDP 令牌</b>会以用户令牌作为身份，<b>优先使用虚拟密钥</b>会丢弃 IDP 令牌并改用虚拟密钥认证，<b>拒绝请求</b>会返回 400 错误。
							</p>
						</div>
						<Select
							value={localConfig.dual_credential_conflict_behavior || "prefer_idp"}
							onValueChange={(value) =>
								setLocalConfig((prev) => ({ ...prev, dual_credential_conflict_behavior: value as CoreConfig["dual_credential_conflict_behavior"] }))
							}
						>
							<SelectTrigger id="dual-credential-conflict-behavior" data-testid="dual-credential-conflict-behavior-select" className="w-[180px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="prefer_idp">优先使用 IDP 令牌</SelectItem>
								<SelectItem value="prefer_vk">优先使用虚拟密钥</SelectItem>
								<SelectItem value="error">拒绝请求</SelectItem>
							</SelectContent>
						</Select>
					</div>
				)}
				{/* Allow Direct API Keys */}
				<div className="flex items-center justify-between space-x-2 rounded-sm border p-4">
					<div className="space-y-0.5">
						<label htmlFor="allow-direct-keys" className="text-sm font-medium">
							允许直接使用 API 密钥
						</label>
						<p className="text-muted-foreground text-sm">
							启用后，调用方可以在 <b>Authorization</b>、<b>x-api-key</b> 或{" "}
							<b>x-goog-api-key</b> 请求头中直接传入提供商 API 密钥，并附带 <b>x-bf-direct-key: true</b>。Bifrost 将直接使用该密钥，跳过已注册的密钥池。
						</p>
					</div>
					<Switch
						id="allow-direct-keys"
						data-testid="security-allow-direct-keys-switch"
						checked={localConfig.allow_direct_keys}
						onCheckedChange={(checked) => handleConfigChange("allow_direct_keys", checked)}
					/>
				</div>
				{/* Allowed Origins */}
				{needsRestart && <RestartWarning />}
				<div>
					<div className="space-y-2 rounded-sm border p-4">
						<div className="space-y-0.5">
							<label htmlFor="allowed-origins" className="text-sm font-medium">
								允许的来源
							</label>
							<p className="text-muted-foreground text-sm">
								CORS 和 WebSocket 连接允许的来源列表，以逗号分隔。localhost 来源始终被允许。每个来源必须是包含协议的完整 URL（如 https://app.example.com、http://10.0.0.100:3000）。子域名支持通配符（如 https://*.example.com），也可以使用 "*" 允许所有来源。
							</p>
						</div>
						<Textarea
							id="allowed-origins"
							className="h-24"
							placeholder="https://app.example.com, https://*.example.com, *"
							value={localValues.allowed_origins}
							onChange={(e) => handleAllowedOriginsChange(e.target.value)}
						/>
					</div>
				</div>
				{/* Allowed Headers */}
				<div>
					<div className="space-y-2 rounded-sm border p-4">
						<div className="space-y-0.5">
							<label htmlFor="allowed-headers" className="text-sm font-medium">
								允许的请求头
							</label>
							<p className="text-muted-foreground text-sm">CORS 允许的请求头列表，以逗号分隔。</p>
						</div>
						<Textarea
							id="allowed-headers"
							className="h-24"
							placeholder="X-Stainless-Timeout"
							value={localValues.allowed_headers}
							onChange={(e) => handleAllowedHeadersChange(e.target.value)}
						/>
					</div>
				</div>
				{/* Required Headers */}
				<div>
					<div className="space-y-2 rounded-sm border p-4">
						<div className="space-y-0.5">
							<label htmlFor="required-headers" className="text-sm font-medium">
								必需的请求头
							</label>
							<p className="text-muted-foreground text-sm">
								每个请求都必须携带的请求头列表，以逗号分隔。缺少任一请求头的请求将返回 400 错误。请求头名称不区分大小写。
							</p>
						</div>
						<Textarea
							id="required-headers"
							data-testid="required-headers-textarea"
							className="h-24"
							placeholder="X-Tenant-ID, X-Custom-Header"
							value={localValues.required_headers}
							onChange={(e) => handleRequiredHeadersChange(e.target.value)}
						/>
					</div>
				</div>
				{/* Whitelisted Routes */}
				<div>
					<div className="space-y-2 rounded-sm border p-4">
						<div className="space-y-0.5">
							<label htmlFor="whitelisted-routes" className="text-sm font-medium">
								白名单路由
							</label>
							<p className="text-muted-foreground text-sm">
								绕过身份验证中间件的路由列表，以逗号分隔。访问这些路由的请求无需身份验证。无论此设置如何，<b>/health</b>、<b>/api/session/login</b> 和 <b>/api/session/is-auth-enabled</b> 等系统路由始终在白名单中。
							</p>
						</div>
						<Textarea
							id="whitelisted-routes"
							data-testid="whitelisted-routes-textarea"
							className="h-24"
							placeholder="/api/custom-webhook, /api/public-endpoint"
							value={localValues.whitelisted_routes}
							onChange={(e) => handleWhitelistedRoutesChange(e.target.value)}
						/>
					</div>
				</div>
			</div>
			<div className="bg-card sticky bottom-0 flex justify-end py-2">
				<Button onClick={handleSave} disabled={!hasChanges || isLoading || !hasSettingsUpdateAccess}>
					{isLoading ? "保存中…" : "保存更改"}
				</Button>
			</div>
		</div>
	);
}

const RestartWarning = () => {
	return (
		<Alert variant="destructive" className="mt-2">
			<AlertTriangle className="h-4 w-4" />
			<AlertDescription>需要重启 Bifrost 以应用更改。</AlertDescription>
		</Alert>
	);
};