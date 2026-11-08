import { CheckCircle2 } from "lucide-react";

export default function MCPSessionsAuthSuccessPage() {
	return (
		<div className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center justify-center p-6">
			<div className="bg-card w-full rounded-sm border p-8 text-center shadow-sm">
				<div className="bg-primary/10 mx-auto mb-5 flex size-12 items-center justify-center rounded-full">
					<CheckCircle2 className="text-primary size-6" />
				</div>
				<h1 className="text-xl font-semibold tracking-tight">认证成功</h1>
				<p className="text-muted-foreground mt-2 text-sm">
					您的凭据已保存。您可以关闭此标签页并返回 MCP 客户端，后续请求会自动使用此凭据。
				</p>
			</div>
		</div>
	);
}