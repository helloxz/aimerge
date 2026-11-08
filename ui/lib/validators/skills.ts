// Frontend quick-check validators for Skills Repository
// These run before any network request to give instant feedback.

export const MAX_SKILL_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_SKILL_FILE_SIZE_LABEL = "50 MB";

/** Reserved frontmatter keys that cannot be used in extra_frontmatter */
const RESERVED_FRONTMATTER_KEYS = new Set(["name", "description", "license", "compatibility", "metadata", "allowed-tools"]);

/** Skill name: lowercase alphanumeric + hyphens, 1-64 chars */
const SKILL_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Semver format: MAJOR.MINOR.PATCH with optional -suffix */
const SEMVER_REGEX = /^(\d+)\.(\d+)\.(\d+)(-[a-zA-Z0-9._-]+)?$/;

export interface ValidationError {
	field: string;
	message: string;
}

/** Validate skill name against Agent Skills spec */
export function validateSkillName(name: string): string | null {
	if (!name) return "请填写名称";
	if (name.length > 64) return "名称不能超过 64 个字符";
	if (!SKILL_NAME_REGEX.test(name)) {
		return "名称只能包含小写字母、数字和连字符（不能以连字符开头、结尾或连续出现）";
	}
	const reservedNames = ["all-skills", "all", "codex", "claude-code"];
	if (reservedNames.includes(name)) {
		return `"${name}" 是技能服务层保留的名称`;
	}
	return null;
}

/** Validate description (hard limit 1024 chars) */
export function validateDescription(description: string): string | null {
	if (!description || !description.trim()) return "请填写描述";
	if (description.length > 1024) return `描述超过 1024 字符限制（${description.length}/1024）`;
	return null;
}

/** Validate version string as semver */
export function validateVersion(version: string): string | null {
	if (!version) return "请填写版本号";
	const match = SEMVER_REGEX.exec(version);
	if (!match) return "版本号必须为 semver 格式（例如 1.0.0 或 1.0.0-beta.1）";
	const [, major, minor, patch] = match;
	if (parseInt(major) < 0 || parseInt(minor) < 0 || parseInt(patch) < 0) {
		return "版本号的各部分必须为非负整数";
	}
	return null;
}

/**
 * Parse a semver string into its numeric parts.
 * Returns null if the string is not valid semver.
 */
function parseSemver(version: string): { major: number; minor: number; patch: number; suffix: string } | null {
	const match = SEMVER_REGEX.exec(version);
	if (!match) return null;
	return {
		major: parseInt(match[1]),
		minor: parseInt(match[2]),
		patch: parseInt(match[3]),
		suffix: match[4] || "",
	};
}

/**
 * Compare two semver versions. Returns >0 if a > b, <0 if a < b, 0 if equal (ignoring suffix).
 */
function compareSemverNumeric(
	a: { major: number; minor: number; patch: number },
	b: { major: number; minor: number; patch: number },
): number {
	if (a.major !== b.major) return a.major - b.major;
	if (a.minor !== b.minor) return a.minor - b.minor;
	return a.patch - b.patch;
}

/**
 * Find the highest version string from a list of version strings.
 * Returns the highest by semver comparison, or the first if none parse.
 */
export function findHighestVersion(versions: string[]): string {
	if (versions.length === 0) return "0.0.0";
	let highest = versions[0];
	let highestParsed = parseSemver(highest);
	for (let i = 1; i < versions.length; i++) {
		const parsed = parseSemver(versions[i]);
		if (!parsed) continue;
		if (!highestParsed || compareSemverNumeric(parsed, highestParsed) > 0) {
			highest = versions[i];
			highestParsed = parsed;
		}
	}
	return highest;
}

/**
 * Check whether `newVersion` is a valid bump over `previousVersion`.
 * A valid bump means the new version is strictly different via numeric parts or suffix.
 * Returns null if the bump is valid, or an error message if not.
 */
export function validateVersionBump(newVersion: string, previousVersion: string): string | null {
	const prev = parseSemver(previousVersion);
	const next = parseSemver(newVersion);
	if (!prev || !next) return null; // let the format validator handle bad format

	// Numeric bump is always valid
	if (
		next.major > prev.major ||
		(next.major === prev.major && next.minor > prev.minor) ||
		(next.major === prev.major && next.minor === prev.minor && next.patch > prev.patch)
	) {
		return null;
	}

	// Same numeric parts — a different suffix is also a valid bump
	if (next.major === prev.major && next.minor === prev.minor && next.patch === prev.patch && next.suffix !== prev.suffix) {
		return null;
	}

	return `版本号必须与 ${previousVersion} 不同。请至少提升以下之一：主版本号（${prev.major + 1}.x.x）、次版本号（${prev.major}.${prev.minor + 1}.x）、补丁版本号（${prev.major}.${prev.minor}.${prev.patch + 1}），或更改后缀（例如 -beta.1）。`;
}

/** Validate extra_frontmatter keys don't conflict with reserved names */
export function validateExtraFrontmatter(json: string): string | null {
	if (!json || !json.trim()) return null;
	try {
		const parsed = JSON.parse(json);
		if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
			return "额外 Frontmatter 必须为 JSON 对象";
		}
		const conflicts = Object.keys(parsed).filter((k) => RESERVED_FRONTMATTER_KEYS.has(k));
		if (conflicts.length > 0) {
			return `不能使用保留键：${conflicts.join(", ")}`;
		}
		return null;
	} catch {
		return "无效的 JSON";
	}
}

/** Validate metadata is a flat key-value object with string values */
export function validateMetadata(json: string): string | null {
	if (!json || !json.trim()) return null;
	try {
		const parsed = JSON.parse(json);
		if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
			return "元数据必须为 JSON 对象";
		}
		for (const [key, value] of Object.entries(parsed)) {
			if (typeof key !== "string") return "元数据的键必须为字符串";
			if (typeof value !== "string") return `"${key}" 的元数据值必须为字符串`;
		}
		return null;
	} catch {
		return "无效的 JSON";
	}
}

/** Validate skill_md_body (non-empty required) */
export function validateSkillMdBody(body: string): {
	error: string | null;
	warning: string | null;
} {
	if (!body || !body.trim()) {
		return { error: "请填写 SKILL.md 正文", warning: null };
	}
	// Soft limit warning (no blocking)
	const warning =
		body.length > 50000
			? "该 SKILL.md 正文超过建议大小。建议将详细内容移至 references/ 下的文件，并在技能正文中链接引用。"
			: null;
	return { error: null, warning };
}

// Removed directory-specific file extension restrictions: skills can contain arbitrary
// top-level files and folders, and any supported source can live anywhere in the tree.
/** Validate file extension against directory constraints */
export function validateFileForDirectory(_filename: string, _directory: string): string | null {
	return null;
}

function utf8ByteLength(value: string): number {
	return new TextEncoder().encode(value).length;
}

function dataURLDecodedLength(value: string): number | null {
	const marker = ";base64,";
	const index = value.indexOf(marker);
	if (index < 0) return null;
	const payload = value.slice(index + marker.length).replace(/\s/g, "");
	if (!payload) return 0;
	const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
	return Math.floor((payload.length * 3) / 4) - padding;
}

export function validateSkillFileSize(sizeBytes: number): string | null {
	if (sizeBytes > MAX_SKILL_FILE_SIZE_BYTES) {
		return `文件超过 ${MAX_SKILL_FILE_SIZE_LABEL} 限制`;
	}
	return null;
}

/** Validate source type-specific fields */
export function validateSourceType(
	sourceType: string,
	values: {
		url?: string;
		filepath?: string;
		dataurl?: string;
		content?: string;
		upload_id?: string;
	},
): string | null {
	switch (sourceType) {
		case "url":
			if (!values.url) return "请填写 URL";
			if (!values.url.startsWith("http://") && !values.url.startsWith("https://")) {
				return "URL 必须以 http:// 或 https:// 开头";
			}
			return null;
		case "dataurl":
			if (!values.dataurl) return "请填写 Data URL";
			if (!values.dataurl.startsWith("data:") || !values.dataurl.includes(";base64,")) {
				return "Data URL 必须以 data: 开头并包含 ;base64,";
			}
			{
				const decodedLength = dataURLDecodedLength(values.dataurl);
				if (decodedLength != null) {
					const sizeErr = validateSkillFileSize(decodedLength);
					if (sizeErr) return sizeErr;
				}
			}
			return null;
		case "text":
			if (!values.content || !values.content.trim()) return "请填写文本内容";
			return validateSkillFileSize(utf8ByteLength(values.content));
		case "upload":
			return null; // Upload validation happens during the upload process
		default:
			return `未知的来源类型：${sourceType}`;
	}
}

/** Validate file basename (no separators, traversal, or reserved SKILL.md) */
export function validateFilename(filename: string): string | null {
	const value = filename.trim();
	if (!value) return "请填写文件名";
	if (value === "." || value === "..") return "文件名不能为 . 或 ..";
	if (value.includes("/") || value.includes("\\")) return "文件名不能包含目录";
	if (value.toLowerCase() === "skill.md") return "SKILL.md 由技能正文统一管理";
	return null;
}

/** Validate relative file path (no traversal, absolute paths, or reserved SKILL.md) */
export function validateFilePath(path: string | undefined): string | null {
	if (!path || !path.trim()) return "请填写文件路径";
	const value = path.trim();
	if (value.startsWith("/")) return "路径必须为相对路径（不能以 / 开头）";
	if (value.endsWith("/")) return "路径必须指向文件，不能指向目录";
	if (value.includes("\\")) return "路径只能使用正斜杠";
	const segments = value.split("/");
	if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
		return "路径不能包含空段、当前目录段或上级目录段";
	}
	if (segments.length === 1 && segments[0].toLowerCase() === "skill.md") {
		return "SKILL.md 由技能正文统一管理";
	}
	return null;
}

/** Run all validations and return errors */
export function validateSkillForm(data: {
	name: string;
	description: string;
	version: string;
	skill_md_body: string;
	extra_frontmatter_json?: string;
	metadata_json?: string;
}): ValidationError[] {
	const errors: ValidationError[] = [];

	const nameErr = validateSkillName(data.name);
	if (nameErr) errors.push({ field: "name", message: nameErr });

	const descErr = validateDescription(data.description);
	if (descErr) errors.push({ field: "description", message: descErr });

	const versionErr = validateVersion(data.version);
	if (versionErr) errors.push({ field: "version", message: versionErr });

	const bodyResult = validateSkillMdBody(data.skill_md_body);
	if (bodyResult.error) errors.push({ field: "skill_md_body", message: bodyResult.error });

	if (data.extra_frontmatter_json) {
		const efErr = validateExtraFrontmatter(data.extra_frontmatter_json);
		if (efErr) errors.push({ field: "extra_frontmatter", message: efErr });
	}

	if (data.metadata_json) {
		const mdErr = validateMetadata(data.metadata_json);
		if (mdErr) errors.push({ field: "metadata", message: mdErr });
	}

	return errors;
}