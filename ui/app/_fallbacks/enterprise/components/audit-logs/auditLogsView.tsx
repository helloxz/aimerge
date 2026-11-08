import { ScrollText } from "lucide-react";
import ContactUsView from "../views/contactUsView";

export default function AuditLogsView() {
	return (
		<div className="h-full w-full">
			<ContactUsView
				className="mx-auto min-h-[80vh]"
				icon={<ScrollText className="h-[5.5rem] w-[5.5rem]" strokeWidth={1} />}
				title="解锁审计日志，提升合规能力"
				description="此功能属于 Bifrost 企业版许可。我们很希望了解您的使用场景，以及如何为您提供帮助。"
				readmeLink="https://docs.getbifrost.ai/enterprise/audit-logs"
			/>
		</div>
	);
}