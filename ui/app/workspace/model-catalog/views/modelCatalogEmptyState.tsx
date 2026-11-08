import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";

export function ModelCatalogEmptyState() {
	return (
		<div className="flex min-h-[80vh] w-full flex-col items-center justify-center gap-4 py-16 text-center">
			<div className="text-muted-foreground">
				<LayoutGrid className="h-[5.5rem] w-[5.5rem]" strokeWidth={1} />
			</div>
			<div className="flex flex-col gap-1">
				<h1 className="text-muted-foreground text-xl font-medium">尚未配置任何提供商</h1>
				<div className="text-muted-foreground mx-auto mt-2 max-w-[600px] text-sm font-normal">
					配置你的第一个模型提供商，即可查看所有提供商、API 密钥、模型与用量指标的总览。
				</div>
				<div className="mx-auto mt-6 flex flex-row flex-wrap items-center justify-center gap-2">
					<Button asChild data-testid="modelcatalog-configure-providers-cta">
						<Link to="/workspace/providers">配置提供商</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}