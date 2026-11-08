import { KnownProvidersNames } from "@/lib/constants/logs";
import { isRedacted } from "@/lib/utils/validation";
import { z } from "zod";

// Global error map - turns Zod's default messages into readable, human-friendly ones.
// Individual schemas can still override by passing their own message.
z.config({
	customError: (issue) => {
		if (issue.code === "invalid_type") {
			// Field is missing / undefined
			if (issue.input === undefined || issue.input === null) {
				return "请填写此字段";
			}
			const expected = issue.expected;
			const received = typeof issue.input;
			if (expected === "number") return "请输入有效的数字";
			if (expected === "string") return "请输入有效的文本";
			if (expected === "boolean") return "必须为 true 或 false";
			return `应为 ${expected}，实际为 ${received}`;
		}
		if (issue.code === "too_small") {
			if (issue.origin === "string" && issue.minimum === 1) {
				return "请填写此字段";
			}
			if (issue.origin === "number") {
				return `不得小于 ${issue.minimum}`;
			}
			if (issue.origin === "array" && issue.minimum === 1) {
				return "请至少添加一项";
			}
		}
		if (issue.code === "too_big") {
			if (issue.origin === "number") {
				return `不得大于 ${issue.maximum}`;
			}
			if (issue.origin === "string") {
				return `最多 ${issue.maximum} 个字符`;
			}
		}
		if (issue.code === "invalid_format") {
			if (issue.format === "url") return "请输入有效的 URL";
			if (issue.format === "email") return "请输入有效的邮箱地址";
		}
		return undefined; // fall back to Zod default
	},
});

// Base Zod schemas matching the TypeScript types

// Known provider schema
export const knownProviderSchema = z.enum(KnownProvidersNames as unknown as [string, ...string[]]);

// Custom provider name schema (branded type simulation)
export const customProviderNameSchema = z.string().min(1, "请填写自定义提供商名称");

// Model provider name schema (union of known and custom providers)
export const modelProviderNameSchema = z.union([knownProviderSchema, customProviderNameSchema]);

// SecretVar schema - matches the Go SecretVar type from schemas/secretvar.go
export const _secretVarBase = z.object({
	value: z.string().optional(),
	ref: z.string().optional(),
	type: z.enum(["plain_text", "env", "vault"]).optional(),
});

// Extending the base schema
export const secretVarSchema = Object.assign(_secretVarBase, {
	required: (message: string) => _secretVarBase.refine((v) => !!v?.value?.trim() || !!v?.ref?.trim(), message),
});

// Helper to check if a secretVar field has a value or secret reference
function isSecretVarSet(v: { value?: string; ref?: string } | undefined): boolean {
	if (!v) return false;
	return !!v.value?.trim() || !!v.ref?.trim();
}

// Azure key config schema
export const azureKeyConfigSchema = z
	.object({
		_auth_type: z.enum(["api_key", "entra_id", "default_credential"]).optional(),
		endpoint: secretVarSchema.optional(),
		client_id: secretVarSchema.optional(),
		client_secret: secretVarSchema.optional(),
		tenant_id: secretVarSchema.optional(),
		scopes: z.array(z.string()).optional(),
	})
	.refine((data) => isSecretVarSet(data.endpoint), {
		message: "请填写端点地址",
		path: ["endpoint"],
	})
	.refine(
		(data) => {
			// When using Entra ID, all three fields are required
			if (data._auth_type === "entra_id") {
				return isSecretVarSet(data.client_id) && isSecretVarSet(data.client_secret) && isSecretVarSet(data.tenant_id);
			}
			// Otherwise, if any Entra ID field is set, all three must be set
			const hasClientId = isSecretVarSet(data.client_id);
			const hasClientSecret = isSecretVarSet(data.client_secret);
			const hasTenantId = isSecretVarSet(data.tenant_id);
			const anyEntraField = hasClientId || hasClientSecret || hasTenantId;
			if (!anyEntraField) return true;
			return hasClientId && hasClientSecret && hasTenantId;
		},
		{
			message: "使用 Entra ID 认证时，必须同时填写客户端 ID、客户端密钥和租户 ID",
			path: ["client_id"],
		},
	);

// Vertex key config schema
export const vertexKeyConfigSchema = z
	.object({
		_auth_type: z.enum(["service_account", "service_account_json", "api_key"]).optional(),
		project_id: secretVarSchema.optional(),
		project_number: secretVarSchema.optional(),
		region: secretVarSchema.optional(),
		auth_credentials: secretVarSchema.optional(),
		force_single_region: z.boolean().optional(),
	})
	.refine((data) => isSecretVarSet(data.project_id), {
		message: "请填写项目 ID",
		path: ["project_id"],
	})
	.refine((data) => isSecretVarSet(data.region), {
		message: "请填写区域",
		path: ["region"],
	})
	.refine(
		(data) => {
			// When using service_account_json auth, auth_credentials is required
			if (data._auth_type === "service_account_json") {
				return isSecretVarSet(data.auth_credentials);
			}
			return true;
		},
		{
			message: "使用服务账号 JSON 认证时，请填写认证凭证",
			path: ["auth_credentials"],
		},
	);

// S3 bucket configuration for Bedrock batch operations
export const s3BucketConfigSchema = z.object({
	bucket_name: z.string().min(1, "请填写存储桶名称"),
	prefix: z.string().optional(),
	is_default: z.boolean().optional(),
});

export const batchS3ConfigSchema = z.object({
	buckets: z.array(s3BucketConfigSchema).optional(),
});

// Bedrock key config schema
export const bedrockKeyConfigSchema = z
	.object({
		_auth_type: z.enum(["iam_role", "explicit", "api_key"]).optional(),
		access_key: secretVarSchema.optional(),
		secret_key: secretVarSchema.optional(),
		session_token: secretVarSchema.optional(),
		region: secretVarSchema.optional(),
		role_arn: secretVarSchema.optional(),
		external_id: secretVarSchema.optional(),
		session_name: secretVarSchema.optional(),
		batch_role_arn: secretVarSchema.optional(),
		arn: secretVarSchema.optional(),
		project_id: secretVarSchema.optional(),
		batch_s3_config: batchS3ConfigSchema.optional(),
	})
	.refine(
		(data) => {
			// Region is required for Bedrock
			return isSecretVarSet(data.region);
		},
		{
			message: "请填写区域",
			path: ["region"],
		},
	)
	.refine(
		(data) => {
			// When using explicit credentials, both access_key and secret_key are required
			if (data._auth_type === "explicit") {
				return isSecretVarSet(data.access_key) && isSecretVarSet(data.secret_key);
			}
			// Otherwise, if either is set both must be set
			const hasAccessKey = isSecretVarSet(data.access_key);
			const hasSecretKey = isSecretVarSet(data.secret_key);
			if (!hasAccessKey && !hasSecretKey) return true;
			return hasAccessKey && hasSecretKey;
		},
		{
			message: "使用显式凭证时，必须同时填写访问密钥和私有密钥",
			path: ["access_key"],
		},
	);

// Bedrock Mantle key config schema (SigV4 credentials; no ARN / batch S3 config)
export const bedrockMantleKeyConfigSchema = z
	.object({
		_auth_type: z.enum(["iam_role", "explicit", "api_key"]).optional(),
		access_key: secretVarSchema.optional(),
		secret_key: secretVarSchema.optional(),
		session_token: secretVarSchema.optional(),
		region: secretVarSchema.optional(),
		role_arn: secretVarSchema.optional(),
		external_id: secretVarSchema.optional(),
		session_name: secretVarSchema.optional(),
		project_id: secretVarSchema.optional(),
	})
	.refine((data) => isSecretVarSet(data.region), {
		message: "请填写区域",
		path: ["region"],
	})
	.refine(
		(data) => {
			// Explicit auth must carry both keys; a region-only config fails at request time.
			if (data._auth_type === "explicit") {
				return isSecretVarSet(data.access_key) && isSecretVarSet(data.secret_key);
			}
			// If either access_key or secret_key is set, both must be set.
			const hasAccessKey = isSecretVarSet(data.access_key);
			const hasSecretKey = isSecretVarSet(data.secret_key);
			// IAM-role path: both keys empty is valid, but a lone session token cannot sign SigV4.
			if (!hasAccessKey && !hasSecretKey) return !isSecretVarSet(data.session_token);
			return hasAccessKey && hasSecretKey;
		},
		{
			message: "使用显式凭证时，必须同时填写访问密钥和私有密钥",
			path: ["access_key"],
		},
	);

// VLLM key config schema
export const vllmKeyConfigSchema = z
	.object({
		url: secretVarSchema.optional(),
		model_name: z.string().trim().min(1, "请填写模型名称"),
	})
	.refine((data) => isSecretVarSet(data.url), {
		message: "请填写服务器 URL",
		path: ["url"],
	});

export const replicateKeyConfigSchema = z.object({
	use_deployments_endpoint: z.boolean(),
});

// Ollama key config schema
export const ollamaKeyConfigSchema = z
	.object({
		url: secretVarSchema.optional(),
	})
	.refine((data) => isSecretVarSet(data.url), {
		message: "请填写服务器 URL",
		path: ["url"],
	});

// SGL key config schema
export const sglKeyConfigSchema = z
	.object({
		url: secretVarSchema.optional(),
	})
	.refine((data) => isSecretVarSet(data.url), {
		message: "请填写服务器 URL",
		path: ["url"],
	});

// Model family enum schema — must mirror schemas.ModelFamily in Go.
export const modelFamilySchema = z.enum([
	"anthropic",
	"openai",
	"mistral",
	"cohere",
	"gemini",
	"gemma",
	"llama",
	"imagen",
	"veo",
	"nova",
	"titan",
]);

// AliasConfig schema — mirrors schemas.AliasConfig with the embedded
// provider sub-configs flattened to top-level optional fields (matches Go's
// embedded-pointer-struct JSON output).
const aliasConfigObjectSchema = z.object({
	model_id: z.string().trim().min(1, "请填写模型 ID"),
	model_name: z.string().trim().optional(),
	model_family: modelFamilySchema.optional(),
	description: z.string().optional(),
	region: secretVarSchema.optional(),
	// Azure overrides
	api_version: z.string().optional(),
	anthropic_version: z.string().optional(),
	endpoint: secretVarSchema.optional(),
	// Shared per-alias project override (Vertex / Bedrock / Bedrock Mantle)
	project_id: secretVarSchema.optional(),
	// Vertex overrides
	project_number: secretVarSchema.optional(),
	force_single_region: z.boolean().optional(),
	// Bedrock overrides
	inference_profile_arn: secretVarSchema.optional(),
	// Replicate overrides
	use_deployments_endpoint: z.boolean().optional(),
	use_anthropic_endpoints: z.boolean().optional(),
});

// The Go server emits the legacy string wire shape (`{"my-alias": "model-id"}`)
// for aliases that only carry ModelID — see AliasConfig.MarshalJSON. Accept
// both shapes here so edit-time validation doesn't reject hydrated state.
export const aliasConfigSchema = z.preprocess(
	(value) => (typeof value === "string" ? { model_id: value } : value),
	aliasConfigObjectSchema,
);

// Model provider key schema
export const modelProviderKeySchema = z
	.object({
		id: z.string().min(1, "请填写 ID"),
		name: z.string().min(1, "请填写名称"),
		value: secretVarSchema.optional(),
		models: z.array(z.string()).optional().default(["*"]),
		blacklisted_models: z.array(z.string()).default([]).optional(),
		weight: z
			.union([z.number(), z.string()])
			.transform((val, ctx) => {
				if (typeof val === "number") return val;
				if (val.trim() === "") return 1.0;
				// Use Number() rather than parseFloat() so that strings like "0.5abc"
				// are rejected outright instead of silently parsing to 0.5.
				const num = Number(val);
				if (!Number.isFinite(num)) {
					ctx.addIssue({
						code: "custom",
						message: "权重必须是 0 到 1 之间的有效数字",
					});
					return z.NEVER;
				}
				return num;
			})
			.pipe(z.number().min(0, "权重不得小于 0").max(1, "权重不得大于 1")),
		aliases: z.record(z.string(), aliasConfigSchema).optional(),
		azure_key_config: azureKeyConfigSchema.optional(),
		vertex_key_config: vertexKeyConfigSchema.optional(),
		bedrock_key_config: bedrockKeyConfigSchema.optional(),
		bedrock_mantle_key_config: bedrockMantleKeyConfigSchema.optional(),
		vllm_key_config: vllmKeyConfigSchema.optional(),
		replicate_key_config: replicateKeyConfigSchema.optional(),
		ollama_key_config: ollamaKeyConfigSchema.optional(),
		sgl_key_config: sglKeyConfigSchema.optional(),
		use_for_batch_api: z.boolean().optional(),
		use_anthropic_endpoints: z.boolean().optional(),
		enabled: z.boolean().optional(),
	})
	.refine(
		(data) => {
			// Providers with dedicated config that never need a top-level API key
			if (data.vllm_key_config || data.replicate_key_config || data.ollama_key_config || data.sgl_key_config) {
				return true;
			}
			// Bedrock Mantle authenticates via SigV4 (its key config) or a Bearer key — only require
			// a top-level API key when the user explicitly chose the api_key auth method.
			if (data.bedrock_mantle_key_config) {
				if (data.bedrock_mantle_key_config._auth_type === "api_key") {
					return isSecretVarSet(data.value);
				}
				return true;
			}
			// Azure requires API key only when using api_key auth
			if (data.azure_key_config) {
				if (data.azure_key_config._auth_type === "api_key") {
					return isSecretVarSet(data.value);
				}
				return true;
			}
			// Bedrock only requires API key when using api_key auth
			if (data.bedrock_key_config) {
				if (data.bedrock_key_config._auth_type === "api_key") {
					return isSecretVarSet(data.value);
				}
				return true;
			}
			// Vertex requires API key only when using api_key auth
			if (data.vertex_key_config) {
				if (data.vertex_key_config._auth_type === "api_key") {
					return isSecretVarSet(data.value);
				}
				return true;
			}
			// Otherwise, value is required
			return isSecretVarSet(data.value);
		},
		{
			message: "请填写 API 密钥",
			path: ["value"],
		},
	);

// Network config schema
export const networkConfigSchema = z
	.object({
		base_url: z.union([z.string().url("请输入有效的 URL"), z.string().length(0)]).optional(),
		extra_headers: z.record(z.string(), z.string()).optional(),
		default_request_timeout_in_seconds: z
			.number()
			.min(1, "超时时间必须大于 0 秒")
			.max(3600, "超时时间必须小于 3600 秒"),
		max_retries: z.number().min(0, "最大重试次数必须大于 0").max(10, "最大重试次数必须小于 10"),
		retry_backoff_initial: z.number().min(100),
		retry_backoff_max: z.number().min(100),
		insecure_skip_verify: z.boolean().optional(),
		ca_cert_pem: secretVarSchema.optional(),
		stream_idle_timeout_in_seconds: z
			.number()
			.int("流式空闲超时必须为整数秒")
			.min(5, "流式空闲超时不得小于 5 秒")
			.max(3600, "流式空闲超时不得大于 3600 秒（即 60 分钟）")
			.optional(),
		keep_alive_timeout_in_seconds: z
			.number()
			.int("Keep-Alive 超时必须为整数秒")
			.min(1, "Keep-Alive 超时不得小于 1 秒")
			.max(3600, "Keep-Alive 超时不得大于 3600 秒（即 60 分钟）")
			.optional(),
		max_conns_per_host: z
			.number()
			.int("最大连接数必须为整数")
			.min(1, "最大连接数不得小于 1")
			.max(10000, "最大连接数不得大于 10000")
			.optional(),
		enforce_http2: z.boolean().optional(),
		http2_ping_interval_in_seconds: z
			.number()
			.int("HTTP/2 ping 间隔必须为整数秒")
			.min(0, "HTTP/2 ping 间隔不得小于 0 秒")
			.max(3600, "HTTP/2 ping 间隔不得大于 3600 秒（即 60 分钟）")
			.optional(),
		allow_private_network: z.boolean().optional(),
	})
	.refine((d) => d.retry_backoff_initial <= d.retry_backoff_max, {
		message: "初始退避必须小于或等于最大退避",
		path: ["retry_backoff_initial"],
	});

// Network form schema - more lenient for form inputs
export const networkFormConfigSchema = z
	.object({
		base_url: z
			.union([
				z
					.string()
					.url("请输入有效的 URL")
					.refine((url) => url.startsWith("https://") || url.startsWith("http://"), {
						message: "请输入有效的 HTTP 或 HTTPS URL",
					}),
				z.string().length(0),
			])
			.optional(),
		extra_headers: z.record(z.string(), z.string()).optional(),
		default_request_timeout_in_seconds: z.coerce
			.number("超时时间必须为数字")
			.min(1, "超时时间必须大于 0 秒")
			.max(172800, "超时时间必须小于 172800 秒（即 48 小时）"),
		max_retries: z.coerce
			.number("最大重试次数必须为数字")
			.min(0, "最大重试次数必须大于 0")
			.max(10, "最大重试次数必须小于 10"),
		retry_backoff_initial: z.coerce
			.number("初始退避必须为数字")
			.min(100, "初始退避不得小于 100ms")
			.max(1000000, "初始退避不得大于 1000000ms"),
		retry_backoff_max: z.coerce
			.number("最大退避必须为数字")
			.min(100, "最大退避不得小于 100ms")
			.max(1000000, "最大退避不得大于 1000000ms"),
		insecure_skip_verify: z.boolean().optional(),
		ca_cert_pem: secretVarSchema.optional(),
		stream_idle_timeout_in_seconds: z.coerce
			.number("流式空闲超时必须为数字")
			.int("流式空闲超时必须为整数秒")
			.min(5, "流式空闲超时不得小于 5 秒")
			.max(3600, "流式空闲超时不得大于 3600 秒（即 60 分钟）")
			.optional(),
		keep_alive_timeout_in_seconds: z.coerce
			.number("Keep-Alive 超时必须为数字")
			.int("Keep-Alive 超时必须为整数秒")
			.min(1, "Keep-Alive 超时不得小于 1 秒")
			.max(3600, "Keep-Alive 超时不得大于 3600 秒（即 60 分钟）")
			.optional(),
		max_conns_per_host: z.coerce
			.number("最大连接数必须为数字")
			.int("最大连接数必须为整数")
			.min(1, "最大连接数不得小于 1")
			.max(10000, "最大连接数不得大于 10000")
			.optional(),
		enforce_http2: z.boolean().optional(),
		http2_ping_interval_in_seconds: z.coerce
			.number("HTTP/2 ping 间隔必须为数字")
			.int("HTTP/2 ping 间隔必须为整数秒")
			.min(0, "HTTP/2 ping 间隔不得小于 0 秒")
			.max(3600, "HTTP/2 ping 间隔不得大于 3600 秒（即 60 分钟）")
			.optional(),
		allow_private_network: z.boolean().optional(),
	})
	.refine((d) => d.retry_backoff_initial <= d.retry_backoff_max, {
		message: "初始退避必须小于或等于最大退避",
		path: ["retry_backoff_initial"],
	});

// Concurrency and buffer size schema
export const concurrencyAndBufferSizeSchema = z.object({
	concurrency: z.number().min(1, "并发数必须大于 0").max(100, "并发数不得大于 100"),
	buffer_size: z.number().min(1, "缓冲区大小必须大于 0").max(1000, "缓冲区大小不得大于 1000"),
});

// Proxy type schema
export const proxyTypeSchema = z.enum(["none", "http", "socks5", "environment"]);

// Proxy config schema
export const proxyConfigSchema = z
	.object({
		type: proxyTypeSchema,
		url: secretVarSchema.optional(),
		username: secretVarSchema.optional(),
		password: secretVarSchema.optional(),
		ca_cert_pem: secretVarSchema.optional(),
	})
	.refine(
		(data) =>
			!(data.type === "http" || data.type === "socks5") ||
			data.url?.type === "env" ||
			data.url?.type === "vault" ||
			(data.url?.value && data.url.value.trim().length > 0),
		{
			message: "使用 HTTP 或 SOCKS5 代理时必须填写代理 URL",
			path: ["url"],
		},
	)
	.refine(
		(data) => {
			if ((data.type === "http" || data.type === "socks5") && data.url?.value?.trim()) {
				if (isRedacted(data.url.value)) {
					return true;
				}
				try {
					new URL(data.url.value);
					return true;
				} catch {
					return false;
				}
			}
			return true;
		},
		{
			message: "请输入有效的 URL（例如 http://proxy.example.com:8080）",
			path: ["url"],
		},
	);

// Proxy form schema - more lenient for form inputs with conditional validation
export const proxyFormConfigSchema = z
	.object({
		type: proxyTypeSchema,
		url: secretVarSchema.optional(),
		username: secretVarSchema.optional(),
		password: secretVarSchema.optional(),
		ca_cert_pem: secretVarSchema.optional(),
	})
	.refine(
		(data) => {
			if (data.type === "none") {
				return true;
			}
			// URL is required when proxy type is http or socks5
			if (data.type === "http" || data.type === "socks5") {
				// Env-backed URLs may have empty resolved value before env resolution.
				if (!!(data.url?.type && data.url?.type !== "plain_text") || data.url?.ref) return true;
				// Literal URLs must be non-empty.
				if (!data.url?.value || data.url.value.trim().length === 0) return false;
			}
			return true;
		},
		{
			message: "使用 HTTP 或 SOCKS5 代理时必须填写代理 URL",
			path: ["url"],
		},
	)
	.refine(
		(data) => {
			// URL must be valid format when provided and proxy type requires it
			if ((data.type === "http" || data.type === "socks5") && data.url?.value && data.url.value.trim().length > 0) {
				if (isRedacted(data.url.value)) {
					return true;
				}
				try {
					new URL(data.url.value);
					return true;
				} catch {
					return false;
				}
			}
			return true;
		},
		{
			message: "请输入有效的 URL（例如 http://proxy.example.com:8080）",
			path: ["url"],
		},
	);

// OpenAI Config tab
export const openaiConfigFormSchema = z.object({
	disable_store: z.boolean(),
});

export type OpenAIConfigFormSchema = z.infer<typeof openaiConfigFormSchema>;

// Allowed requests schema
export const allowedRequestsSchema = z.object({
	text_completion: z.boolean(),
	text_completion_stream: z.boolean(),
	chat_completion: z.boolean(),
	chat_completion_stream: z.boolean(),
	responses: z.boolean(),
	responses_stream: z.boolean(),
	responses_retrieve: z.boolean().optional(),
	responses_delete: z.boolean().optional(),
	responses_cancel: z.boolean().optional(),
	responses_input_items: z.boolean().optional(),
	embedding: z.boolean(),
	speech: z.boolean(),
	speech_stream: z.boolean(),
	transcription: z.boolean(),
	transcription_stream: z.boolean(),
	image_generation: z.boolean(),
	image_generation_stream: z.boolean(),
	image_edit: z.boolean(),
	image_edit_stream: z.boolean(),
	image_variation: z.boolean(),
	ocr: z.boolean().optional(),
	ocr_stream: z.boolean().optional(),
	rerank: z.boolean(),
	video_generation: z.boolean(),
	video_retrieve: z.boolean(),
	video_download: z.boolean(),
	video_delete: z.boolean(),
	video_list: z.boolean(),
	video_remix: z.boolean(),
	count_tokens: z.boolean(),
	list_models: z.boolean(),
	websocket_responses: z.boolean(),
	realtime: z.boolean(),
});

// Custom provider config schema
export const customProviderConfigSchema = z
	.object({
		base_provider_type: knownProviderSchema,
		is_key_less: z.boolean().optional(),
		allowed_requests: allowedRequestsSchema.optional(),
		request_path_overrides: z.record(z.string(), z.string().optional()).optional(),
	})
	.refine(
		(data) => {
			if (data.base_provider_type === "bedrock") {
				return !data.is_key_less;
			}
			return true;
		},
		{
			message: "Bedrock 不支持无需密钥模式",
			path: ["is_key_less"],
		},
	);

// Form-specific custom provider config schema
export const formCustomProviderConfigSchema = z
	.object({
		base_provider_type: z.string().min(1, "请填写基础提供商类型"),
		is_key_less: z.boolean().optional(),
		allowed_requests: allowedRequestsSchema.optional(),
		request_path_overrides: z.record(z.string(), z.string().optional()).optional(),
	})
	.refine(
		(data) => {
			if (data.base_provider_type === "bedrock") {
				return !data.is_key_less;
			}
			return true;
		},
		{
			message: "Bedrock 不支持无需密钥模式",
			path: ["is_key_less"],
		},
	);

// Full model provider config schema
export const modelProviderConfigSchema = z.object({
	keys: z.array(modelProviderKeySchema).min(1, "请至少添加一个密钥"),
	network_config: networkConfigSchema.optional(),
	concurrency_and_buffer_size: concurrencyAndBufferSizeSchema.optional(),
	proxy_config: proxyConfigSchema.optional(),
	send_back_raw_request: z.boolean().optional(),
	send_back_raw_response: z.boolean().optional(),
	store_raw_request_response: z.boolean().optional(),
	custom_provider_config: customProviderConfigSchema.optional(),
});

// Model provider schema
export const modelProviderSchema = modelProviderConfigSchema.extend({
	name: modelProviderNameSchema,
});

// Form-specific model provider config schema
export const formModelProviderConfigSchema = z.object({
	keys: z.array(modelProviderKeySchema).min(1, "请至少添加一个密钥"),
	network_config: networkConfigSchema.optional(),
	concurrency_and_buffer_size: concurrencyAndBufferSizeSchema.optional(),
	proxy_config: proxyConfigSchema.optional(),
	send_back_raw_request: z.boolean().optional(),
	send_back_raw_response: z.boolean().optional(),
	store_raw_request_response: z.boolean().optional(),
	custom_provider_config: formCustomProviderConfigSchema.optional(),
});

// Flexible model provider schema for form data - allows any string for name
export const formModelProviderSchema = formModelProviderConfigSchema.extend({
	name: z.string().min(1, "请填写提供商名称"),
});

// Add provider request schema
export const addProviderRequestSchema = z.object({
	provider: modelProviderNameSchema,
	keys: z.array(modelProviderKeySchema).min(1, "请至少添加一个密钥"),
	network_config: networkConfigSchema.optional(),
	concurrency_and_buffer_size: concurrencyAndBufferSizeSchema.optional(),
	proxy_config: proxyConfigSchema.optional(),
	send_back_raw_request: z.boolean().optional(),
	send_back_raw_response: z.boolean().optional(),
	store_raw_request_response: z.boolean().optional(),
	custom_provider_config: customProviderConfigSchema.optional(),
	openai_config: openaiConfigFormSchema.optional(),
});

// Update provider request schema
export const updateProviderRequestSchema = z.object({
	keys: z.array(modelProviderKeySchema).min(1, "请至少添加一个密钥"),
	network_config: networkConfigSchema,
	concurrency_and_buffer_size: concurrencyAndBufferSizeSchema,
	proxy_config: proxyConfigSchema,
	send_back_raw_request: z.boolean().optional(),
	send_back_raw_response: z.boolean().optional(),
	store_raw_request_response: z.boolean().optional(),
	custom_provider_config: customProviderConfigSchema.optional(),
	openai_config: openaiConfigFormSchema.optional(),
});

// Cache config schema
const baseCacheConfigSchema = z.object({
	ttl: z.number().int().min(1).default(3600),
	threshold: z.number().min(0).max(1).default(0.8),
	conversation_history_threshold: z.number().int().min(0).optional(),
	exclude_system_prompt: z.boolean().optional(),
	cache_by_model: z.boolean().default(false),
	cache_by_provider: z.boolean().default(false),
	vector_store_namespace: z.string().min(1).optional(),
	default_cache_key: z.string().min(1).optional(),
	created_at: z.string().optional(),
	updated_at: z.string().optional(),
});

const directCacheConfigSchema = baseCacheConfigSchema
	.extend({
		dimension: z.literal(1),
		keys: z.array(modelProviderKeySchema).optional(),
	})
	.strict();

const providerBackedCacheConfigSchema = baseCacheConfigSchema
	.extend({
		provider: modelProviderNameSchema,
		keys: z.array(modelProviderKeySchema).optional(),
		embedding_model: z.string().min(1, "请填写向量化模型"),
		dimension: z.number().int().min(2, "提供商支持的语义缓存维度必须大于 1"),
	})
	.strict();

export const cacheConfigSchema = z.union([directCacheConfigSchema, providerBackedCacheConfigSchema]);

// Core config schema
export const coreConfigSchema = z.object({
	drop_excess_requests: z.boolean().default(false),
	initial_pool_size: z.number().min(1).default(10),
	prometheus_labels: z.array(z.string()).default([]),
	enable_logging: z.boolean().default(true),
	disable_content_logging: z.boolean().default(false),
	enforce_auth_on_inference: z.boolean().default(false),
	hide_deleted_virtual_keys_in_filters: z.boolean().default(false),
	allowed_origins: z.array(z.string()).default(["*"]),
	max_request_body_size_mb: z.number().min(1).default(100),
	mcp_agent_depth: z.number().min(1).default(10),
	mcp_tool_execution_timeout: z.number().min(1).default(30),
	mcp_code_mode_binding_level: z.enum(["server", "tool"]).default("server"),
	mcp_disable_auto_tool_inject: z.boolean().default(false),
	mcp_enable_temp_token_auth: z.boolean().default(false),
});

// Bifrost config schema
export const bifrostConfigSchema = z.object({
	client_config: coreConfigSchema,
	is_db_connected: z.boolean(),
	is_cache_connected: z.boolean(),
	is_logs_connected: z.boolean(),
	is_git_available: z.boolean().optional().default(false),
});

// Network and proxy form schema - combined for the NetworkFormFragment
export const networkAndProxyFormSchema = z.object({
	network_config: networkFormConfigSchema.optional(),
	proxy_config: proxyFormConfigSchema.optional(),
});

// Proxy-only form schema for the ProxyFormFragment
export const proxyOnlyFormSchema = z.object({
	proxy_config: proxyFormConfigSchema.optional(),
});

// Network-only form schema for the NetworkFormFragment
export const networkOnlyFormSchema = z.object({
	network_config: networkFormConfigSchema.optional(),
});

// Performance form schema for the PerformanceFormFragment (concurrency/buffer only; raw request/response are in Debugging tab)
export const performanceFormSchema = z.object({
	concurrency_and_buffer_size: z
		.object({
			concurrency: z
				.number({ error: "并发数必须为数字" })
				.min(1, "并发数必须大于 0")
				.max(100000, "并发数必须小于 100000"),
			buffer_size: z
				.number({ error: "缓冲区大小必须为数字" })
				.min(1, "缓冲区大小必须大于 0")
				.max(100000, "缓冲区大小必须小于 100000"),
		})
		.refine((data) => data.concurrency <= data.buffer_size, {
			message: "并发数不得大于缓冲区大小",
			path: ["concurrency"],
		}),
});

// Debugging tab (raw request/response toggles)
export const debuggingFormSchema = z.object({
	send_back_raw_request: z.boolean(),
	send_back_raw_response: z.boolean(),
	store_raw_request_response: z.boolean(),
});

export type DebuggingFormSchema = z.infer<typeof debuggingFormSchema>;

// Beta Headers tab
export const betaHeadersFormSchema = z.object({
	beta_header_overrides: z.record(z.string(), z.boolean()).optional(),
});

export type BetaHeadersFormSchema = z.infer<typeof betaHeadersFormSchema>;

// OTEL Configuration Schema
export const otelConfigSchema = z
	.object({
		// Per-profile enable toggle. A disabled profile exports nothing and is not validated.
		enabled: z.boolean().default(true),
		service_name: z.string().optional(),
		collector_url: secretVarSchema.default({ value: "" }),
		trace_type: z
			.enum(["genai_extension", "vercel", "open_inference"], {
				message: "请选择追踪类型",
			})
			.default("genai_extension"),
		headers: z.record(z.string(), secretVarSchema).optional(),
		protocol: z
			.enum(["http", "grpc"], {
				message: "请选择协议",
			})
			.default("http"),
		// TLS configuration
		tls_ca_cert: z.string().optional(),
		insecure: z.boolean().default(true),
		// Bounds a single trace export. gRPC exports have no other timeout, so an
		// endpoint that accepts the connection but never replies would otherwise block
		// an export goroutine indefinitely.
		export_timeout: z.number().int().min(1).max(60).default(5),
		// Metrics push configuration
		metrics_enabled: z.boolean().default(false),
		metrics_endpoint: secretVarSchema.optional(),
		metrics_push_interval: z.number().int().min(1).max(300).default(15),
		request_headers: z.array(z.string()).default([]),
		disable_content_logging: z.boolean().default(false),
		group_traces_by_session: z.boolean().default(false),
		disable_root_span_content: z.boolean().default(false),
	})
	.superRefine((data, ctx) => {
		// A disabled profile is not sent anywhere, so skip all validation for it.
		if (data.enabled === false) return;

		const protocol = data.protocol;
		const hostPortRegex = /^(?!https?:\/\/)([a-zA-Z0-9.-]+|\[[0-9a-fA-F:]+\]|\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/;

		// Helper to validate URL format
		const validateHttpUrl = (url: string, path: string[]) => {
			try {
				const u = new URL(url);
				if (!(u.protocol === "http:" || u.protocol === "https:")) {
					ctx.addIssue({
						code: "custom",
						path,
						message: "请输入有效的 HTTP 或 HTTPS URL",
					});
					return false;
				}
				return true;
			} catch {
				ctx.addIssue({
					code: "custom",
					path,
					message: "请输入有效的 HTTP 或 HTTPS URL",
				});
				return false;
			}
		};

		// Helper to validate host:port format
		const validateHostPort = (value: string, path: string[], example: string) => {
			const match = value.match(hostPortRegex);
			if (!match) {
				ctx.addIssue({
					code: "custom",
					path,
					message: `gRPC 地址格式必须为 <host>:<port>（例如 ${example}）`,
				});
				return false;
			}
			const port = Number(match[2]);
			if (!(port >= 1 && port <= 65535)) {
				ctx.addIssue({
					code: "custom",
					path,
					message: "端口必须在 1 到 65535 之间",
				});
				return false;
			}
			return true;
		};

		// Collector address is required for an enabled profile.
		if (!isSecretVarSet(data.collector_url)) {
			ctx.addIssue({
				code: "custom",
				path: ["collector_url"],
				message: "请填写采集器地址",
			});
		}

		// Validate collector_url format — skip format check for env var references
		const collectorUrl = (data.collector_url?.value || "").trim();
		if (collectorUrl && (data.collector_url?.type === "plain_text" || !data.collector_url?.type) && protocol === "http") {
			validateHttpUrl(collectorUrl, ["collector_url"]);
		} else if (collectorUrl && (data.collector_url?.type === "plain_text" || !data.collector_url?.type) && protocol === "grpc") {
			validateHostPort(collectorUrl, ["collector_url"], "otel-collector:4317");
		}

		// Validate metrics_endpoint when metrics_enabled is true
		if (data.metrics_enabled) {
			const metricsEndpoint = (data.metrics_endpoint?.value || "").trim();
			if (!isSecretVarSet(data.metrics_endpoint)) {
				ctx.addIssue({
					code: "custom",
					path: ["metrics_endpoint"],
					message: "启用指标推送时必须填写指标端点",
				});
			} else if (metricsEndpoint && (data.metrics_endpoint?.type === "plain_text" || !data.metrics_endpoint?.type) && protocol === "http") {
				validateHttpUrl(metricsEndpoint, ["metrics_endpoint"]);
			} else if (metricsEndpoint && (data.metrics_endpoint?.type === "plain_text" || !data.metrics_endpoint?.type) && protocol === "grpc") {
				validateHostPort(metricsEndpoint, ["metrics_endpoint"], "otel-collector:4317");
			}
		}
	});

// OTEL form schema for the OtelFormFragment. The plugin itself is gated by `enabled`;
// it carries one or more export profiles, each independently enable-able.
export const otelFormSchema = z.object({
	enabled: z.boolean().default(true),
	profiles: z.array(otelConfigSchema).min(1, "请至少添加一个配置"),
});

// Maxim Configuration Schema
export const maximConfigSchema = z.object({
	api_key: z.string().default(""),
	log_repo_id: z.string().optional(),
	request_headers: z.array(z.string()).default([]),
});

// Maxim form schema for the MaximFormFragment
export const maximFormSchema = z
	.object({
		enabled: z.boolean().default(true),
		maxim_config: maximConfigSchema,
	})
	.superRefine((data, ctx) => {
		if (data.enabled) {
			const apiKey = (data.maxim_config.api_key || "").trim();
			if (!apiKey) {
				ctx.addIssue({
					code: "custom",
					path: ["maxim_config", "api_key"],
					message: "请填写 API 密钥",
				});
			} else if (!apiKey.startsWith("sk_mx_")) {
				ctx.addIssue({
					code: "custom",
					path: ["maxim_config", "api_key"],
					message: "API 密钥必须以 'sk_mx_' 开头",
				});
			}
		}
	});

// MCP Client update schema
export const mcpClientUpdateSchema = z.object({
	is_code_mode_client: z.boolean().optional(),
	is_ping_available: z.boolean().optional(),
	allow_on_all_virtual_keys: z.boolean().optional(),
	disabled: z.boolean().optional(),
	name: z
		.string()
		.min(1, "请填写名称")
		.refine((val) => !val.includes("-"), {
			message: "客户端名称不能包含连字符",
		})
		.refine((val) => !val.includes(" "), {
			message: "客户端名称不能包含空格",
		})
		.refine((val) => !/^[0-9]/.test(val), {
			message: "客户端名称不能以数字开头",
		}),
	headers: z.record(z.string(), secretVarSchema).optional().nullable(),
	per_user_header_keys: z
		.array(z.string().trim().min(1, "请求头名称不能为空"))
		.optional()
		.refine(
			(headers) => {
				if (!headers) return true;
				const normalized = headers.map((h) => h.trim().toLowerCase());
				return normalized.length === new Set(normalized).size;
			},
			{ message: "请求头名称不能重复" },
		),
	tools_to_execute: z
		.array(z.string())
		.optional()
		.refine(
			(tools) => {
				if (!tools || tools.length === 0) return true;
				const hasWildcard = tools.includes("*");
				return !hasWildcard || tools.length === 1;
			},
			{ message: "通配符 '*' 不能与其他工具名称同时使用" },
		)
		.refine(
			(tools) => {
				if (!tools) return true;
				return tools.length === new Set(tools).size;
			},
			{ message: "工具名称不能重复" },
		),
	tools_to_auto_execute: z
		.array(z.string())
		.optional()
		.refine(
			(tools) => {
				if (!tools || tools.length === 0) return true;
				const hasWildcard = tools.includes("*");
				return !hasWildcard || tools.length === 1;
			},
			{ message: "通配符 '*' 不能与其他工具名称同时使用" },
		)
		.refine(
			(tools) => {
				if (!tools) return true;
				return tools.length === new Set(tools).size;
			},
			{ message: "工具名称不能重复" },
		),
	tool_pricing: z.record(z.string(), z.number().min(0, "成本不能为负数")).optional(),
	tool_sync_interval: z.number().optional(), // -1 = disabled, 0 = use global, >0 = custom interval in minutes
	tool_execution_timeout: z.number().int().min(0).optional(), // 0 = use global, >0 = per-server timeout in seconds
	allowed_extra_headers: z
		.array(z.string())
		.optional()
		.refine(
			(headers) => {
				if (!headers || headers.length === 0) return true;
				const hasWildcard = headers.includes("*");
				return !hasWildcard || headers.length === 1;
			},
			{ message: "通配符 '*' 不能与具体请求头名称同时使用" },
		),
	oauth_config: z
		.object({
			client_id: secretVarSchema.optional(),
			client_secret: secretVarSchema.optional(),
		})
		.optional(),
	tls_config: z
		.object({
			insecure_skip_verify: z.boolean().optional(),
			ca_cert_pem: secretVarSchema.optional(),
		})
		.optional(),
});

// Global proxy type schema
export const globalProxyTypeSchema = z.enum(["http", "socks5", "tcp"]);

// Global proxy configuration schema
export const globalProxyConfigSchema = z
	.object({
		enabled: z.boolean(),
		type: globalProxyTypeSchema,
		url: z.string(),
		username: z.string().optional(),
		password: z.string().optional(),
		ca_cert_pem: z.string().optional(),
		no_proxy: z.string().optional(),
		timeout: z.number().min(0).optional(),
		skip_tls_verify: z.boolean().optional(),
		enable_for_scim: z.boolean(),
		enable_for_inference: z.boolean(),
		enable_for_api: z.boolean(),
	})
	.refine(
		(data) => {
			// URL is required when proxy is enabled
			if (data.enabled && (!data.url || data.url.trim().length === 0)) {
				return false;
			}
			return true;
		},
		{
			message: "启用代理时必须填写代理 URL",
			path: ["url"],
		},
	)
	.refine(
		(data) => {
			// Validate URL format when provided and enabled
			if (data.enabled && data.url && data.url.trim().length > 0) {
				try {
					new URL(data.url);
					return true;
				} catch {
					return false;
				}
			}
			return true;
		},
		{
			message: "请输入有效的 URL（例如 http://proxy.example.com:8080）",
			path: ["url"],
		},
	);

// Global proxy form schema for the ProxyView
export const globalProxyFormSchema = z.object({
	proxy_config: globalProxyConfigSchema,
});

// Global header filter configuration schema
// Controls which headers with the x-bf-eh-* prefix are forwarded to LLM providers
export const globalHeaderFilterConfigSchema = z.object({
	allowlist: z.array(z.string()).optional(), // If non-empty, only these headers are allowed
	denylist: z.array(z.string()).optional(), // Headers to always block
});

// Global header filter form schema for the HeaderFilterView
export const globalHeaderFilterFormSchema = z.object({
	header_filter_config: globalHeaderFilterConfigSchema,
});

// Routing rule creation schema
export const routingRuleSchema = z
	.object({
		name: z.string().min(1, "请填写规则名称").max(255, "规则名称不能超过 255 个字符"),
		description: z.string().max(1000, "描述不能超过 1000 个字符").optional(),
		cel_expression: z.string().optional(),
		provider: z.string().min(1, "请选择提供商"),
		model: z.string().optional(),
		fallbacks: z.array(z.string()).optional().default([]),
		scope: z.enum(["global", "team", "customer", "virtual_key"]),
		scope_id: z.string().optional(),
		priority: z.number().min(0, "优先级必须大于或等于 0").max(1000, "优先级必须小于或等于 1000"),
		enabled: z.boolean().default(true),
		chain_rule: z.boolean().default(false),
	})
	.refine((data) => data.scope === "global" || (data.scope_id != null && data.scope_id.trim() !== ""), {
		message: "范围不为全局时，必须填写范围 ID",
		path: ["scope_id"],
	});

// Budget override form schema (BudgetOverrideDialog)
export const budgetOverrideFormSchema = z
	.object({
		amount: z.number("追加预算必须大于 0。").positive("追加预算必须大于 0。"),
		mode: z.enum(["cycles", "forever"]),
		cycles: z.number().optional(),
	})
	.refine((data) => data.mode !== "cycles" || (data.cycles !== undefined && Number.isSafeInteger(data.cycles) && data.cycles > 0), {
		message: "重置周期数必须为正整数。",
		path: ["cycles"],
	});

// Export type inference helpers
export type SecretVar = z.infer<typeof secretVarSchema>;
export type MCPClientUpdateSchema = z.infer<typeof mcpClientUpdateSchema>;
export type ModelProviderKeySchema = z.infer<typeof modelProviderKeySchema>;
export type NetworkConfigSchema = z.infer<typeof networkConfigSchema>;
export type NetworkFormConfigSchema = z.infer<typeof networkFormConfigSchema>;
export type ProxyFormConfigSchema = z.infer<typeof proxyFormConfigSchema>;
export type NetworkAndProxyFormSchema = z.infer<typeof networkAndProxyFormSchema>;
export type ProxyOnlyFormSchema = z.infer<typeof proxyOnlyFormSchema>;
export type OtelConfigSchema = z.infer<typeof otelConfigSchema>;
export type OtelFormSchema = z.infer<typeof otelFormSchema>;
export type MaximConfigSchema = z.infer<typeof maximConfigSchema>;
export type MaximFormSchema = z.infer<typeof maximFormSchema>;
export type NetworkOnlyFormSchema = z.infer<typeof networkOnlyFormSchema>;
export type PerformanceFormSchema = z.infer<typeof performanceFormSchema>;
export type CustomProviderConfigSchema = z.infer<typeof customProviderConfigSchema>;
export type GlobalProxyConfigSchema = z.infer<typeof globalProxyConfigSchema>;
export type GlobalProxyFormSchema = z.infer<typeof globalProxyFormSchema>;
export type GlobalHeaderFilterConfigSchema = z.infer<typeof globalHeaderFilterConfigSchema>;
export type GlobalHeaderFilterFormSchema = z.infer<typeof globalHeaderFilterFormSchema>;
export type RoutingRuleSchema = z.infer<typeof routingRuleSchema>;
export type BudgetOverrideFormSchema = z.infer<typeof budgetOverrideFormSchema>;