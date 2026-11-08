import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useGetCoreConfigQuery } from "@/lib/store";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { Link } from "@tanstack/react-router";
import { Copy, InfoIcon, KeyRound } from "lucide-react";
import { useMemo } from "react";
import ContactUsView from "../views/contactUsView";

export default function APIKeysView() {
	const { data: bifrostConfig, isLoading } = useGetCoreConfigQuery({ fromDB: true });
	const isAuthConfigure = useMemo(() => {
		return bifrostConfig?.auth_config?.is_enabled;
	}, [bifrostConfig]);

	const curlExample = `# Base64 encode your username:password
# Example: echo -n "username:password" | base64
curl --location 'http://localhost:8080/v1/chat/completions'
--header 'Content-Type: application/json' 
--header 'Accept: application/json' 
--header 'Authorization: Basic <base64_encoded_username:password>' 
--data '{ 
  "model": "openai/gpt-4", 
  "messages": [ 
    { 
      "role": "user", 
      "content": "explain big bang?" 
    } 
  ] 
}'`;

	const { copy: copyToClipboard } = useCopyToClipboard();

	if (isLoading) {
		return <div>加载中...</div>;
	}
	if (!isAuthConfigure) {
		return (
			<Alert variant="default">
				<InfoIcon className="text-muted h-4 w-4" />
				<AlertDescription>
					<p className="text-md text-muted-foreground">
						要生成 API 密钥，您需要先设置管理员用户名和密码。{" "}
						<Link to="/workspace/config/security" className="text-md text-primary underline">
							配置安全设置
						</Link>
						。<br />
						<br />
						生成后，您需要在调用 Bifrost 管理 API 和访问 UI 时使用此 API 密钥。
					</p>
				</AlertDescription>
			</Alert>
		);
	}

	const isInferenceAuthDisabled = !(bifrostConfig?.client_config?.enforce_auth_on_inference ?? false);

	return (
		<div className="mx-auto w-full max-w-4xl space-y-4">
			<Alert variant="default">
				<InfoIcon className="text-muted h-4 w-4" />
				<AlertDescription>
					<p className="text-md text-muted-foreground">
						{isInferenceAuthDisabled ? (
							<>
								当前推理 API 调用<strong>未启用身份验证</strong>。您可以发送推理请求而无需身份验证。仪表盘和管理 API 调用仍需要 Basic 认证，请将管理员凭证按标准{" "}
								<code className="bg-muted rounded px-1 py-0.5 text-sm">username:password</code> 格式进行 base64 编码。
							</>
						) : (
							<>
								调用 Bifrost API 时请使用管理员凭证进行 Basic 认证。请将凭证按标准{" "}
								<code className="bg-muted rounded px-1 py-0.5 text-sm">username:password</code> 格式进行 base64 编码。
							</>
						)}
					</p>
					{!isInferenceAuthDisabled && (
						<>
							<br />
							<p className="text-md text-muted-foreground">
								<strong>示例：</strong>
							</p>

							<div className="relative mt-2 w-full min-w-0 overflow-x-auto">
								<Button variant="ghost" size="sm" onClick={() => copyToClipboard(curlExample)} className="absolute top-2 right-2 z-10 h-8">
									<Copy className="h-4 w-4" />
								</Button>
								<pre className="bg-muted min-w-max rounded p-3 pr-12 font-mono text-sm whitespace-pre">{curlExample}</pre>
							</div>
						</>
					)}
				</AlertDescription>
			</Alert>

			<ContactUsView
				className="mt-4 rounded-md border px-3 py-8"
				icon={<KeyRound size={48} />}
				title="基于作用域的 API 密钥"
				description="需要基于作用域 API 密钥的精细化访问控制？企业版客户可为不同服务、团队或环境创建多个具有特定权限的 API 密钥。"
				readmeLink="https://docs.getbifrost.io/enterprise/api-keys"
			/>
		</div>
	);
}