import { ExternalLink, Video } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { BifrostVideoDownloadOutput, BifrostVideoGenerationOutput, BifrostVideoListOutput } from "@/lib/types/logs";

import CollapsibleBox from "./collapsibleBox";
import { CodeEditor } from "@/components/ui/codeEditor";

interface VideoGenerationInput {
	prompt: string;
}

type VideoOutput = BifrostVideoGenerationOutput | BifrostVideoDownloadOutput;

interface VideoViewProps {
	videoInput?: VideoGenerationInput;
	videoOutput?: VideoOutput;
	videoListOutput?: BifrostVideoListOutput;
	requestType?: string;
}

function getMethodTypeLabel(requestType?: string): string {
	if (!requestType) return "视频";
	const normalized = requestType.toLowerCase();
	if (normalized.includes("video_download")) return "视频下载";
	if (normalized.includes("video_retrieve")) return "视频查询";
	if (normalized.includes("video_generation")) return "视频生成";
	if (normalized.includes("video_list")) return "视频列表";
	return "视频";
}

export default function VideoView({ videoInput, videoOutput, videoListOutput, requestType }: VideoViewProps) {
	const methodTypeLabel = getMethodTypeLabel(requestType);
	const isDownload = requestType?.toLowerCase().includes("video_download");
	const downloadOutput = isDownload && videoOutput ? (videoOutput as BifrostVideoDownloadOutput) : null;
	const generationOutput = !isDownload && videoOutput ? (videoOutput as BifrostVideoGenerationOutput) : null;
	const outputURL = generationOutput?.videos?.[0]?.url;

	return (
		<div className="space-y-4">
			{videoInput && (
				<div className="w-full rounded-sm border">
					<div className="flex items-center gap-2 border-b px-6 py-2 text-sm font-medium">
						<Video className="h-4 w-4" />
						{methodTypeLabel} 输入
					</div>
					<div className="space-y-2 p-6">
						<div className="text-muted-foreground text-xs font-medium">提示词</div>
						<div className="font-mono text-xs">{videoInput.prompt}</div>
					</div>
				</div>
			)}

			{videoOutput && (
				<div className="w-full rounded-sm border">
					<div className="flex items-center gap-2 border-b px-6 py-2 text-sm font-medium">
						<Video className="h-4 w-4" />
						{methodTypeLabel} 输出
					</div>
					<div className="space-y-3 p-6">
						{downloadOutput ? (
							<>
								<div className="grid grid-cols-3 gap-3">
									{downloadOutput.video_id && (
										<div className="space-y-1">
											<div className="text-muted-foreground text-xs font-medium">视频 ID</div>
											<div className="font-mono text-xs break-all">{downloadOutput.video_id}</div>
										</div>
									)}
									{downloadOutput.content_type && (
										<div className="space-y-1">
											<div className="text-muted-foreground text-xs font-medium">内容类型</div>
											<div className="font-mono text-xs">{downloadOutput.content_type}</div>
										</div>
									)}
								</div>
								<p className="text-muted-foreground text-xs">视频内容已成功下载（内容不存储在日志中）</p>
							</>
						) : generationOutput ? (
							<>
								<div className="grid grid-cols-3 gap-3">
									{generationOutput.status && (
										<div className="space-y-1">
											<div className="text-muted-foreground text-xs font-medium">状态</div>
											<Badge variant="secondary" className="uppercase">
												{generationOutput.status}
											</Badge>
										</div>
									)}
									{generationOutput.progress !== undefined && (
										<div className="space-y-1">
											<div className="text-muted-foreground text-xs font-medium">进度</div>
											<div className="font-mono text-xs">{generationOutput.progress}%</div>
										</div>
									)}
									{generationOutput.id && (
										<div className="space-y-1">
											<div className="text-muted-foreground text-xs font-medium">视频 ID</div>
											<div className="font-mono text-xs break-all">{generationOutput.id}</div>
										</div>
									)}
								</div>

								{generationOutput.error && (generationOutput.error.message || generationOutput.error.code) && (
									<div className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
										<div className="space-y-1">
											<div className="text-muted-foreground font-medium">提供商返回的错误</div>
											{generationOutput.error.code && <div className="font-medium">{generationOutput.error.code}</div>}
											{generationOutput.error.message && <div className="text-muted-foreground">{generationOutput.error.message}</div>}
										</div>
									</div>
								)}

								{outputURL && (
									<div className="space-y-2">
										<video className="w-full rounded-sm border bg-black" controls preload="metadata" src={outputURL}>
											<track kind="captions" />
										</video>
										<a
											href={outputURL}
											target="_blank"
											rel="noopener noreferrer"
											className="text-primary inline-flex items-center gap-1 text-xs underline"
										>
											打开视频 URL
											<ExternalLink className="h-3 w-3" />
										</a>
									</div>
								)}
							</>
						) : null}
					</div>
				</div>
			)}

			{videoListOutput && (
				<CollapsibleBox
					title={`视频列表输出（${videoListOutput.data?.length ?? 0}）`}
					onCopy={() => JSON.stringify(videoListOutput, null, 2)}
				>
					<CodeEditor
						className="z-0 w-full"
						shouldAdjustInitialHeight={true}
						maxHeight={450}
						wrap={true}
						code={JSON.stringify(videoListOutput.data, null, 2)}
						lang="json"
						readonly={true}
						options={{ scrollBeyondLastLine: false, lineNumbers: "off", alwaysConsumeMouseWheel: false }}
					/>
				</CollapsibleBox>
			)}
		</div>
	);
}