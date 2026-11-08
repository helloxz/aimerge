import { Users } from "lucide-react";
import ContactUsView from "../views/contactUsView";

export default function UserRankingsTab() {
	return (
		<div className="h-full w-full">
			<ContactUsView
				className="mx-auto min-h-[80vh]"
				icon={<Users className="h-[5.5rem] w-[5.5rem]" strokeWidth={1} />}
				title="解锁用户排行，提升可见性"
				description="此功能属于 Bifrost 企业版许可。我们很希望了解您的使用场景，以及如何为您提供帮助。"
				readmeLink="https://docs.getbifrost.ai/enterprise/user-rankings"
				testIdPrefix="user-rankings"
			/>
		</div>
	);
}