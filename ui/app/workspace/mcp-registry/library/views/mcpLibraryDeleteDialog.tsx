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
import type { MCPLibraryEntry } from "@/lib/types/mcp";

interface MCPLibraryDeleteDialogProps {
	/** The entry being removed; when null the dialog is closed. */
	server: MCPLibraryEntry | null;
	open: boolean;
	isDeleting: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	confirmTestId: string;
}

// Shared confirmation dialog for soft-deleting a library entry, used by both the
// card and table views. Copy is sync-aware: custom entries simply disappear,
// while remote entries are tombstoned so they don't reappear on the next sync.
export function MCPLibraryDeleteDialog({ server, open, isDeleting, onOpenChange, onConfirm, confirmTestId }: MCPLibraryDeleteDialogProps) {
	const isCustom = server?.source === "custom";

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>从服务器库移除“{server?.name}”？</AlertDialogTitle>
					<AlertDialogDescription>
						{isCustom
							? "此后成员将无法再安装此自定义服务器。"
							: "此服务器将从服务器库中隐藏，并且在下次目录同步时不会重新出现。"}{" "}
						已有的安装不受影响。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
					<AlertDialogAction
						onClick={(event) => {
							event.preventDefault();
							onConfirm();
						}}
						disabled={isDeleting}
						data-testid={confirmTestId}
					>
						{isDeleting ? "正在移除..." : "移除"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}