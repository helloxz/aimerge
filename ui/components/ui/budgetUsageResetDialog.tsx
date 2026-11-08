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

interface BudgetUsageResetDialogProps {
	"data-testid"?: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Called with the operator's choice: true to zero usage, false to preserve it. */
	onChoice: (resetUsage: boolean) => void;
	/** Name of the thing being edited, e.g. "team", used in the prompt copy. */
	ownerLabel: string;
}

/**
 * Asks whether to clear accumulated spend when a budget's configuration changes.
 *
 * Shared by every owner's edit sheet rather than reimplemented per sheet: the
 * wording is a promise about what the backend does, and four copies would drift
 * from each other and from the API.
 *
 * Note the reset clears usage only. The reset boundary is never moved - it is
 * guarded to advance forward only so that cluster nodes agree on which window is
 * current - so the window keeps its existing start and end either way.
 */
export default function BudgetUsageResetDialog({
	"data-testid": testId,
	open,
	onOpenChange,
	onChoice,
	ownerLabel,
}: BudgetUsageResetDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent data-testid={testId}>
				<AlertDialogHeader>
					<AlertDialogTitle>重置预算用量？</AlertDialogTitle>
					<AlertDialogDescription>
						您更改了此{ownerLabel}的预算金额或重置频率。可将当前用量重置为 0，或保留现有计数。无论选择哪种，重置窗口的起止时间都保持不变。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={() => onChoice(false)} data-testid={testId ? `${testId}-preserve-btn` : undefined}>
						保留用量
					</AlertDialogCancel>
					<AlertDialogAction onClick={() => onChoice(true)} data-testid={testId ? `${testId}-confirm-btn` : undefined}>
						重置用量
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}