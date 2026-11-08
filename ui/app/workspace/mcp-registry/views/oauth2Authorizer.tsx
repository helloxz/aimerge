import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getErrorMessage } from "@/lib/store/apis/baseApi";
import { useCompleteOAuthFlowMutation, useLazyGetOAuthConfigStatusQuery } from "@/lib/store/apis/mcpApi";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, ExternalLink, KeyRound, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface OAuth2AuthorizerProps {
	open: boolean;
	onClose: () => void;
	onSuccess: () => void;
	onError: (error: string) => void;
	onConflict?: (error: string) => void;
	authorizeUrl: string;
	oauthConfigId: string;
	mcpClientId: string;
	isPerUserOauth?: boolean;
}

type Status = "confirm" | "polling" | "blocked" | "success" | "failed";

// ── Icon slot ────────────────────────────────────────────────────────────────

function IconWrap({ status }: { status: Status }) {
	const base = "flex size-9 shrink-0 items-center justify-center rounded-md";

	if (status === "polling") {
		return (
			<div className={cn(base, "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300")}>
				<Loader2 className="size-4 animate-spin" />
			</div>
		);
	}
	if (status === "success") {
		return (
			<div className={cn(base, "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300")}>
				<CheckCircle2 className="size-4" />
			</div>
		);
	}
	if (status === "failed") {
		return (
			<div className={cn(base, "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300")}>
				<XCircle className="size-4" />
			</div>
		);
	}
	if (status === "blocked") {
		return (
			<div className={cn(base, "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300")}>
				<AlertTriangle className="size-4" />
			</div>
		);
	}
	// confirm (default)
	return (
		<div className={cn(base, "bg-muted text-muted-foreground")}>
			<ShieldCheck className="size-4" />
		</div>
	);
}

// ── Info box ──────────────────────────────────────────────────────────────────

function InfoBox({
	variant = "default",
	icon,
	children,
}: {
	variant?: "default" | "success" | "danger" | "warning";
	icon: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div
			className={cn("flex gap-3 rounded-md border p-3.5 text-sm", {
				"border-border bg-muted/40 text-muted-foreground": variant === "default",
				"border-green-200/60 bg-green-50/70 text-green-800 dark:border-green-800/40 dark:bg-green-950/40 dark:text-green-200":
					variant === "success",
				"border-red-200/60 bg-red-50/70 text-red-800 dark:border-red-800/40 dark:bg-red-950/40 dark:text-red-200": variant === "danger",
				"border-amber-200/60 bg-amber-50/70 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/40 dark:text-amber-200":
					variant === "warning",
			})}
		>
			<span className="mt-0.5 shrink-0">{icon}</span>
			<div className="space-y-1 leading-relaxed">{children}</div>
		</div>
	);
}

// ── Step dots ─────────────────────────────────────────────────────────────────

function StepDots({ active, total }: { active: number; total: number }) {
	return (
		<div className="flex items-center gap-1">
			{Array.from({ length: total }).map((_, i) => (
				<div key={i} className={cn("size-1.5 rounded-full transition-colors", i < active ? "bg-blue-500" : "bg-border")} />
			))}
		</div>
	);
}

// ── Main component ────────────────────────────────────────────────────────────

export const OAuth2Authorizer: React.FC<OAuth2AuthorizerProps> = ({
	open,
	onClose,
	onSuccess,
	onError,
	onConflict,
	authorizeUrl,
	oauthConfigId,
	isPerUserOauth,
}) => {
	const [status, setStatus] = useState<Status>(isPerUserOauth ? "confirm" : "polling");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const popupRef = useRef<Window | null>(null);
	const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const isCompletingRef = useRef(false);
	const cancelledRef = useRef(false);

	const [getOAuthStatus] = useLazyGetOAuthConfigStatusQuery();
	const [completeOAuth] = useCompleteOAuthFlowMutation();

	const authorizationHost = useMemo(() => {
		try {
			return new URL(authorizeUrl).host;
		} catch {
			return "OAuth 提供商";
		}
	}, [authorizeUrl]);

	const stopPolling = useCallback(() => {
		if (pollIntervalRef.current) {
			clearInterval(pollIntervalRef.current);
			pollIntervalRef.current = null;
		}
	}, []);

	const handleOAuthComplete = useCallback(async () => {
		if (cancelledRef.current || isCompletingRef.current) return;
		isCompletingRef.current = true;
		if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
		try {
			await completeOAuth(oauthConfigId).unwrap();
			if (cancelledRef.current) return;
			setStatus("success");
			onSuccess();
		} catch (error) {
			if (cancelledRef.current) return;
			const errMsg = getErrorMessage(error);
			if ((error as any)?.status === 409 && onConflict) {
				setStatus(isPerUserOauth ? "confirm" : "polling");
				setErrorMessage(null);
				isCompletingRef.current = false;
				onConflict(errMsg);
				return;
			}
			setStatus("failed");
			setErrorMessage(errMsg);
			onError(errMsg);
		}
	}, [oauthConfigId, completeOAuth, onSuccess, onError, onConflict, isPerUserOauth]);

	const handleOAuthFailed = useCallback(
		(reason: string) => {
			stopPolling();
			if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
			if (cancelledRef.current) return;
			setStatus("failed");
			setErrorMessage(reason);
			onError(reason);
		},
		[stopPolling, onError],
	);

	const checkOAuthStatus = useCallback(async () => {
		if (cancelledRef.current) return;
		try {
			const result = await getOAuthStatus(oauthConfigId).unwrap();
			if (cancelledRef.current) return;
			if (result.status === "authorized") {
				stopPolling();
				await handleOAuthComplete();
			} else if (result.status === "failed" || result.status === "expired") {
				handleOAuthFailed(`授权未完成（${result.status}）`);
			}
		} catch (error) {
			console.error("Error checking OAuth status:", error);
		}
	}, [oauthConfigId, getOAuthStatus, stopPolling, handleOAuthComplete, handleOAuthFailed]);

	const startPolling = useCallback(() => {
		if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
		pollIntervalRef.current = setInterval(async () => {
			if (popupRef.current && popupRef.current.closed) {
				try {
					const result = await getOAuthStatus(oauthConfigId).unwrap();
					if (result.status === "authorized") {
						stopPolling();
						await handleOAuthComplete();
					} else if (result.status === "failed" || result.status === "expired") {
						stopPolling();
						handleOAuthFailed("授权失败");
					}
				} catch {
					// transient error — let polling continue
				}
				return;
			}
			await checkOAuthStatus();
		}, 2000);
	}, [checkOAuthStatus, getOAuthStatus, handleOAuthComplete, handleOAuthFailed, oauthConfigId, stopPolling]);

	const openPopup = useCallback(() => {
		isCompletingRef.current = false;
		cancelledRef.current = false;
		if (popupRef.current && !popupRef.current.closed) popupRef.current.close();

		const width = 600;
		const height = 700;
		const left = window.screen.width / 2 - width / 2;
		const top = window.screen.height / 2 - height / 2;
		const popup = window.open(
			authorizeUrl,
			"oauth_popup",
			`width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
		);

		if (!popup || popup.closed) {
			popupRef.current = null;
			setStatus("blocked");
			return;
		}

		popupRef.current = popup;
		setStatus("polling");
		startPolling();
	}, [authorizeUrl, startPolling]);

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			if (event.source !== popupRef.current || event.origin !== window.location.origin) return;
			if (event.data?.type === "oauth_success") {
				void checkOAuthStatus();
				return;
			}
			if (event.data?.type === "oauth_failed") {
				handleOAuthFailed(event.data.error ?? "OAuth 流程失败");
			}
		};
		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [checkOAuthStatus, handleOAuthFailed]);

	// Auto-open popup for non-per-user OAuth flows.
	const openPopupRef = useRef(openPopup);
	useEffect(() => {
		openPopupRef.current = openPopup;
	});
	useEffect(() => {
		if (open && !isPerUserOauth) openPopupRef.current();
	}, [open, isPerUserOauth]);

	useEffect(() => {
		return () => {
			stopPolling();
			if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
		};
	}, [stopPolling]);

	const handleRetry = () => {
		setErrorMessage(null);
		isCompletingRef.current = false;
		setStatus(isPerUserOauth ? "confirm" : "polling");
		if (!isPerUserOauth) openPopup();
	};

	const handleCancel = () => {
		cancelledRef.current = true;
		stopPolling();
		isCompletingRef.current = false;
		if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
		onClose();
	};

	const titles: Record<Status, string> = {
		confirm: "授权连接",
		polling: "等待授权",
		blocked: "弹窗被阻止",
		success: "连接已授权",
		failed: "授权失败",
	};

	const subtitles: Record<Status, string> = {
		confirm: "启用此服务器前，请先执行一次 OAuth 测试。",
		polling: "请在弹窗中完成登录以继续。",
		blocked: "请允许此站点弹出窗口，然后重试。",
		success: "OAuth 授权已成功完成。",
		failed: "OAuth 流程未完成。",
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) handleCancel();
			}}
		>
			<DialogContent
				className="gap-0 overflow-hidden p-0 sm:max-w-md"
				onPointerDownOutside={(e) => {
					e.preventDefault();
					handleCancel();
				}}
				onEscapeKeyDown={(e) => {
					e.preventDefault();
					handleCancel();
				}}
			>
				{/* Header */}
				<DialogHeader className="border-b px-5 py-4 text-left">
					<div className="flex items-start gap-3">
						<IconWrap status={status} />
						<div className="min-w-0 space-y-0.5">
							<DialogTitle className="text-sm leading-snug font-medium">{titles[status]}</DialogTitle>
							<DialogDescription className="text-xs leading-relaxed">{subtitles[status]}</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				{/* Body */}
				<div className="space-y-3 px-5 py-4">
					{/* Confirm */}
					{status === "confirm" && (
						<>
							<InfoBox icon={<KeyRound className="size-4" />}>
								<p>
									我们将打开 <strong>{authorizationHost}</strong>，以验证 OAuth 配置并发现可用工具。
								</p>
								<p className="text-muted-foreground/80 text-xs">
									此登录仅用于初始配置。每位用户在连接时会各自进行认证。
								</p>
							</InfoBox>
							<div className="flex justify-end gap-2">
								<Button size="sm" variant="outline" onClick={handleCancel} data-testid="per-user-oauth-cancel">
									取消
								</Button>
								<Button size="sm" onClick={openPopup} data-testid="per-user-oauth-confirm">
									<ExternalLink className="size-3.5" />
									继续
								</Button>
							</div>
						</>
					)}

					{/* Polling */}
					{status === "polling" && (
						<>
							<InfoBox icon={<Loader2 className="size-4 animate-spin" />}>
								<p>提供商回调后，此对话框会自动更新。</p>
								<p className="text-muted-foreground/80 text-xs">在授权完成前请保持弹窗打开。</p>
							</InfoBox>
							<div className="flex items-center justify-between">
								<StepDots active={2} total={3} />
								<Button size="sm" variant="outline" onClick={handleCancel} data-testid="oauth-polling-cancel-btn">
									取消
								</Button>
							</div>
						</>
					)}

					{/* Blocked */}
					{status === "blocked" && (
						<>
							<InfoBox variant="warning" icon={<AlertTriangle className="size-4" />}>
								<p>您的浏览器阻止了授权窗口打开。</p>
								<p className="text-xs opacity-80">请在浏览器设置中允许此站点弹出窗口，然后重试。</p>
							</InfoBox>
							<div className="flex justify-end gap-2">
								<Button size="sm" variant="outline" onClick={handleCancel} data-testid="oauth-pending-cancel-btn">
									取消
								</Button>
								<Button size="sm" onClick={openPopup} data-testid="oauth-open-window-btn">
									<ExternalLink className="size-3.5" />
									打开授权
								</Button>
							</div>
						</>
					)}

					{/* Success */}
					{status === "success" && (
						<InfoBox variant="success" icon={<CheckCircle2 className="size-4" />}>
							<p className="font-medium">正在完成配置并同步可用工具。</p>
							<p className="text-xs opacity-80">您可以关闭此对话框，配置将在后台完成。</p>
						</InfoBox>
					)}

					{/* Failed */}
					{status === "failed" && (
						<>
							<InfoBox variant="danger" icon={<XCircle className="size-4" />}>
								<p className="font-medium">授权未完成。</p>
								<p className="text-xs opacity-80">{errorMessage ?? "请检查 OAuth 提供商配置，或重试。"}</p>
							</InfoBox>
							<div className="flex justify-end gap-2">
								<Button size="sm" variant="outline" onClick={handleCancel} data-testid="oauth-failed-close-btn">
									关闭
								</Button>
								<Button size="sm" onClick={handleRetry} data-testid="oauth-failed-retry-btn">
									<RefreshCw className="size-3.5" />
									重试
								</Button>
							</div>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
};