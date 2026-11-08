import { cn } from "@/lib/utils";
import { ShieldX } from "lucide-react";

interface NoPermissionViewProps {
	entity: string;
	className?: string;
	align?: "middle" | "top";
}

export function NoPermissionView({ entity, className, align = "middle" }: NoPermissionViewProps) {
	return (
		<div
			className={cn(
				"flex min-h-[calc(100vh-200px)] flex-col items-center  gap-4 text-center",
				align === "middle" ? "justify-center" : "justify-start",
				className,
			)}
		>
			<div className="text-muted-foreground">
				<ShieldX className="h-16 w-16" strokeWidth={1} />
			</div>
			<div className="flex flex-col items-center gap-1">
				<h1 className="text-muted-foreground text-xl font-medium">您没有查看{entity}的权限</h1>
				<p className="text-muted-foreground mt-2 max-w-[400px] text-sm font-normal">
					请联系管理员申请访问此资源。
				</p>
			</div>
		</div>
	);
}