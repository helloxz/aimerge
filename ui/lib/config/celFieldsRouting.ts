/**
 * CEL Fields Configuration for Routing Rules
 * Defines available fields for building routing rule expressions
 */

import { getProviderLabel } from "@/lib/constants/logs";
import { COMPLEXITY_TIER_LABELS, COMPLEXITY_TIER_VALUES } from "@/lib/types/complexityRouter";

export interface CELFieldDefinition {
	name: string;
	label: string;
	placeholder?: string;
	inputType?: "text" | "select" | "keyValue" | "number";
	valueEditorType?:
	| "text"
	| "select"
	| "keyValue"
	| "number"
	| "textarea"
	| "budgetNumber"
	| ((operator: string) => "text" | "select" | "keyValue" | "number" | "textarea" | "budgetNumber");
	operators?: string[];
	defaultOperator?: string;
	defaultValue?: any;
	values?: Array<{ name: string; label: string; disabled?: boolean }>;
	metricOptions?: Array<{ name: string; label: string }>; // For budgetNumber type
	description?: string; // Helpful note for the user
}

export const baseRoutingFields: CELFieldDefinition[] = [
	{
		name: "model",
		label: "模型",
		placeholder: "例如 gpt-4、claude-3-sonnet",
		inputType: "text",
		valueEditorType: (operator: string) =>
			operator === "=" || operator === "!=" ? "select" : operator === "in" || operator === "notIn" ? "select" : "text",
		operators: ["=", "!=", "in", "notIn", "contains", "beginsWith", "endsWith", "matches"],
		defaultOperator: "=",
	},
	{
		name: "provider",
		label: "提供商",
		placeholder: "选择提供商",
		inputType: "select",
		valueEditorType: (operator: string) =>
			operator === "matches" ? "text" : operator === "in" || operator === "notIn" ? "select" : "select",
		operators: ["=", "!=", "in", "notIn", "matches", "null", "notNull"],
		defaultOperator: "=",
	},
	{
		name: "request_type",
		label: "请求类型",
		placeholder: "选择请求类型",
		inputType: "select",
		valueEditorType: (operator: string) =>
			operator === "matches" ? "text" : operator === "in" || operator === "notIn" ? "select" : "select",
		operators: ["=", "!=", "in", "notIn", "matches"],
		defaultOperator: "=",
		values: [
			{ name: "text_completion", label: "文本补全" },
			{ name: "text_completion_stream", label: "文本补全（流式）" },
			{ name: "chat_completion", label: "对话补全" },
			{ name: "chat_completion_stream", label: "对话补全（流式）" },
			{ name: "responses", label: "Responses" },
			{ name: "responses_stream", label: "Responses（流式）" },
			{ name: "embedding", label: "向量化" },
			{ name: "image_generation", label: "图像生成" },
			{ name: "image_generation_stream", label: "图像生成（流式）" },
			{ name: "image_edit", label: "图像编辑" },
			{ name: "image_edit_stream", label: "图像编辑（流式）" },
			{ name: "image_variation", label: "图像变体" },
			{ name: "speech", label: "语音" },
			{ name: "speech_stream", label: "语音（流式）" },
			{ name: "transcription", label: "转写" },
			{ name: "transcription_stream", label: "转写（流式）" },
			{ name: "count_tokens", label: "Token 计数" },
			{ name: "rerank", label: "重排" },
			{ name: "video_generation", label: "视频生成" },
		],
		description:
			"按 API 请求类型筛选规则（对话、文本、向量化、图像、音频等）。流式与非流式请求属于不同类型：如需覆盖某类请求的全部情况，请同时选择两者。",
	},
	{
		name: "headers",
		label: "请求头",
		placeholder: "例如 authorization、x-custom-header（使用小写）",
		inputType: "keyValue",
		valueEditorType: "keyValue",
		operators: ["=", "!=", "contains", "beginsWith", "endsWith", "matches", "null", "notNull"],
		defaultOperator: "=",
	},
	{
		name: "tokens_used",
		label: "已用 Token 占比（%）",
		placeholder: "例如 80",
		inputType: "text",
		valueEditorType: "number",
		operators: ["=", "!=", ">", "<", ">=", "<="],
		defaultOperator: ">=",
		description: "以百分比检查 Token 用量，取模型与提供商配置中的较高阈值。",
	},
	{
		name: "request",
		label: "请求占比（%）",
		placeholder: "例如 80",
		inputType: "text",
		valueEditorType: "number",
		operators: ["=", "!=", ">", "<", ">=", "<="],
		defaultOperator: ">=",
		description: "以百分比检查请求用量，取模型与提供商配置中的较高阈值。",
	},
	{
		name: "budget_used",
		label: "已用预算占比（%）",
		placeholder: "例如 50",
		inputType: "text",
		valueEditorType: "number",
		operators: ["=", "!=", ">", "<", ">=", "<="],
		defaultOperator: ">=",
		description: "以百分比检查预算用量，取模型与提供商配置中的较高阈值。",
	},
	{
		name: "complexity_tier",
		label: "复杂度层级",
		placeholder: "选择复杂度层级",
		inputType: "select",
		valueEditorType: "select",
		operators: ["=", "!=", "in", "notIn"],
		defaultOperator: "=",
		values: COMPLEXITY_TIER_VALUES.map((tier) => ({ name: tier, label: COMPLEXITY_TIER_LABELS[tier] })),
	},
	{
		name: "params",
		label: "查询参数",
		placeholder: "例如 api_key、user_id",
		inputType: "keyValue",
		valueEditorType: "keyValue",
		operators: ["=", "!=", "contains", "beginsWith", "endsWith", "matches", "null", "notNull"],
		defaultOperator: "=",
	},
];

/**
 * Get routing fields with dynamic providers and models
 * Provider field values are populated dynamically from available providers
 * Metric options for rate limits and budget are populated from available providers and models
 */
export function getRoutingFields(providers: string[] = [], models: string[] = []): CELFieldDefinition[] {
	// Create provider field values
	const providerValues =
		providers.length > 0
			? providers.map((provider) => ({
				name: provider,
				label: getProviderLabel(provider),
			}))
			: [{ name: "_no_providers", label: "未配置提供商", disabled: true }];

	// Create model field values
	const modelValues =
		models.length > 0
			? models.map((model) => ({
				name: model,
				label: model,
			}))
			: [];

	// Create metric options for scope input: providers + models
	const scopeOptions = [
		{ name: "", label: "（提供商级）" }, // Empty scope for provider-level
		...providers.map((provider) => ({
			name: provider,
			label: `${provider}（提供商）`,
		})),
		...models.map((model) => ({
			name: model,
			label: `${model}（模型）`,
		})),
	];

	// Update provider field with dynamic values and rate limit/budget fields with scope options
	const fieldsWithDynamicValues = baseRoutingFields.map((field) => {
		if (field.name === "provider") {
			return {
				...field,
				values: providerValues,
			};
		}
		if (field.name === "model") {
			return {
				...field,
				values: modelValues,
			};
		}
		if (field.name === "tokens_used" || field.name === "request" || field.name === "budget_used") {
			return {
				...field,
				metricOptions: scopeOptions,
			};
		}
		return field;
	});

	return fieldsWithDynamicValues;
}

export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
	openai: "OpenAI",
	anthropic: "Anthropic",
	azure: "Azure OpenAI",
	gemini: "Google Gemini",
	vertex: "Vertex AI",
	cohere: "Cohere",
};