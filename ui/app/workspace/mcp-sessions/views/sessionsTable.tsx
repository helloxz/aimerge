// Base sessions table: renders token rows + pending flow rows + per-user
// header credential rows visible to the caller's identity. VK-keyed rows
// render directly with their VK ID; user-keyed rows show the preloaded
// user.name (falling back to email, then raw user_id). The `user` field
// is populated server-side by the enterprise configstore wrapper; OSS
// leaves it absent and the UI falls back to the raw ID.
//
// Status badges:
//   active:       token / header row, usable
//   orphaned:     credential row (token or header); caller lost their last
//                 granting VK. Credential still intact — auto-reactivates
//                 when access is restored. Re-auth / edit wouldn't help so
//                 the corresponding action is hidden.
//   needs_reauth: token row; upstream credential dead (refresh failed).
//                 Re-auth required.
//   needs_update: header row; admin changed the PerUserHeaderKeys schema.
//                 Caller must resubmit values.
//   pending:      flow row, user must complete OAuth authentication.

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdownMenu";
import { PIN_SHADOW_RIGHT } from "@/components/table/columnPinning";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage, useReauthMCPSessionMutation, useRevokeMCPSessionMutation } from "@/lib/store";
import { MCPSessionRow } from "@/lib/types/mcpSessions";
import { ExternalLink, Fingerprint, KeyRound, Loader2, MoreHorizontal, Pencil, RefreshCcw, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import SessionsFilterBar from "./sessionsFilterBar";

interface SessionsTableProps {
	sessions: MCPSessionRow[];
	totalCount: number;
	isFetching: boolean;
	search: string;
	onSearchChange: (value: string) => void;
	kindFilter: string[];
	onKindFilterChange: (value: string[]) => void;
	statusFilter: string[];
	onStatusFilterChange: (value: string[]) => void;
	authModeFilter: string[];
	onAuthModeFilterChange: (value: string[]) => void;
	hasActiveFilters: boolean;
	onClearFilters: () => void;
	offset: number;
	limit: number;
	onOffsetChange: (offset: number) => void;
}

export default function SessionsTable({
	sessions,
	totalCount,
	isFetching,
	search,
	onSearchChange,
	kindFilter,
	onKindFilterChange,
	statusFilter,
	onStatusFilterChange,
	authModeFilter,
	onAuthModeFilterChange,
	hasActiveFilters,
	onClearFilters,
	offset,
	limit,
	onOffsetChange,
}: SessionsTableProps) {
	const { toast } = useToast();
	const [reauth, { isLoading: reauthing }] = useReauthMCPSessionMutation();
	const [revoke, { isLoading: revoking }] = useRevokeMCPSessionMutation();
	const [pendingDelete, setPendingDelete] = useState<MCPSessionRow | null>(null);
	const [pendingActionRowId, setPendingActionRowId] = useState<string | null>(null);

	const handleReauth = async (row: MCPSessionRow) => {
		setPendingActionRowId(row.id);
		try {
			const res = await reauth(row.id).unwrap();
			// Open the upstream authorize URL. User completes there, then
			// is redirected back to /api/oauth/callback by the provider.
			window.location.href = res.authorize_url;
		} catch (err) {
			setPendingActionRowId(null);
			toast({ title: "重新认证失败", description: getErrorMessage(err), variant: "destructive" });
		}
	};

	const confirmRevoke = async () => {
		if (!pendingDelete) return;
		const row = pendingDelete;
		setPendingDelete(null);
		setPendingActionRowId(row.id);
		try {
			await revoke(row.id).unwrap();
			toast({ title: row.kind === "header" ? "请求头值已撤销" : "会话已撤销" });
		} catch (err) {
			toast({
				title: row.kind === "header" ? "撤销请求头值失败" : "撤销会话失败",
				description: getErrorMessage(err),
				variant: "destructive",
			});
		} finally {
			setPendingActionRowId(null);
		}
	};

	return (
		<div className="flex grow flex-col overflow-auto">
			<AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						{pendingDelete?.kind === "header" ? (
							<>
								<AlertDialogTitle>撤销已存储的请求头值？</AlertDialogTitle>
								<AlertDialogDescription>
									Bifrost 将删除此绑定已存储的凭据值。此处没有可撤销的上游令牌；用户需要重新提交请求头值才能再次使用此 MCP。
								</AlertDialogDescription>
							</>
						) : (
							<>
								<AlertDialogTitle>撤销此 MCP 会话？</AlertDialogTitle>
								<AlertDialogDescription>
									Bifrost 将删除此绑定已存储的凭据。上游 OAuth 令牌不会在提供商处撤销；它会保持脱离状态并自然过期。使用此绑定的任何人需要重新认证以获取新令牌。
								</AlertDialogDescription>
							</>
						)}
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel data-testid="mcp-session-revoke-cancel">取消</AlertDialogCancel>
						<AlertDialogAction onClick={confirmRevoke} data-testid="mcp-session-revoke-confirm">
							撤销
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<div className="mb-4 flex items-center justify-between gap-4">
				<div>
					<h2 className="text-lg font-semibold tracking-tight">MCP 认证会话</h2>
					<p className="text-muted-foreground text-sm">
						为 MCP 服务器存储的按用户凭据（OAuth 令牌与已提交的请求头），以及所有待处理的认证流程。
					</p>
				</div>
			</div>

			<div className="mb-4">
				<SessionsFilterBar
					search={search}
					onSearchChange={onSearchChange}
					kindFilter={kindFilter}
					onKindFilterChange={onKindFilterChange}
					statusFilter={statusFilter}
					onStatusFilterChange={onStatusFilterChange}
					authModeFilter={authModeFilter}
					onAuthModeFilterChange={onAuthModeFilterChange}
					hasActiveFilters={hasActiveFilters}
					onClearFilters={onClearFilters}
				/>
			</div>

			<div className="flex grow flex-col overflow-auto">
				<div className={`mb-2 grow overflow-auto rounded-sm border ${isFetching ? "opacity-70 transition-opacity" : ""}`}>
					<Table>
						<TableHeader className="bg-muted sticky top-0 z-20">
							<TableRow>
								<TableHead>MCP 服务器</TableHead>
								<TableHead>
									<HeaderWithTooltip
										label="类型"
										tooltip="OAuth：按用户 OAuth 凭据，可以是已完成登录后存储的令牌，也可以是待处理的登录流程。请求头：按用户请求头值（API 密钥/签名令牌），可以是已存储的或待提交的。"
									/>
								</TableHead>
								<TableHead>
									<HeaderWithTooltip
										label="绑定至"
										tooltip="此凭据所绑定的身份：最终用户（通过 SSO）、虚拟密钥（使用该 VK 的任何人共享），或由客户端签发的会话 ID（通过 x-bf-mcp-session-id 请求头声明）。"
									/>
								</TableHead>
								<TableHead>
									<HeaderWithTooltip
										label="状态"
										tooltip="活跃：凭据有效且可用。待处理：OAuth 流程进行中，用户需完成登录。需重新认证：上游凭据已过期或在提供商处被撤销，用户需重新连接。需更新：管理员更改了必需的请求头键，用户需重新提交。已孤立：用户已失去对此 MCP 的访问权限（例如访问配置变更）；凭据会被保留，访问恢复后将自动变为活跃。"
									/>
								</TableHead>
								<TableHead>
									<HeaderWithTooltip
										label="访问令牌过期时间"
										tooltip="当前访问令牌的过期时间。Bifrost 会在下次请求时使用刷新令牌自动刷新，因此已过期但仍活跃的行会在使用时静默签发新令牌。请求头行没有上游过期时间；其值在撤销或架构变更前一直有效。"
									/>
								</TableHead>
								<TableHead>创建时间</TableHead>
								<TableHead className={`bg-muted sticky right-0 z-10 w-[56px] text-right ${PIN_SHADOW_RIGHT}`}></TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{sessions.length === 0 ? (
								<TableRow>
									<TableCell colSpan={7} className="h-24 text-center">
										{hasActiveFilters ? (
											<div className="text-muted-foreground text-sm">没有符合这些筛选条件的会话。</div>
										) : (
											<span className="text-muted-foreground text-sm">
												暂无会话。当推理请求或 MCP 网关调用触发按用户认证（OAuth 或提交请求头）时，会话会显示在此处。
											</span>
										)}
									</TableCell>
								</TableRow>
							) : (
								sessions.map((row) => (
									<TableRow key={`${row.kind}-${row.id}`} className="group">
										<TableCell className="font-medium">{row.mcp_client?.name || row.mcp_client?.client_id || "-"}</TableCell>
										<TableCell>
											<TypeBadge authKind={row.auth_kind} />
										</TableCell>
										<TableCell>
											<BindingCell row={row} />
										</TableCell>
										<TableCell>
											<StatusBadge status={row.status} />
										</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											<div className="flex flex-col">
												<span>{formatAccessExpiry(row)}</span>
												{row.last_refreshed_at && <span className="text-xs">刷新于 {formatRelativePast(row.last_refreshed_at)}</span>}
											</div>
										</TableCell>
										<TableCell className="text-muted-foreground text-sm">{formatRelativePast(row.created_at)}</TableCell>
										<TableCell
											className={`group-hover:bg-muted dark:bg-card dark:group-hover:bg-muted sticky right-0 z-10 bg-white text-right ${PIN_SHADOW_RIGHT}`}
										>
											<RowActions
												row={row}
												reauthing={reauthing}
												revoking={revoking}
												isPendingRow={pendingActionRowId === row.id}
												onReauth={() => handleReauth(row)}
												onRevoke={() => setPendingDelete(row)}
											/>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>

				{totalCount > 0 && (
					<div className="flex shrink-0 items-center justify-between text-xs" data-testid="pagination">
						<div className="text-muted-foreground flex items-center gap-2">
							第 {(offset + 1).toLocaleString()}-{Math.min(offset + limit, totalCount).toLocaleString()} 条，共 {totalCount.toLocaleString()}{" "}
							条
						</div>

						<div className="flex items-center gap-2">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => onOffsetChange(Math.max(0, offset - limit))}
								disabled={offset === 0}
								data-testid="mcp-sessions-pagination-prev-btn"
								aria-label="上一页"
							>
								<ChevronLeft className="size-3" />
							</Button>

							<div className="flex items-center gap-1">
								<span>第</span>
								<span>{Math.floor(offset / limit) + 1}</span>
								<span>/ {Math.ceil(totalCount / limit)} 页</span>
							</div>

							<Button
								variant="ghost"
								size="sm"
								onClick={() => onOffsetChange(offset + limit)}
								disabled={offset + limit >= totalCount}
								data-testid="mcp-sessions-pagination-next-btn"
								aria-label="下一页"
							>
								<ChevronRight className="size-3" />
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

function HeaderWithTooltip({ label, tooltip }: { label: string; tooltip: string }) {
	return (
		<TooltipProvider delayDuration={150}>
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="inline-flex cursor-help items-center gap-2">
						{label}
						<Info className="text-muted-foreground size-3" />
					</span>
				</TooltipTrigger>
				<TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

function BindingCell({ row }: { row: MCPSessionRow }) {
	if (row.auth_mode === "user" && row.user_id) {
		const displayName = row.user?.name || row.user?.email;
		return (
			<div className="flex items-center gap-1.5 text-sm">
				<UserRound className="text-muted-foreground size-3.5" />
				{displayName ? <span>{displayName}</span> : <span className="font-mono">{row.user_id}</span>}
			</div>
		);
	}
	if (row.auth_mode === "vk" && row.virtual_key) {
		return (
			<div className="flex items-center gap-1.5 text-sm">
				<KeyRound className="text-muted-foreground size-3.5" />
				<span>{row.virtual_key.name || row.virtual_key.id}</span>
			</div>
		);
	}
	if (row.auth_mode === "session" && row.session_id) {
		return (
			<div className="flex items-center gap-1.5 text-sm">
				<Fingerprint className="text-muted-foreground size-3.5" />
				<span className="font-mono">{row.session_id}</span>
			</div>
		);
	}
	return <span className="text-muted-foreground text-sm">绑定至会话</span>;
}

function TypeBadge({ authKind }: { authKind: string }) {
	if (authKind === "headers") {
		return <Badge variant="outline">请求头</Badge>;
	}
	return <Badge variant="outline">OAuth</Badge>;
}

function StatusBadge({ status }: { status: string }) {
	if (status === "pending") {
		return <Badge variant="secondary">待处理</Badge>;
	}
	if (status === "orphaned") {
		// Muted amber: distinct from destructive (red, action-required) and
		// secondary (gray, in-progress). Signals "informational, no action
		// needed from you" — the auto-restore cascade handles it.
		return (
			<Badge variant="outline" className="border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
				已孤立
			</Badge>
		);
	}
	if (status === "needs_reauth") {
		return <Badge variant="destructive">需重新认证</Badge>;
	}
	if (status === "needs_update") {
		// Outlined red: signals user action required, but visually distinct from
		// needs_reauth's solid destructive badge (which represents a hard auth failure).
		// Distinct copy so the row affordance ("Update values") matches.
		return (
			<Badge variant="outline" className="border-red-500 bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-200">
				需更新
			</Badge>
		);
	}
	return <Badge>活跃</Badge>;
}

interface RowActionsProps {
	row: MCPSessionRow;
	reauthing: boolean;
	revoking: boolean;
	isPendingRow: boolean;
	onReauth: () => void;
	onRevoke: () => void;
}

function RowActions({ row, reauthing, revoking, isPendingRow, onReauth, onRevoke }: RowActionsProps) {
	const busy = reauthing || revoking;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="h-8 w-8"
					aria-label="MCP 会话操作"
					data-testid={`mcp-session-row-actions-${row.id}`}
					disabled={busy}
				>
					{busy && isPendingRow ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{row.kind === "flow" ? (
					row.status === "needs_reauth" ? (
						// The PKCE state on this flow row is dead; a fresh request to the
						// MCP client will start a new flow. No action we can offer wires
						// up to the existing flow row, so surface guidance instead.
						<DropdownMenuItem disabled className="text-muted-foreground cursor-default text-xs">
							发起请求以重新认证
						</DropdownMenuItem>
					) : (
						<DropdownMenuItem
							className="cursor-pointer"
							data-testid="mcp-session-complete-auth-menu-item"
							onSelect={(e) => {
								e.preventDefault();
								// Header flows need &kind=headers so the auth landing page
								// routes to the per-user-headers backend; OAuth flows use
								// the default branch.
								const url =
									row.auth_kind === "headers"
										? `/workspace/mcp-sessions/auth?flow=${row.id}&kind=headers`
										: `/workspace/mcp-sessions/auth?flow=${row.id}`;
								window.location.href = url;
							}}
						>
							<ExternalLink className="h-4 w-4" />
							完成认证
						</DropdownMenuItem>
					)
				) : row.kind === "header" ? (
					<>
						{row.status !== "orphaned" && row.can_reauth && (
							// "Edit values" hits reauth server-side: the handler mints a
							// fresh header submission flow + temp token and returns the
							// auth-landing URL. Same single-click → redirect dance as the
							// OAuth row's "Re-authenticate" action. Hidden when can_reauth
							// is false — user-bound credentials are only resubmittable by
							// the bound user (server enforces with 403).
							<DropdownMenuItem
								className="cursor-pointer"
								disabled={busy}
								data-testid="mcp-session-edit-headers-menu-item"
								onSelect={(e) => {
									e.preventDefault();
									onReauth();
								}}
							>
								<Pencil className="h-4 w-4" />
								{row.status === "needs_update" ? "更新值" : "编辑值"}
							</DropdownMenuItem>
						)}
						<DropdownMenuItem
							variant="destructive"
							className="cursor-pointer"
							disabled={busy}
							data-testid="mcp-session-revoke-menu-item"
							onSelect={(e) => {
								e.preventDefault();
								onRevoke();
							}}
						>
							<Trash2 className="h-4 w-4" />
							撤销
						</DropdownMenuItem>
					</>
				) : (
					<>
						{row.status !== "orphaned" && row.can_reauth && (
							// Re-auth on an orphaned row wouldn't help: the upstream
							// credential is intact, the user just no longer has any
							// granting VK. Surface guidance instead of an action.
							// Hidden when can_reauth is false — user-bound rows are only
							// reauthable by the bound user (server enforces with 403).
							<DropdownMenuItem
								className="cursor-pointer"
								disabled={busy}
								data-testid="mcp-session-reauth-menu-item"
								onSelect={(e) => {
									e.preventDefault();
									onReauth();
								}}
							>
								<RefreshCcw className="h-4 w-4" />
								重新认证
							</DropdownMenuItem>
						)}
						<DropdownMenuItem
							variant="destructive"
							className="cursor-pointer"
							disabled={busy}
							data-testid="mcp-session-revoke-menu-item"
							onSelect={(e) => {
								e.preventDefault();
								onRevoke();
							}}
						>
							<Trash2 className="h-4 w-4" />
							撤销
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function formatRelativePast(iso: string): string {
	try {
		const t = new Date(iso).getTime();
		if (Number.isNaN(t)) return iso;
		const diffMs = Date.now() - t;
		if (diffMs < 60_000) return "刚刚";
		const mins = Math.floor(diffMs / 60_000);
		if (mins < 60) return `${mins} 分钟前`;
		const hours = Math.floor(diffMs / 3_600_000);
		if (hours < 48) return `${hours} 小时前`;
		const days = Math.floor(diffMs / 86_400_000);
		return `${days} 天前`;
	} catch {
		return iso;
	}
}

function formatAccessExpiry(row: MCPSessionRow): string {
	// Header rows don't have an upstream-side expiry — the submitted values
	// are durable until the user revokes or the schema changes. The status
	// column already conveys lifecycle state (Active / Needs update /
	// Orphaned), so this column collapses to a dash for headers.
	if (row.kind === "header") {
		return "-";
	}
	if (!row.expires_at) return "-";
	try {
		const t = new Date(row.expires_at).getTime();
		if (Number.isNaN(t)) return row.expires_at;
		const diffMs = t - Date.now();
		if (diffMs < 0) {
			// Active rows auto-refresh on next use via the refresh token.
			// Orphaned rows still hold a valid upstream credential — the past
			// expiry just means the cached access token is stale; if access
			// is restored, refresh kicks in. Only 'needs_reauth' is genuinely
			// expired (the refresh token itself is dead).
			switch (row.status) {
				case "active":
					return "下次使用时刷新";
				case "orphaned":
					return "访问恢复后刷新";
				default:
					return "已过期";
			}
		}
		const days = Math.floor(diffMs / 86_400_000);
		if (days > 1) return `${days} 天后`;
		const hours = Math.floor(diffMs / 3_600_000);
		if (hours > 1) return `${hours} 小时后`;
		const mins = Math.floor(diffMs / 60_000);
		return `${Math.max(mins, 1)} 分钟后`;
	} catch {
		return row.expires_at;
	}
}