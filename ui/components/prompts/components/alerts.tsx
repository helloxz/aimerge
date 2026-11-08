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
import { usePromptContext } from "../context";

export function DeleteFolderDialog() {
	const { deleteFolderDialog, setDeleteFolderDialog, isDeletingFolder, handleDeleteFolder } = usePromptContext();

	return (
		<AlertDialog open={deleteFolderDialog.open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>删除文件夹</AlertDialogTitle>
					<AlertDialogDescription>
						确定要删除&quot;{deleteFolderDialog.folder?.name}&quot;吗？此操作还会删除该文件夹中的所有提示词、版本与会话，且无法撤销。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel
						data-testid="delete-folder-cancel"
						onClick={() => setDeleteFolderDialog({ open: false })}
						disabled={isDeletingFolder}
					>
						取消
					</AlertDialogCancel>
					<AlertDialogAction data-testid="delete-folder-confirm" onClick={handleDeleteFolder} disabled={isDeletingFolder}>
						{isDeletingFolder ? "删除中..." : "删除"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export function DeletePromptDialog() {
	const { deletePromptDialog, setDeletePromptDialog, isDeletingPrompt, handleDeletePrompt } = usePromptContext();

	return (
		<AlertDialog open={deletePromptDialog.open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>删除提示词</AlertDialogTitle>
					<AlertDialogDescription>
						确定要删除&quot;{deletePromptDialog.prompt?.name}&quot;吗？此操作还会删除所有版本与会话，且无法撤销。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel
						data-testid="delete-prompt-cancel"
						onClick={() => setDeletePromptDialog({ open: false })}
						disabled={isDeletingPrompt}
					>
						取消
					</AlertDialogCancel>
					<AlertDialogAction data-testid="delete-prompt-confirm" onClick={handleDeletePrompt} disabled={isDeletingPrompt}>
						{isDeletingPrompt ? "删除中..." : "删除"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}