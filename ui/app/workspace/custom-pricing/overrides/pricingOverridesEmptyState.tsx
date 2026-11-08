import { Button } from "@/components/ui/button";
import { ArrowUpRight, SlidersHorizontal } from "lucide-react";

const PRICING_OVERRIDES_DOCS_URL = "https://docs.getbifrost.ai/features/governance/custom-pricing";

interface PricingOverridesEmptyStateProps {
	onCreateClick: () => void;
}

export function PricingOverridesEmptyState({ onCreateClick }: PricingOverridesEmptyStateProps) {
	return (
		<div
			className="flex min-h-[80vh] w-full flex-col items-center justify-center gap-4 py-16 text-center"
			data-testid="pricing-overrides-empty-state"
		>
			<div className="text-muted-foreground">
				<SlidersHorizontal className="h-[5.5rem] w-[5.5rem]" strokeWidth={1} />
			</div>
			<div className="flex flex-col gap-1">
				<h1 className="text-muted-foreground text-xl font-medium">定价覆盖可针对不同范围自定义成本统计</h1>
				<div className="text-muted-foreground mx-auto mt-2 max-w-[600px] text-sm font-normal">
					为指定提供商、密钥或虚拟密钥定义自定义的单 Token 价格，以准确反映你的协议费率。
				</div>
				<div className="mx-auto mt-6 flex flex-row flex-wrap items-center justify-center gap-2">
					<Button
						variant="outline"
						aria-label="了解定价覆盖的更多信息（在新标签页打开）"
						data-testid="pricing-overrides-button-read-more"
						onClick={() => {
							window.open(`${PRICING_OVERRIDES_DOCS_URL}?utm_source=bfd`, "_blank", "noopener,noreferrer");
						}}
					>
						了解更多 <ArrowUpRight className="text-muted-foreground h-3 w-3" />
					</Button>
					<Button aria-label="创建你的第一个定价覆盖" data-testid="pricing-override-create-btn" onClick={onCreateClick}>
						创建覆盖
					</Button>
				</div>
			</div>
		</div>
	);
}