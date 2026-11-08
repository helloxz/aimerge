/**
 * Complexity Router Type Definitions
 * Mirrors the AnalyzerConfig shape exchanged with /governance/complexity-analyzer-config.
 */

export interface TierBoundaries {
	simple_medium: number;
	medium_complex: number;
	complex_reasoning: number;
}

export interface EditableKeywordConfig {
	code_keywords: string[];
	reasoning_keywords: string[];
	technical_keywords: string[];
	simple_keywords: string[];
}

export interface AnalyzerConfig {
	tier_boundaries: TierBoundaries;
	keywords: EditableKeywordConfig;
}

export type KeywordListKey = keyof EditableKeywordConfig;

export const COMPLEXITY_TIER_VALUES = ["SIMPLE", "MEDIUM", "COMPLEX", "REASONING"] as const;

export const KEYWORD_LIST_DEFINITIONS: Array<{
	key: KeywordListKey;
	label: string;
	description: string;
}> = [
	{
		key: "simple_keywords",
		label: "简单关键词",
		description: "会让请求偏向 SIMPLE 层级的短语（问候、闲聊、常识问答）。",
	},
	{
		key: "code_keywords",
		label: "代码关键词",
		description: "表明请求涉及代码、调试或编程产物的信号。",
	},
	{
		key: "technical_keywords",
		label: "技术关键词",
		description: "会提高复杂度评分的架构、基础设施与运维术语。",
	},
	{
		key: "reasoning_keywords",
		label: "推理关键词",
		description: "强推理触发词。命中这些短语时，可将层级选择覆盖为 REASONING 层级。",
	},
];

export const COMPLEXITY_TIER_LABELS: Record<(typeof COMPLEXITY_TIER_VALUES)[number], string> = {
	SIMPLE: "简单",
	MEDIUM: "中等",
	COMPLEX: "复杂",
	REASONING: "推理",
};

export const DEFAULT_TIER_BOUNDARIES: TierBoundaries = {
	simple_medium: 0.15,
	medium_complex: 0.35,
	complex_reasoning: 0.6,
};