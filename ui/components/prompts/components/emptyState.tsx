import { Button } from "@/components/ui/button";
import { ArrowUpRight, SquareTerminal } from "lucide-react";
import { usePromptContext } from "../context";

export function EmptyState() {
	const { setPromptSheet, canCreate } = usePromptContext();

	return (
		<div className="text-muted-foreground flex h-full items-center justify-center">
			<div className="text-center">
				<p className="text-lg font-medium">未选择提示词</p>
				<p className="text-sm">
					{canCreate ? (
						<>
							从侧边栏选择提示词，或{" "}
							<Button
								variant="link"
								className="h-auto p-0 text-sm"
								data-testid="empty-state-create-prompt-link"
								onClick={() => setPromptSheet({ open: true })}
							>
								新建一个
							</Button>
						</>
					) : (
						"从侧边栏选择一个提示词"
					)}
				</p>
			</div>
		</div>
	);
}

export function PromptsEmptyState() {
	const { setPromptSheet, canCreate } = usePromptContext();

	return (
		<div className="flex min-h-[80vh] w-full flex-col items-center justify-center gap-4 py-16 text-center">
			<div className="text-muted-foreground">
				<SquareTerminal className="h-[5.5rem] w-[5.5rem]" strokeWidth={1} />
			</div>
			<div className="flex flex-col gap-1">
				<h1 className="text-muted-foreground text-xl font-medium">构建、测试并为提示词创建版本</h1>
				<div className="text-muted-foreground mx-auto mt-2 max-w-[600px] text-sm font-normal">
					{canCreate
						? "创建提示词，在演练场中使用不同模型和参数进行测试，并为变更创建版本以便部署。"
						: "查看提示词，并在演练场中使用不同模型和参数进行测试。"}
				</div>
				<div className="mx-auto mt-6 flex flex-row flex-wrap items-center justify-center gap-2">
					<Button
						variant="outline"
						aria-label="了解提示词仓库的更多信息（在新标签页打开）"
						data-testid="empty-state-read-more"
						onClick={() => {
							window.open(`https://docs.getbifrost.ai/features/prompt-repository?utm_source=bfd`, "_blank", "noopener,noreferrer");
						}}
					>
						了解更多 <ArrowUpRight className="text-muted-foreground h-3 w-3" />
					</Button>
					{canCreate && (
						<Button
							aria-label="创建第一个提示词"
							data-testid="empty-state-create-prompt"
							onClick={() => setPromptSheet({ open: true })}
						>
							创建提示词
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}