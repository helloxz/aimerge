import { CodeEditor } from "@/components/ui/codeEditor";
import { ResponsesMessage, ResponsesMessageContentBlock } from "@/lib/types/logs";
import { cleanJson, isJson } from "@/lib/utils/validation";
import CollapsibleBox from "./collapsibleBox";

interface LogResponsesMessageViewProps {
	messages: ResponsesMessage[];
}

const responsesRoleLabels: Record<string, string> = {
	user: "用户",
	assistant: "助手",
	system: "系统",
	developer: "开发者",
	tool: "工具",
};

function ContentBlockView({ block }: { block: ResponsesMessageContentBlock; index: number }) {
	const getBlockTitle = (type: string) => {
		switch (type) {
			case "input_text":
				return "输入文本";
			case "input_image":
				return "输入图片";
			case "input_file":
				return "输入文件";
			case "input_audio":
				return "输入音频";
			case "output_text":
				return "输出文本";
			case "reasoning_text":
				return "推理文本";
			case "refusal":
				return "拒答";
			default:
				return type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
		}
	};

	const blockTitle = getBlockTitle(block.type);

	// Handle text content
	if (block.text) {
		if (isJson(block.text)) {
			const jsonContent = JSON.stringify(cleanJson(block.text), null, 2);
			return (
				<CollapsibleBox title={blockTitle} onCopy={() => jsonContent} collapsedHeight={100}>
					<CodeEditor
						className="z-0 w-full"
						shouldAdjustInitialHeight={true}
						maxHeight={200}
						wrap={true}
						code={jsonContent}
						lang="json"
						readonly={true}
						options={{ scrollBeyondLastLine: false, collapsibleBlocks: true, lineNumbers: "off", alwaysConsumeMouseWheel: false }}
					/>
				</CollapsibleBox>
			);
		}
		return (
			<CollapsibleBox title={blockTitle} onCopy={() => block.text || ""} collapsedHeight={100}>
				<div className="custom-scrollbar max-h-[400px] overflow-y-auto px-6 py-2 font-mono text-xs whitespace-pre-wrap">{block.text}</div>
			</CollapsibleBox>
		);
	}

	// Handle image content
	if (block.image_url) {
		const jsonContent = JSON.stringify(
			{
				image_url: block.image_url,
				...(block.detail && { detail: block.detail }),
			},
			null,
			2,
		);
		return (
			<CollapsibleBox title={blockTitle} onCopy={() => jsonContent} collapsedHeight={100}>
				<CodeEditor
					className="z-0 w-full"
					shouldAdjustInitialHeight={true}
					maxHeight={150}
					wrap={true}
					code={jsonContent}
					lang="json"
					readonly={true}
					options={{ scrollBeyondLastLine: false, collapsibleBlocks: true, lineNumbers: "off", alwaysConsumeMouseWheel: false }}
				/>
			</CollapsibleBox>
		);
	}

	// Handle file content
	if (block.file_id || block.file_data || block.file_url) {
		const jsonContent = JSON.stringify(
			{
				...(block.filename && { filename: block.filename }),
				...(block.file_id && { file_id: block.file_id }),
				...(block.file_url && { file_url: block.file_url }),
				...(block.file_data && { file_data: "[Base64 编码数据]" }),
			},
			null,
			2,
		);
		return (
			<CollapsibleBox title={blockTitle} onCopy={() => jsonContent} collapsedHeight={100}>
				<CodeEditor
					className="z-0 w-full"
					shouldAdjustInitialHeight={true}
					maxHeight={150}
					wrap={true}
					code={jsonContent}
					lang="json"
					readonly={true}
					options={{ scrollBeyondLastLine: false, collapsibleBlocks: true, lineNumbers: "off", alwaysConsumeMouseWheel: false }}
				/>
			</CollapsibleBox>
		);
	}

	// Handle audio content
	if (block.input_audio) {
		const jsonContent = JSON.stringify(block.input_audio, null, 2);
		return (
			<CollapsibleBox title={blockTitle} onCopy={() => jsonContent} collapsedHeight={100}>
				<CodeEditor
					className="z-0 w-full"
					shouldAdjustInitialHeight={true}
					maxHeight={150}
					wrap={true}
					code={jsonContent}
					lang="json"
					readonly={true}
					options={{ scrollBeyondLastLine: false, collapsibleBlocks: true, lineNumbers: "off", alwaysConsumeMouseWheel: false }}
				/>
			</CollapsibleBox>
		);
	}

	// Handle refusal content
	if (block.refusal) {
		return (
			<CollapsibleBox title={blockTitle} onCopy={() => block.refusal || ""} collapsedHeight={100}>
				<div className="custom-scrollbar max-h-[400px] overflow-y-auto px-6 py-2 font-mono text-xs text-red-800">{block.refusal}</div>
			</CollapsibleBox>
		);
	}

	// Handle annotations
	if (block.annotations && block.annotations.length > 0) {
		const jsonContent = JSON.stringify(block.annotations, null, 2);
		return (
			<CollapsibleBox title="标注" onCopy={() => jsonContent} collapsedHeight={100}>
				<CodeEditor
					className="z-0 w-full"
					shouldAdjustInitialHeight={true}
					maxHeight={150}
					wrap={true}
					code={jsonContent}
					lang="json"
					readonly={true}
					options={{ scrollBeyondLastLine: false, collapsibleBlocks: true, lineNumbers: "off", alwaysConsumeMouseWheel: false }}
				/>
			</CollapsibleBox>
		);
	}

	// Handle log probabilities
	if (block.logprobs && block.logprobs.length > 0) {
		const jsonContent = JSON.stringify(block.logprobs, null, 2);
		return (
			<CollapsibleBox title="对数概率" onCopy={() => jsonContent} collapsedHeight={100}>
				<CodeEditor
					className="z-0 w-full"
					shouldAdjustInitialHeight={true}
					maxHeight={150}
					wrap={true}
					code={jsonContent}
					lang="json"
					readonly={true}
					options={{ scrollBeyondLastLine: false, collapsibleBlocks: true, lineNumbers: "off", alwaysConsumeMouseWheel: false }}
				/>
			</CollapsibleBox>
		);
	}

	return null;
}

function MessageView({ message, index }: { message: ResponsesMessage; index: number }) {
	const getMessageTitle = () => {
		if (message.type) {
			switch (message.type) {
				case "reasoning":
					return "推理";
				case "message": {
					if (!message.role) return "消息";
					const labeledRole = responsesRoleLabels[message.role];
					return labeledRole ? `${labeledRole}消息` : `${message.role} 消息`;
				}
				case "function_call":
					return `函数调用：${message.name || "未知"}`;
				case "function_call_output":
					return `函数调用输出${message.call_id ? `：${message.call_id}` : ""}`;
				case "file_search_call":
					return "文件搜索";
				case "web_search_call":
					return "网络搜索";
				case "computer_call":
					return "计算机操作";
				case "computer_call_output":
					return "计算机操作输出";
				case "code_interpreter_call":
					return "代码解释器";
				case "mcp_call":
					return "MCP 工具调用";
				case "custom_tool_call":
					return "自定义工具调用";
				case "custom_tool_call_output":
					return "自定义工具输出";
				case "image_generation_call":
					return "图片生成";
				case "refusal":
					return "拒答";
				default:
					return message.type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
			}
		}
		return message.role ? `${responsesRoleLabels[message.role] ?? message.role}` : "消息";
	};

	if (message.type == "reasoning" && (!message.summary || message.summary.length === 0) && !message.encrypted_content && !message.content) {
		return null;
	}

	const messageTitle = getMessageTitle();

	return (
		<div key={`message-${index}`} className="flex w-full flex-col gap-2">
			{/* Message title header */}
			<div className="text-sm font-medium">{messageTitle}</div>

			{/* Handle reasoning content */}
			{message.type === "reasoning" && message.summary && message.summary.length > 0 && (
				<>
					{message.summary.every((item) => item.type === "summary_text") ? (
						// Display as readable text when all items are summary_text
						message.summary.map((reasoningContent, idx) => (
							<CollapsibleBox key={idx} title={`摘要 #${idx + 1}`} onCopy={() => reasoningContent.text || ""} collapsedHeight={100}>
								<div className="custom-scrollbar max-h-[400px] overflow-y-auto px-6 py-2 font-mono text-xs whitespace-pre-wrap">
									{reasoningContent.text}
								</div>
							</CollapsibleBox>
						))
					) : (
						// Fallback to JSON display for mixed or non-text types
						<CollapsibleBox title="摘要" onCopy={() => JSON.stringify(message.summary, null, 2)} collapsedHeight={100}>
							<CodeEditor
								className="z-0 w-full"
								shouldAdjustInitialHeight={true}
								maxHeight={300}
								wrap={true}
								code={JSON.stringify(message.summary, null, 2)}
								lang="json"
								readonly={true}
								options={{ scrollBeyondLastLine: false, collapsibleBlocks: true, lineNumbers: "off", alwaysConsumeMouseWheel: false }}
							/>
						</CollapsibleBox>
					)}
				</>
			)}

			{/* Handle encrypted reasoning content */}
			{message.type === "reasoning" && message.encrypted_content && (
				<CollapsibleBox title="加密的推理内容" onCopy={() => message.encrypted_content || ""} collapsedHeight={100}>
					<div className="custom-scrollbar max-h-[400px] overflow-y-auto px-6 py-2 font-mono text-xs break-words whitespace-pre-wrap">
						{message.encrypted_content}
					</div>
				</CollapsibleBox>
			)}

			{/* Handle regular content */}
			{message.content && (
				<>
					{typeof message.content === "string" ? (
						<>
							{isJson(message.content) ? (
								<CollapsibleBox
									title="内容"
									onCopy={() => JSON.stringify(cleanJson(message.content as string), null, 2)}
									collapsedHeight={100}
								>
									<CodeEditor
										className="z-0 w-full"
										shouldAdjustInitialHeight={true}
										maxHeight={250}
										wrap={true}
										code={JSON.stringify(cleanJson(message.content), null, 2)}
										lang="json"
										readonly={true}
										options={{ scrollBeyondLastLine: false, collapsibleBlocks: true, lineNumbers: "off", alwaysConsumeMouseWheel: false }}
									/>
								</CollapsibleBox>
							) : (
								<CollapsibleBox title="内容" onCopy={() => (message.content as string) || ""} collapsedHeight={100}>
									<div className="custom-scrollbar max-h-[400px] overflow-y-auto px-6 py-2 font-mono text-xs break-words whitespace-pre-wrap">
										{message.content}
									</div>
								</CollapsibleBox>
							)}
						</>
					) : (
						Array.isArray(message.content) &&
						message.content.map((block, blockIndex) => <ContentBlockView key={blockIndex} block={block} index={blockIndex} />)
					)}
				</>
			)}

			{/* Handle tool call specific fields */}
			{(message.call_id || message.name || message.arguments) && (
				<CollapsibleBox
					title="工具详情"
					onCopy={() =>
						JSON.stringify(
							{
								...(message.call_id && { call_id: message.call_id }),
								...(message.name && { name: message.name }),
								...(message.arguments && { arguments: isJson(message.arguments) ? cleanJson(message.arguments) : message.arguments }),
							},
							null,
							2,
						)
					}
					collapsedHeight={100}
				>
					<CodeEditor
						className="z-0 w-full"
						shouldAdjustInitialHeight={true}
						maxHeight={400}
						wrap={true}
						code={JSON.stringify(
							{
								...(message.call_id && { call_id: message.call_id }),
								...(message.name && { name: message.name }),
								...(message.arguments && { arguments: isJson(message.arguments) ? cleanJson(message.arguments) : message.arguments }),
							},
							null,
							2,
						)}
						lang="json"
						readonly={true}
						options={{ scrollBeyondLastLine: false, collapsibleBlocks: true, lineNumbers: "off", alwaysConsumeMouseWheel: false }}
					/>
				</CollapsibleBox>
			)}

			{/* Handle function call output */}
			{message.output !== undefined && (
				<CollapsibleBox
					title="输出"
					onCopy={() => (typeof message.output === "string" ? message.output : JSON.stringify(message.output, null, 2))}
					collapsedHeight={100}
				>
					{typeof message.output === "string" ? (
						isJson(message.output) ? (
							<CodeEditor
								className="z-0 w-full"
								shouldAdjustInitialHeight={true}
								maxHeight={400}
								wrap={true}
								code={JSON.stringify(cleanJson(message.output), null, 2)}
								lang="json"
								readonly={true}
								options={{ scrollBeyondLastLine: false, lineNumbers: "off", alwaysConsumeMouseWheel: false }}
							/>
						) : (
							<div className="custom-scrollbar max-h-[400px] overflow-y-auto px-6 py-2 font-mono text-xs break-words whitespace-pre-wrap">
								{message.output}
							</div>
						)
					) : (
						<CodeEditor
							className="z-0 w-full"
							shouldAdjustInitialHeight={true}
							maxHeight={400}
							wrap={true}
							code={JSON.stringify(message.output, null, 2)}
							lang="json"
							readonly={true}
							options={{ scrollBeyondLastLine: false, lineNumbers: "off", alwaysConsumeMouseWheel: false }}
						/>
					)}
				</CollapsibleBox>
			)}

			{/* Handle additional tool-specific fields */}
			{Object.keys(message).some(
				(key) =>
					!["id", "type", "status", "role", "content", "call_id", "name", "arguments", "summary", "encrypted_content", "output"].includes(
						key,
					),
			) && (
				<CollapsibleBox
					title="其他字段"
					onCopy={() =>
						JSON.stringify(
							Object.fromEntries(
								Object.entries(message).filter(
									([key]) =>
										![
											"id",
											"type",
											"status",
											"role",
											"content",
											"call_id",
											"name",
											"arguments",
											"summary",
											"encrypted_content",
											"output",
										].includes(key),
								),
							),
							null,
							2,
						)
					}
					collapsedHeight={100}
				>
					<CodeEditor
						className="z-0 w-full"
						shouldAdjustInitialHeight={true}
						maxHeight={400}
						wrap={true}
						code={JSON.stringify(
							Object.fromEntries(
								Object.entries(message).filter(
									([key]) =>
										![
											"id",
											"type",
											"status",
											"role",
											"content",
											"call_id",
											"name",
											"arguments",
											"summary",
											"encrypted_content",
											"output",
										].includes(key),
								),
							),
							null,
							2,
						)}
						lang="json"
						readonly={true}
						options={{ scrollBeyondLastLine: false, collapsibleBlocks: true, lineNumbers: "off", alwaysConsumeMouseWheel: false }}
					/>
				</CollapsibleBox>
			)}
		</div>
	);
}

export default function LogResponsesMessageView({ messages }: LogResponsesMessageViewProps) {
	if (!messages || messages.length === 0) {
		return (
			<div className="w-full rounded-sm border">
				<div className="text-muted-foreground px-6 py-4 text-center text-sm">暂无响应消息</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{messages.map((message, index) => (
				<MessageView key={index} message={message} index={index} />
			))}
		</div>
	);
}