import { Button } from "@/components/ui/button";
import { Building } from "lucide-react";
import { ArrowUpRight } from "lucide-react";

const TEAMS_DOCS_URL = "https://docs.getbifrost.ai/features/governance/virtual-keys#teams";

interface TeamsEmptyStateProps {
	onAddClick: () => void;
	canCreate?: boolean;
}

export function TeamsEmptyState({ onAddClick, canCreate = true }: TeamsEmptyStateProps) {
	return (
		<div className="flex min-h-[80vh] w-full flex-col items-center justify-center gap-4 py-16 text-center">
			<div className="text-muted-foreground">
				<Building className="h-[5.5rem] w-[5.5rem]" strokeWidth={1} />
			</div>
			<div className="flex flex-col gap-1">
				<h1 className="text-muted-foreground text-xl font-medium">团队用于组织用户并共享预算与访问权限</h1>
				<div className="text-muted-foreground mx-auto mt-2 max-w-[600px] text-sm font-normal">
					创建团队，对用户分组、关联客户账户，并在团队层级设置预算和速率限制。
				</div>
				<div className="mx-auto mt-6 flex flex-row flex-wrap items-center justify-center gap-2">
					<Button
						variant="outline"
						aria-label="了解更多关于团队的信息（在新标签页打开）"
						data-testid="team-button-read-more"
						onClick={() => {
							window.open(`${TEAMS_DOCS_URL}?utm_source=bfd`, "_blank", "noopener,noreferrer");
						}}
					>
						了解更多 <ArrowUpRight className="text-muted-foreground h-3 w-3" />
					</Button>
					<Button aria-label="添加第一个团队" onClick={onAddClick} disabled={!canCreate} data-testid="team-button-add">
						添加团队
					</Button>
				</div>
			</div>
		</div>
	);
}