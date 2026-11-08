// Results table for OAuth grants: one row per active downstream grant, with the
// bound identity, an approximate access-token expiry, created/last-used relative
// times, and a per-row actions menu. Owns the empty state and pagination; the
// page passes in the current page slice plus filter/revoke state.

import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PIN_SHADOW_RIGHT } from "@/components/table/columnPinning";
import type { OAuth2GrantRow } from "@/lib/store/apis/oauth2SessionsApi";
import {
	ChevronLeft,
	ChevronRight,
	Fingerprint,
	Info,
	KeyRound,
	UserRound,
} from "lucide-react";
import GrantActions from "./grantActions";

interface GrantsTableProps {
	rows: OAuth2GrantRow[];
	totalCount: number;
	offset: number;
	pageSize: number;
	onOffsetChange: (offset: number) => void;
	isFetching: boolean;
	hasActiveFilters: boolean;
	revoking: boolean;
	pendingActionRowId: string | null;
	onRevoke: (row: OAuth2GrantRow) => void;
}

export default function GrantsTable({
	rows,
	totalCount,
	offset,
	pageSize,
	onOffsetChange,
	isFetching,
	hasActiveFilters,
	revoking,
	pendingActionRowId,
	onRevoke,
}: GrantsTableProps) {
	return (
		<div className="flex grow flex-col overflow-hidden">
			<div className={`mb-2 grow overflow-hidden rounded-sm border ${isFetching ? "opacity-70 transition-opacity" : ""}`}>
				<Table containerClassName="h-full overflow-auto">
					<TableHeader className="bg-muted sticky top-0 z-20">
						<TableRow>
							<TableHead>客户端</TableHead>
							<TableHead>
								<HeaderWithTooltip
									label="绑定对象"
									tooltip="此授权所绑定的身份：最终用户（通过 SSO）、虚拟密钥（使用该虚拟密钥的任何人共享），或匿名会话。这决定了此授权下可访问哪些上游的按用户 OAuth 会话。"
								/>
							</TableHead>
							<TableHead>
								<HeaderWithTooltip
									label="访问令牌过期时间"
									tooltip="当前 JWT 访问令牌的过期时间。MCP 客户端会使用刷新令牌静默续期，因此已过期的有效授权会在下次请求时自动签发新令牌。"
								/>
							</TableHead>
							<TableHead>创建时间</TableHead>
							<TableHead>
								<HeaderWithTooltip
									label="最近使用"
									tooltip="此授权最近一次刷新访问令牌的时间。MCP 客户端会在令牌临近过期时刷新，因此该时间反映授权的最新活动。从未刷新过的授权则显示其创建时间。"
								/>
							</TableHead>
							<TableHead className={`bg-muted relative sticky right-0 z-10 w-[56px] text-right ${PIN_SHADOW_RIGHT}`} />
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.length === 0 ? (
							<TableRow>
								<TableCell colSpan={6} className="h-24 text-center">
									{hasActiveFilters ? (
										<div className="text-muted-foreground text-sm">
											没有符合当前筛选条件的授权。
										</div>
									) : (
										<EmptyGrantsState />
									)}
								</TableCell>
							</TableRow>
						) : (
							rows.map((row) => (
								<TableRow key={row.id} className="group">
									<TableCell className="font-medium">
										{row.client_name || row.client_id}
									</TableCell>
									<TableCell>
										<BindingCell row={row} />
									</TableCell>
									<TableCell className="text-muted-foreground text-sm">
										<AccessTokenExpiry row={row} />
									</TableCell>
									<TableCell className="text-muted-foreground text-sm">
										{formatRelativePast(row.created_at)}
									</TableCell>
									<TableCell className="text-muted-foreground text-sm">
										{formatRelativePast(row.last_used_at || row.created_at)}
									</TableCell>
									<TableCell
										className={`relative group-hover:bg-muted dark:bg-card dark:group-hover:bg-muted sticky right-0 z-10 bg-white text-right ${PIN_SHADOW_RIGHT}`}
									>
										<GrantActions
											row={row}
											revoking={revoking}
											isPendingRow={pendingActionRowId === row.id}
											onRevoke={() => onRevoke(row)}
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
						{(offset + 1).toLocaleString()}-{Math.min(offset + pageSize, totalCount).toLocaleString()} / 共 {totalCount.toLocaleString()} 条
					</div>

					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => onOffsetChange(Math.max(0, offset - pageSize))}
							disabled={offset === 0}
							data-testid="oauth-grants-prev-page-btn"
							aria-label="上一页"
						>
							<ChevronLeft className="size-3" />
						</Button>

						<div className="flex items-center gap-1">
							<span>第</span>
							<span>{Math.floor(offset / pageSize) + 1}</span>
							<span>页，共 {Math.ceil(totalCount / pageSize)} 页</span>
						</div>

						<Button
							variant="ghost"
							size="sm"
							onClick={() => onOffsetChange(offset + pageSize)}
							disabled={offset + pageSize >= totalCount}
							data-testid="oauth-grants-next-page-btn"
							aria-label="下一页"
						>
							<ChevronRight className="size-3" />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

function BindingCell({ row }: { row: OAuth2GrantRow }) {
	const display = row.bf_sub_display || row.bf_sub;
	if (row.bf_mode === "user") {
		return (
			<span className="inline-flex items-center gap-2">
				<UserRound className="text-muted-foreground size-3.5 shrink-0" />
				<span className="text-sm">{display}</span>
			</span>
		);
	}
	if (row.bf_mode === "vk") {
		return (
			<span className="inline-flex items-center gap-2">
				<KeyRound className="text-muted-foreground size-3.5 shrink-0" />
				<span className="text-sm">{display}</span>
			</span>
		);
	}
	return (
		<span className="inline-flex items-center gap-2">
			<Fingerprint className="text-muted-foreground size-3.5 shrink-0" />
			<span className="font-mono text-sm">{display}</span>
		</span>
	);
}

function AccessTokenExpiry({ row }: { row: OAuth2GrantRow }) {
	// Access token TTL is 10 min (600s default). Access tokens are stateless JWTs
	// not stored server-side, so we approximate expiry from the grant's last
	// activity (last_used_at, falling back to created_at). Anchoring to created_at
	// alone would read as expired for any grant that has silently refreshed.
	const baseMs = new Date(row.last_used_at ?? row.created_at).getTime();
	if (!Number.isFinite(baseMs)) {
		return <span className="text-muted-foreground">未知</span>;
	}
	const expiryMs = baseMs + 600_000; // 10 min default
	const diffMs = expiryMs - Date.now();
	if (diffMs < 0) {
		return <span className="text-muted-foreground">下次使用时刷新</span>;
	}
	const mins = Math.ceil(diffMs / 60_000);
	return <span>{mins} 分钟后</span>;
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

function EmptyGrantsState() {
	return (
		<div className="flex flex-col items-center gap-3 py-4">
			<p className="text-muted-foreground text-sm">
				暂无授权。当 MCP 客户端通过 OAuth 授权同意流程连接后，授权会显示在此处。（需将认证模式设置为 “oauth” 或 “both” 才会签发授权。）
			</p>
		</div>
	);
}

function formatRelativePast(iso: string): string {
	try {
		const ts = new Date(iso).getTime();
		if (!Number.isFinite(ts)) return iso;
		const diffMs = Date.now() - ts;
		if (diffMs < 0) return "刚刚";
		const mins = Math.floor(diffMs / 60_000);
		if (mins < 1) return "刚刚";
		if (mins < 60) return `${mins} 分钟前`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs} 小时前`;
		const days = Math.floor(hrs / 24);
		return `${days} 天前`;
	} catch {
		return iso;
	}
}
