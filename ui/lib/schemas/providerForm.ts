import { KnownProvidersNames } from "@/lib/constants/logs";
import { aliasConfigSchema, secretVarSchema } from "@/lib/types/schemas";
import { isValidAliases, isValidVertexAuthCredentials } from "@/lib/utils/validation";
import { z } from "zod";

// Base schemas for reusable types
const ProxyTypeSchema = z.enum(["none", "http", "socks5", "environment"]);

const ProxyConfigSchema = z
	.object({
		type: ProxyTypeSchema,
		url: z.string().optional(),
		username: z.string().optional(),
		password: z.string().optional(),
	})
	.superRefine((v, ctx) => {
		const needsUrl = v.type === "http" || v.type === "socks5";
		if (needsUrl && !(v.url && v.url.trim())) {
			ctx.addIssue({ code: "custom", path: ["url"], message: "使用 HTTP 或 SOCKS5 代理时必须填写代理 URL" });
		}
		const user = v.username?.trim();
		const pass = v.password?.trim();
		if ((user && !pass) || (pass && !user)) {
			ctx.addIssue({
				code: "custom",
				path: ["password"],
				message: "必须同时填写用户名和密码",
			});
		}
	});

const NetworkConfigSchema = z
	.object({
		base_url: z.string().optional(),
		extra_headers: z.record(z.string(), z.string()).optional(),
		default_request_timeout_in_seconds: z.number().min(1, "超时时间必须大于 0 秒"),
		max_retries: z.number().min(0, "最大重试次数不能为负数"),
		retry_backoff_initial: z.number(),
		retry_backoff_max: z.number(),
		insecure_skip_verify: z.boolean().optional(),
		ca_cert_pem: z.union([z.string(), secretVarSchema]).optional(),
		stream_idle_timeout_in_seconds: z.number().int().min(5).max(3600).optional(),
		keep_alive_timeout_in_seconds: z.number().int().min(1).max(3600).optional(),
		max_conns_per_host: z.number().int().min(1).max(10000).optional(),
		enforce_http2: z.boolean().optional(),
		http2_ping_interval_in_seconds: z.number().int().min(0).max(3600).optional(),
	})
	.refine((v) => v.retry_backoff_initial <= v.retry_backoff_max, {
		message: "初始退避必须小于或等于最大退避",
		path: ["retry_backoff_initial"],
	});

const ConcurrencyAndBufferSizeSchema = z
	.object({
		concurrency: z.number().min(1, "并发数必须大于 0"),
		buffer_size: z.number().min(1, "缓冲区大小必须大于 0"),
	})
	.refine((data) => data.concurrency <= data.buffer_size, {
		message: "并发数不得大于缓冲区大小",
		path: ["concurrency"],
	});

const AllowedRequestsSchema = z.object({
	text_completion: z.boolean(),
	chat_completion: z.boolean(),
	chat_completion_stream: z.boolean(),
	responses: z.boolean(),
	responses_stream: z.boolean(),
	embedding: z.boolean(),
	speech: z.boolean(),
	speech_stream: z.boolean(),
	transcription: z.boolean(),
	transcription_stream: z.boolean(),
});

// Key configuration schemas
const AzureKeyConfigSchema = z.object({
	endpoint: z.string().min(1, "Azure 密钥必须填写端点"),
	client_id: z.string().optional(),
	client_secret: z.string().optional(),
	tenant_id: z.string().optional(),
});

const VertexKeyConfigSchema = z.object({
	project_id: z.string().min(1, "Vertex AI 密钥必须填写项目 ID"),
	project_number: z.string().optional(),
	region: z.string().min(1, "Vertex AI 密钥必须填写区域"),
	auth_credentials: z
		.string()
		.optional()
		.refine((value) => !value || isValidVertexAuthCredentials(value), {
			message: "填写认证凭证时，必须为有效的 JSON 对象或 env.VAR 格式",
		}),
	force_single_region: z.boolean().optional(),
});

// S3 bucket configuration for Bedrock batch operations
const S3BucketConfigSchema = z.object({
	bucket_name: z.string().min(1, "请填写存储桶名称"),
	prefix: z.string().optional(),
	is_default: z.boolean().optional(),
});

const BatchS3ConfigSchema = z.object({
	buckets: z.array(S3BucketConfigSchema).optional(),
});

const BedrockKeyConfigSchema = z
	.object({
		access_key: z.string(),
		secret_key: z.string(),
		session_token: z.string().optional(),
		region: z.string().min(1, "Bedrock 密钥必须填写区域"),
		role_arn: z.string().optional(),
		external_id: z.string().optional(),
		session_name: z.string().optional(),
		batch_role_arn: z.string().optional(),
		arn: z.string().optional(),
		project_id: z.string().optional(),
		batch_s3_config: BatchS3ConfigSchema.optional(),
	})
	.refine(
		(data) => {
			const accessKey = data.access_key?.trim() || "";
			const secretKey = data.secret_key?.trim() || "";
			const bothEmpty = accessKey === "" && secretKey === "";
			const bothProvided = accessKey !== "" && secretKey !== "";

			// Either both empty (IAM role auth) or both provided (explicit credentials)
			if (!bothEmpty && !bothProvided) {
				return false;
			}

			// Check for session token when using IAM role path (both keys empty)
			const sessionToken = data.session_token?.trim() || "";
			if (bothEmpty && sessionToken !== "") {
				return false;
			}

			return true;
		},
		{
			message: "对于 Bedrock：请同时填写访问密钥和私有密钥，或将两者都留空以使用 IAM 角色认证",
			path: ["access_key"],
		},
	);

const BedrockMantleKeyConfigSchema = z
	.object({
		access_key: z.string(),
		secret_key: z.string(),
		session_token: z.string().optional(),
		region: z.string().min(1, "Bedrock Mantle 密钥必须填写区域"),
		role_arn: z.string().optional(),
		external_id: z.string().optional(),
		session_name: z.string().optional(),
		project_id: z.string().optional(),
	})
	.refine(
		(data) => {
			const accessKey = data.access_key?.trim() || "";
			const secretKey = data.secret_key?.trim() || "";
			const bothEmpty = accessKey === "" && secretKey === "";
			const bothProvided = accessKey !== "" && secretKey !== "";
			// A session token alone cannot sign SigV4 requests; reject it without both keys.
			const sessionToken = data.session_token?.trim() || "";
			if (bothEmpty && sessionToken !== "") {
				return false;
			}
			// Either both empty (IAM role auth) or both provided (explicit credentials)
			return bothEmpty || bothProvided;
		},
		{
			message: "对于 Bedrock Mantle：请同时填写访问密钥和私有密钥，或将两者都留空以使用 IAM 角色认证",
			path: ["access_key"],
		},
	);

const ReplicateKeyConfigSchema = z.object({
	use_deployments_endpoint: z.boolean(),
});

const KeySchema = z.object({
	id: z.string(),
	name: z.string().min(1, "请填写密钥名称"),
	value: z.string(),
	models: z.array(z.string()),
	weight: z.number().min(0.1, "密钥权重必须在 0.1 到 1 之间").max(1, "密钥权重必须在 0.1 到 1 之间"),
	aliases: z
		.record(z.string(), aliasConfigSchema)
		.optional()
		.refine((value) => !value || isValidAliases(value), { message: "每行部署都必须设置模型 ID" }),
	azure_key_config: AzureKeyConfigSchema.optional(),
	vertex_key_config: VertexKeyConfigSchema.optional(),
	bedrock_key_config: BedrockKeyConfigSchema.optional(),
	bedrock_mantle_key_config: BedrockMantleKeyConfigSchema.optional(),
	replicate_key_config: ReplicateKeyConfigSchema.optional(),
	use_for_batch_api: z.boolean().optional(),
});

// Main provider form schema
export const ProviderFormSchema = z
	.object({
		selectedProvider: z.string().min(1, "请选择提供商"),
		customProviderName: z.string().optional(),
		baseProviderType: z.enum([...KnownProvidersNames, ""]).optional(),
		keys: z.array(KeySchema),
		networkConfig: NetworkConfigSchema.optional(),
		performanceConfig: ConcurrencyAndBufferSizeSchema.optional(),
		proxyConfig: ProxyConfigSchema.optional(),
		sendBackRawResponse: z.boolean().default(false),
		allowedRequests: AllowedRequestsSchema.optional(),
		isDirty: z.boolean(),
	})
	.superRefine((data, ctx) => {
		// Custom provider validation
		const isCustomProvider =
			data.selectedProvider === "custom" ||
			!!data.customProviderName ||
			!!data.baseProviderType ||
			!KnownProvidersNames.includes(data.selectedProvider as (typeof KnownProvidersNames)[number]);

		if (isCustomProvider) {
			if (!data.customProviderName?.trim()) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "请填写自定义提供商名称",
					path: ["customProviderName"],
				});
			}

			if (!/^[a-z0-9_-]+$/.test(data.customProviderName?.trim() || "")) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "自定义提供商名称只能包含小写字母、数字以及 '-'、'_'（不能有空格）",
					path: ["customProviderName"],
				});
			}

			if (!data.baseProviderType) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "自定义提供商必须填写基础提供商类型",
					path: ["baseProviderType"],
				});
			}

			if (KnownProvidersNames.includes(data.customProviderName?.trim() as (typeof KnownProvidersNames)[number])) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "自定义提供商名称不能与标准提供商名称相同",
					path: ["customProviderName"],
				});
			}
		}

		// Base URL validation for specific providers
		const baseURLRequired = isCustomProvider;
		if (baseURLRequired) {
			if (!data.networkConfig?.base_url) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "该提供商必须填写 Base URL",
					path: ["networkConfig", "base_url"],
				});
			}

			if (data.networkConfig?.base_url && !/^https?:\/\/.+/.test(data.networkConfig.base_url)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Base URL 必须以 http:// 或 https:// 开头",
					path: ["networkConfig", "base_url"],
				});
			}
		}

		// Keys validation
		const keysRequired = data.selectedProvider === "custom" || !["ollama", "sgl"].includes(data.selectedProvider);
		if (keysRequired) {
			if (data.keys.length < 1) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "请至少添加一个 API 密钥",
					path: ["keys"],
				});
			}

			// Validate individual key values based on provider type
			const effectiveProviderType = data.baseProviderType || data.selectedProvider;
			data.keys.forEach((key, index) => {
				if (effectiveProviderType !== "vertex" && effectiveProviderType !== "bedrock" && !key.value.trim()) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "API 密钥值不能为空",
						path: ["keys", index, "value"],
					});
				}
			});
		}
	});

export type ProviderFormData = z.infer<typeof ProviderFormSchema>;