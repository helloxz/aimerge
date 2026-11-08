import { Router } from "lucide-react";
import ContactUsView from "../views/contactUsView";

export default function PromptDeploymentView(_props?: { omitTitle?: boolean }) {
	return (
		<div className="w-full">
			<ContactUsView
				align="top"
				className="justify-start gap-3 rounded-md border p-4"
				icon={<Router className="h-8 w-8" strokeWidth={1.5} />}
				title="解锁提示词部署，实现更好的提示词版本管理与 A/B 测试。"
				description="此功能属于 Bifrost 企业版许可。我们很希望了解您的使用场景，以及如何为您提供帮助。"
				readmeLink="https://docs.getbifrost.ai/enterprise/prompt-deployments"
			/>
		</div>
	);
}