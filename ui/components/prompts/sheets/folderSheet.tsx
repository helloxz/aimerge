import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/store";
import { useCreateFolderMutation, useUpdateFolderMutation } from "@/lib/store/apis/promptsApi";
import { Folder } from "@/lib/types/prompts";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

interface FolderFormData {
	name: string;
	description: string;
}

interface FolderSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	folder?: Folder;
	onSaved: () => void;
}

export function FolderSheet({ open, onOpenChange, folder, onSaved }: FolderSheetProps) {
	const [createFolder, { isLoading: isCreating }] = useCreateFolderMutation();
	const [updateFolder, { isLoading: isUpdating }] = useUpdateFolderMutation();

	const isLoading = isCreating || isUpdating;
	const isEditing = !!folder;

	const {
		register,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<FolderFormData>({
		defaultValues: { name: "", description: "" },
	});

	useEffect(() => {
		if (open) {
			reset({
				name: folder?.name ?? "",
				description: folder?.description ?? "",
			});
		}
	}, [open, folder, reset]);

	async function onSubmit(data: FolderFormData) {
		try {
			if (isEditing) {
				await updateFolder({
					id: folder.id,
					data: { name: data.name.trim(), description: data.description.trim() || undefined },
				}).unwrap();
				toast.success("文件夹已更新");
			} else {
				await createFolder({
					name: data.name.trim(),
					description: data.description.trim() || undefined,
				}).unwrap();
				toast.success("文件夹已创建");
			}
			onSaved();
			onOpenChange(false);
		} catch (err) {
			toast.error(`文件夹${isEditing ? "更新" : "创建"}失败`, {
				description: getErrorMessage(err),
			});
		}
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				className="p-8"
				onOpenAutoFocus={(e) => {
					e.preventDefault();
					document.getElementById("name")?.focus();
				}}
			>
				<form onSubmit={handleSubmit(onSubmit)}>
					<SheetHeader className="flex flex-col items-start">
						<SheetTitle>{isEditing ? "编辑文件夹" : "创建文件夹"}</SheetTitle>
						<SheetDescription>
							{isEditing ? "更新文件夹名称与描述。" : "创建新文件夹以整理您的提示词。"}
						</SheetDescription>
					</SheetHeader>

					<div className="mt-6 space-y-4">
						<div className="space-y-2">
							<Label htmlFor="name">名称</Label>
							<Input
								id="name"
								data-testid="folder-name-input"
								placeholder="我的提示词"
								{...register("name", {
									required: "文件夹名称不能为空",
									validate: (v) => v.trim().length > 0 || "文件夹名称不能为空白",
								})}
								autoFocus
							/>
							{errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
						</div>

						<div className="space-y-2">
							<Label htmlFor="description">描述（可选）</Label>
							<Textarea
								id="description"
								data-testid="folder-description-input"
								placeholder="用于客户支持场景的提示词..."
								className="resize-none"
								{...register("description")}
							/>
						</div>
					</div>

					<SheetFooter className="mt-6 flex flex-row items-center justify-end gap-2 p-0">
						<Button type="button" variant="outline" data-testid="folder-cancel" onClick={() => onOpenChange(false)}>
							取消
						</Button>
						<Button type="submit" data-testid="folder-submit" disabled={isLoading}>
							{isLoading ? "保存中..." : isEditing ? "更新" : "创建"}
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}