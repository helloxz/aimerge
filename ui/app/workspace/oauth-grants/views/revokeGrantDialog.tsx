// Confirmation dialog for revoking an OAuth grant. Open/confirm are driven by
// the page; the copy explains that the refresh token stops rotating immediately
// while the current short-lived access token keeps working until it expires.

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alertDialog";

interface RevokeGrantDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}

export default function RevokeGrantDialog({ open, onOpenChange, onConfirm }: RevokeGrantDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>撤销此 OAuth 授权？</AlertDialogTitle>
					<AlertDialogDescription>
						此授权的刷新令牌将立即停止轮换，MCP 客户端无法再续期访问。其当前访问令牌是一个短期 JWT，在过期前（默认 10 分钟）仍可在{" "}
						<code className="rounded bg-muted px-1 py-0.5 text-xs">/mcp</code>{" "}
						端点使用；过期后该客户端将被完全断开，需重新通过 OAuth 授权同意流程连接。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel data-testid="oauth-grants-revoke-cancel-btn">
						取消
					</AlertDialogCancel>
					<AlertDialogAction
						data-testid="oauth-grants-revoke-confirm-btn"
						onClick={onConfirm}
					>
						撤销
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
