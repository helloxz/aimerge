import { Info } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

interface ConfigSyncAlertProps {
	className?: string;
}

export function ConfigSyncAlert({ className }: ConfigSyncAlertProps) {
	return (
		<Alert variant="info" className={className}>
			<Info className="h-4 w-4" />
			<AlertDescription>
				<p>
					此配置从 <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">config.json</code> 同步。今后对 config.json 的任何更新都会覆盖 UI 中的改动。若您使用 config.json 初始化配置，可忽略此提示。
				</p>
			</AlertDescription>
		</Alert>
	);
}