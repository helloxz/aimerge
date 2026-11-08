import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

interface UseCopyToClipboardOptions {
	successMessage?: string;
	errorMessage?: string;
	resetDelay?: number;
}

export function useCopyToClipboard(options: UseCopyToClipboardOptions = {}) {
	const { successMessage = "已复制到剪贴板", errorMessage = "复制失败", resetDelay = 2000 } = options;
	const [copied, setCopied] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

	const copy = useCallback(
		async (text: string) => {
			try {
				await navigator.clipboard.writeText(text);
				setCopied(true);
				toast.success(successMessage);

				if (timeoutRef.current) clearTimeout(timeoutRef.current);
				timeoutRef.current = setTimeout(() => setCopied(false), resetDelay);
			} catch {
				toast.error(errorMessage);
			}
		},
		[successMessage, errorMessage, resetDelay],
	);

	return { copy, copied };
}