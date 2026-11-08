import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
} from "@/components/ui/alertDialog";
import { getErrorMessage, useDeletePluginMutation } from "@/lib/store";
import { Plugin } from "@/lib/types/plugins";
import { AlertDialogTitle } from "@radix-ui/react-alert-dialog";
import { toast } from "sonner";

interface Props {
	show: boolean;
	onCancel: () => void;
	onDelete: () => void;
	plugin: Plugin;
}

export default function ConfirmDeletePluginDialog({ show, onCancel, onDelete, plugin }: Props) {
	const [deletePlugin, { isLoading: isDeletingPlugin }] = useDeletePluginMutation();

	const onDeleteHandler = () => {
		deletePlugin(plugin.name)
			.unwrap()
			.then(() => {
				onDelete();
			})
			.catch((err) => {
				toast.error("删除插件失败", {
					description: getErrorMessage(err),
				});
			});
	};

	return (
		<AlertDialog open={show}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>删除插件</AlertDialogTitle>
					<AlertDialogDescription>
						确定要删除插件 "{plugin.name}" 吗？此操作无法撤销。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={onCancel}>取消</AlertDialogCancel>
					<AlertDialogAction onClick={onDeleteHandler} disabled={isDeletingPlugin}>
						{isDeletingPlugin ? "删除中…" : "删除"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}