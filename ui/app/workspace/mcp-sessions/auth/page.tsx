// Auth landing route for inline-401 URLs returned by the inference path.
//
// Both per-user-OAuth and per-user-headers flows land here. The URL shape
// is identical except for the kind discriminator:
//   - OAuth:   {base}/workspace/mcp-sessions/auth?flow={flowId}#t={token}
//   - Headers: {base}/workspace/mcp-sessions/auth?flow={flowId}&kind=headers#t={token}
//
// The temp token in the URL fragment binds the page request to the flow ID,
// letting anonymous browser visitors complete the flow without a dashboard
// session. The page picks the right backend (oauth/per-user/flows vs
// mcp/per-user-headers/flows) based on the kind param.
//
// - OAuth flow:    fetches pending flow metadata, on "Authenticate" click
//                  requests the upstream authorize URL and redirects the
//                  browser. Upstream redirects back to /api/oauth/callback
//                  which completes the flow server-side.
// - Headers flow:  fetches the same flow row plus the schema and renders
//                  the values form, submitting back to the flow row's
//                  PUT endpoint. The backend verifies upstream, upserts
//                  the credential, and consumes the flow row + temp token.

import HeadersForm from "@/components/headersForm";
import FullPageLoader from "@/components/fullPageLoader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getActiveTempToken } from "@/lib/store/apis/tempToken";
import {
	getErrorMessage,
	useGetMCPFlowDetailQuery,
	useGetMCPPerUserHeadersFlowQuery,
	useIsAuthEnabledQuery,
	useStartMCPFlowMutation,
	useSubmitMCPPerUserHeadersFlowMutation,
} from "@/lib/store";
import { MCPFlowDetail } from "@/lib/types/mcpSessions";
import { MCPHeadersFlowDetail } from "@/lib/types/mcpPerUserHeaders";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, ExternalLink, Fingerprint, KeyRound, Loader2, LogIn, ShieldCheck, TriangleAlert, UserRound } from "lucide-react";
import { useQueryState } from "nuqs";
import React from "react";
import { useMemo, useState } from "react";

export default function MCPSessionsAuthPage() {
	const [flowId] = useQueryState("flow");
	const [kind] = useQueryState("kind");

	// Both surfaces ride on ?flow={id}; `kind=headers` selects the headers
	// backend. Default (no kind / kind=oauth) is the OAuth branch — keeps the
	// OAuth URL shape unchanged.
	if (kind === "headers" && flowId) {
		return <HeadersAuthView flowId={flowId} />;
	}
	return <OAuthAuthView />;
}

function OAuthAuthView() {
	const { toast } = useToast();
	const [flowId] = useQueryState("flow");
	const skip = !flowId;
	const { data: flow, isLoading, isError, error } = useGetMCPFlowDetailQuery(flowId ?? "", { skip });
	const [startFlow, { isLoading: starting }] = useStartMCPFlowMutation();
	const { data: authState } = useIsAuthEnabledQuery();
	const [usingTempToken] = useState(() => getActiveTempToken() !== null);
	const loginGoto = useMemo(() => {
		if (typeof window !== "undefined") {
			return `${window.location.pathname}${window.location.search}`;
		}
		if (flowId) {
			return `/workspace/mcp-sessions/auth?flow=${encodeURIComponent(flowId)}`;
		}
		return "/workspace/mcp-sessions/auth";
	}, [flowId]);
	const loginHref = useMemo(() => `/login?goto=${encodeURIComponent(loginGoto)}`, [loginGoto]);
	const showLoginOption = usingTempToken && authState?.is_auth_enabled === true && authState.has_valid_token === false;
	const showTempTokenSSOWarning = showLoginOption && authState.auth_type === "sso";

	if (!flowId) {
		return (
			<CenteredCard>
				<h1 className="text-xl font-semibold">缺少流程标识符</h1>
				<p className="text-muted-foreground mt-2 text-sm">
					此 URL 缺少 <code className="bg-muted rounded px-1 py-0.5">flow</code> 查询参数。请从推理响应或会话标签页中打开该链接。
				</p>
				<div className="mt-6">
					<SessionsTabLink />
				</div>
			</CenteredCard>
		);
	}

	if (isLoading) {
		return <FullPageLoader />;
	}

	if (isError || !flow) {
		const status = (error as { status?: number } | undefined)?.status;
		if (status === 401) {
			return <InvalidLinkView />;
		}
		if (status === 403) {
			return (
				<CenteredCard>
					<h1 className="text-xl font-semibold">此认证流程不属于您</h1>
					<p className="text-muted-foreground mt-2 text-sm">
						待处理的流程属于另一个身份。请让触发原始请求的同事（其虚拟密钥或用户身份）完成该流程，或由您重新发起请求。
					</p>
					<div className="mt-6">
						<SessionsTabLink />
					</div>
				</CenteredCard>
			);
		}
		if (status === 404) {
			return (
				<CenteredCard>
					<h1 className="text-xl font-semibold">此认证流程已过期或已完成</h1>
					<p className="text-muted-foreground mt-2 text-sm">
						待处理的流程会在短时间窗口后过期。如果您仍需要认证，请重新触发原始操作以创建新流程。
					</p>
					<div className="mt-6">
						<SessionsTabLink />
					</div>
				</CenteredCard>
			);
		}
		return (
			<CenteredCard>
				<h1 className="text-xl font-semibold">无法加载此认证流程</h1>
				<p className="text-muted-foreground mt-2 text-sm">{getErrorMessage(error)}</p>
			</CenteredCard>
		);
	}

	// Flow row exists but isn't pending: it's already been completed, failed,
	// or expired. Don't show the "Authenticate" button since startFlow would
	// reject (BuildUpstreamAuthorizeURL rejects non-pending flows).
	if (flow.status !== "pending") {
		return <CompletedFlowView flow={flow} />;
	}

	const handleAuthenticate = async () => {
		try {
			const res = await startFlow(flowId).unwrap();
			window.location.href = res.authorize_url;
		} catch (err) {
			toast({
				title: "启动认证失败",
				description: getErrorMessage(err),
				variant: "destructive",
			});
		}
	};

	const mcpClientName = flow.mcp_client?.name || flow.mcp_client?.client_id || "MCP 服务器";
	const isReauth = flow.has_active_token === true;

	return (
		<CenteredCard>
			<div className="bg-primary/10 mb-5 flex size-12 items-center justify-center rounded-full">
				<ShieldCheck className="text-primary size-6" />
			</div>
			<h1 className="text-xl font-semibold tracking-tight">
				使用 {mcpClientName} {isReauth ? "重新认证" : "认证"}
			</h1>
			<p className="text-muted-foreground mt-2 text-sm">
				{isReauth ? (
					<>
						下方绑定已存在有效凭据。完成此流程会用新凭据<strong>替换</strong>它。您也可以关闭此标签页，继续使用现有凭据。
					</>
				) : (
					<>
						您将被重定向到提供商以登录并授权。Bifrost 会将生成的凭据保存到下方绑定，以便本次及后续请求自动进行。
					</>
				)}
			</p>

			<dl className="bg-muted/40 mt-6 space-y-3 rounded-sm border p-4 text-sm">
				<DetailRow label="MCP 客户端" value={mcpClientName} mono={!flow.mcp_client?.name} />
				<DetailRow label="绑定至" value={<BindingValue flow={flow} />} />
				<DetailRow label="流程过期时间" value={formatExpiry(flow.expires_at)} />
			</dl>

			<div className="mt-6 flex gap-3">
				<Button onClick={handleAuthenticate} disabled={starting} data-testid="mcp-auth-authenticate-button">
					{starting ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
					<span>{isReauth ? "重新认证" : "认证"}</span>
				</Button>
				{showLoginOption && !showTempTokenSSOWarning ? (
					<Button asChild variant="outline" data-testid="mcp-auth-login-instead-inline-button">
						<a href={loginHref}>
							<LogIn className="size-4" />
							改为登录
						</a>
					</Button>
				) : null}
				<SessionsTabLink variant="ghost" />
			</div>
		</CenteredCard>
	);
}

// HeadersAuthView renders the per-user-headers submission form. Fetches the
// pending flow row + schema from /api/mcp/per-user-headers/flows/{id},
// renders one input per required key, PUTs the values back to the same flow
// endpoint. On success the backend verifies upstream, upserts the credential
// row, deletes the flow row + temp token, and we show a success card.
function HeadersAuthView({ flowId }: { flowId: string }) {
	const { toast } = useToast();
	const [submitted, setSubmitted] = useQueryState("submitted");
	// Skip the GET once the submit has completed — the backend deletes the
	// flow row on success, so any refetch returns 404 and we'd render the
	// "expired" view on top of a freshly successful submission.
	const { data: detail, isLoading, isError, error } = useGetMCPPerUserHeadersFlowQuery(flowId, { skip: submitted === "true" });
	const [submit, { isLoading: submitting }] = useSubmitMCPPerUserHeadersFlowMutation();

	if (submitted === "true") {
		return (
			<CenteredCard>
				<div className="mb-5 flex size-12 items-center justify-center rounded-full bg-emerald-500/10">
					<CheckCircle2 className="size-6 text-emerald-600" />
				</div>
				<h1 className="text-xl font-semibold tracking-tight">请求头已保存</h1>
				<p className="text-muted-foreground mt-2 text-sm">
					Bifrost 已验证连接并保存了您的凭据。您可以关闭此标签页并重试原始操作。
				</p>
				<div className="mt-6 flex gap-3">
					<SessionsTabLink />
				</div>
			</CenteredCard>
		);
	}

	if (isLoading) {
		return <FullPageLoader />;
	}

	if (isError || !detail) {
		const status = (error as { status?: number } | undefined)?.status;
		if (status === 401) {
			return <InvalidLinkView />;
		}
		// Enterprise RBAC middleware short-circuits flow endpoints with 403
		// when the caller doesn't own the flow. Mirrors the OAuth branch above
		// so headers flows get the same dedicated card instead of falling
		// through to the generic load-failure state.
		if (status === 403) {
			return (
				<CenteredCard>
					<h1 className="text-xl font-semibold">此提交流程不属于您</h1>
					<p className="text-muted-foreground mt-2 text-sm">
						待处理的流程属于另一个身份。请让触发原始请求的同事（其虚拟密钥或用户身份）完成该流程，或由您重新发起请求。
					</p>
					<div className="mt-6">
						<SessionsTabLink />
					</div>
				</CenteredCard>
			);
		}
		if (status === 404 || status === 410) {
			return (
				<CenteredCard>
					<h1 className="text-xl font-semibold">此提交链接已过期或已被使用</h1>
					<p className="text-muted-foreground mt-2 text-sm">
						提交流程会在短时间窗口后过期。请重新触发原始请求以获取新链接。
					</p>
					<div className="mt-6">
						<SessionsTabLink />
					</div>
				</CenteredCard>
			);
		}
		return (
			<CenteredCard>
				<h1 className="text-xl font-semibold">无法加载此提交链接</h1>
				<p className="text-muted-foreground mt-2 text-sm">{getErrorMessage(error)}</p>
			</CenteredCard>
		);
	}

	const handleSubmit = async (values: Record<string, string>) => {
		try {
			await submit({ flowId, body: { headers: values } }).unwrap();
			void setSubmitted("true");
		} catch (err) {
			toast({
				title: "提交失败",
				description: getErrorMessage(err),
				variant: "destructive",
			});
		}
	};

	const mcpClientName = detail.mcp_client?.name || detail.mcp_client?.client_id || "MCP 服务器";
	const isEdit = detail.has_active_credential;
	const title = isEdit ? `更新 ${mcpClientName} 的凭据` : `提交 ${mcpClientName} 的凭据`;

	return (
		<CenteredCard>
			<div className="bg-primary/10 mb-5 flex size-12 items-center justify-center rounded-full">
				<ShieldCheck className="text-primary size-6" />
			</div>
			<h1 className="text-xl font-semibold tracking-tight">{title}</h1>
			<p className="text-muted-foreground mt-2 text-sm">
				{isEdit ? (
					<>
						此服务器已为您保存了凭据。提交新值会<strong>替换</strong>现有记录；保存前将重新验证服务器。
					</>
				) : (
					<>
						此服务器要求您提供自己的 API 密钥/令牌。您提交的值会加密存储，仅用于认证您自己的请求。
					</>
				)}
			</p>

			<dl className="bg-muted/40 mt-6 space-y-3 rounded-sm border p-4 text-sm">
				<DetailRow label="MCP 客户端" value={mcpClientName} mono={!detail.mcp_client?.name} />
				<DetailRow label="绑定至" value={<HeadersBindingValue flow={detail} />} />
				<DetailRow label="流程过期时间" value={formatExpiry(detail.expires_at)} />
			</dl>

			<div className="mt-6">
				<HeadersForm
					requiredKeys={detail.required_header_keys}
					adminHeaderKeys={detail.admin_header_keys}
					previouslySubmittedKeys={detail.submitted_keys}
					onSubmit={handleSubmit}
					busy={submitting}
					submitLabel={isEdit ? "保存" : "提交"}
					testIdPrefix="mcp-headers-submit"
				/>
			</div>
		</CenteredCard>
	);
}

function HeadersBindingValue({ flow }: { flow: MCPHeadersFlowDetail }) {
	if (flow.flow_mode === "user") {
		const userID = flow.user_id;
		if (!userID) {
			return (
				<span className="inline-flex items-center gap-2">
					<UserRound className="text-muted-foreground size-3.5" />
					<Badge variant="secondary">首位登录用户</Badge>
				</span>
			);
		}
		const displayName = flow.user?.name || flow.user?.email;
		return (
			<span className="inline-flex items-center gap-2">
				<UserRound className="text-muted-foreground size-3.5" />
				{displayName ? <span>{displayName}</span> : <span className="font-mono">{userID}</span>}
			</span>
		);
	}
	if (flow.flow_mode === "vk" && flow.virtual_key) {
		return (
			<span className="inline-flex items-center gap-2">
				<KeyRound className="text-muted-foreground size-3.5" />
				<span>{flow.virtual_key.name || flow.virtual_key.id}</span>
			</span>
		);
	}
	if (flow.flow_mode === "session" && flow.session_id) {
		return (
			<span className="inline-flex items-center gap-2">
				<Fingerprint className="text-muted-foreground size-3.5" />
				<span className="font-mono">{flow.session_id}</span>
			</span>
		);
	}
	return <span className="text-muted-foreground italic">未知</span>;
}

function CompletedFlowView({ flow }: { flow: MCPFlowDetail }) {
	const mcpClientName = flow.mcp_client?.name || flow.mcp_client?.client_id || "此 MCP 服务器";
	// has_active_token wins over the flow's row status: a pending flow with an
	// existing active token means OAuth was re-initiated unnecessarily.
	const effectivelyAuthorized = flow.status === "authorized" || flow.has_active_token;
	const title = effectivelyAuthorized
		? "已认证"
		: flow.status === "expired"
			? "此认证流程已过期"
			: "此认证流程已无法完成";
	const body = effectivelyAuthorized
		? `${mcpClientName} 的 OAuth 凭据已保存。您可以关闭此标签页。`
		: "请重新触发原始操作以创建新流程。";
	return (
		<CenteredCard>
			<h1 className="text-xl font-semibold tracking-tight">{title}</h1>
			<p className="text-muted-foreground mt-2 text-sm">{body}</p>
			<dl className="bg-muted/40 mt-6 space-y-3 rounded-sm border p-4 text-sm">
				<DetailRow label="MCP 客户端" value={mcpClientName} mono={!flow.mcp_client?.name} />
				<DetailRow label="绑定至" value={<BindingValue flow={flow} />} />
			</dl>
			<div className="mt-6">
				<SessionsTabLink />
			</div>
		</CenteredCard>
	);
}

function DetailRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
	return (
		<div className="flex items-start justify-between gap-4">
			<dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</dt>
			<dd className={`text-right text-sm ${mono ? "font-mono" : ""}`}>{value}</dd>
		</div>
	);
}

function BindingValue({ flow }: { flow: MCPFlowDetail }) {
	if (flow.flow_mode === "user") {
		const userID = flow.user_id;
		if (!userID) {
			return (
				<span className="inline-flex items-center gap-2">
					<UserRound className="text-muted-foreground size-3.5" />
					<Badge variant="secondary">首位登录用户</Badge>
				</span>
			);
		}
		const displayName = flow.user?.name || flow.user?.email;
		return (
			<span className="inline-flex items-center gap-2">
				<UserRound className="text-muted-foreground size-3.5" />
				{displayName ? <span>{displayName}</span> : <span className="font-mono">{userID}</span>}
			</span>
		);
	}
	if (flow.flow_mode === "vk" && flow.virtual_key) {
		return (
			<span className="inline-flex items-center gap-2">
				<KeyRound className="text-muted-foreground size-3.5" />
				<span>{flow.virtual_key.name || flow.virtual_key.id}</span>
			</span>
		);
	}
	if (flow.flow_mode === "session" && flow.session_id) {
		return (
			<span className="inline-flex items-center gap-2">
				<Fingerprint className="text-muted-foreground size-3.5" />
				<span className="font-mono">{flow.session_id}</span>
			</span>
		);
	}
	return <span className="text-muted-foreground italic">未知</span>;
}

function formatExpiry(iso: string): string {
	try {
		const t = new Date(iso).getTime();
		if (Number.isNaN(t)) return iso;
		const diffMs = t - Date.now();
		if (diffMs < 0) return "已过期";
		const mins = Math.floor(diffMs / 60_000);
		if (mins < 1) return "不到 1 分钟后";
		if (mins === 1) return "1 分钟后";
		return `${mins} 分钟后`;
	} catch {
		return iso;
	}
}

function CenteredCard({ children }: { children: React.ReactNode }) {
	return (
		<div className="mx-auto flex min-h-[calc(100dvh-6rem)] w-full max-w-xl items-center justify-center p-6">
			<div className="bg-card w-full rounded-sm border p-8 shadow-sm">{children}</div>
		</div>
	);
}

function SessionsTabLink({ variant = "outline" }: { variant?: "outline" | "ghost" }) {
	// Hide the link only when the visitor has no dashboard session — for them,
	// /workspace/mcp-sessions would 401 and bounce to /login. Admins (cookie
	// present) still see it. ClientLayout already cached this query for the
	// route, so this is a free hook call.
	const { data: authState } = useIsAuthEnabledQuery();
	if (authState?.is_auth_enabled && !authState.has_valid_token) {
		return null;
	}
	return (
		<Button asChild variant={variant} data-testid="mcp-auth-sessions-tab-link">
			<Link to="/workspace/mcp-sessions">打开会话标签页</Link>
		</Button>
	);
}

// InvalidLinkView renders when the per-user-flow API returns 401, which now
// means the caller arrived without either a valid dashboard session or a
// valid mcp_auth temp token. Most often this is an expired or hand-edited
// link — the temp token embedded in the URL fragment has aged out or the
// fragment was dropped along the way. Trigger the original action again to
// get a fresh URL.
function InvalidLinkView() {
	return (
		<CenteredCard>
			<h1 className="text-xl font-semibold tracking-tight">此认证链接已失效</h1>
			<p className="text-muted-foreground mt-2 text-sm">
				该链接可能已过期、已被使用、无效，或其短期令牌已被移除。请重新触发原始操作以创建新的认证链接。
			</p>
		</CenteredCard>
	);
}