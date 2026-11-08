import { UserRoundCheck } from "lucide-react";
import ContactUsView from "../views/contactUsView";

export default function RBACView() {
	return (
		<div className="h-full w-full">
			<ContactUsView
				className="mx-auto min-h-[80vh]"
				icon={<UserRoundCheck className="h-[5.5rem] w-[5.5rem]" strokeWidth={1} />}
				title="解锁角色与权限，提升安全性"
				description="此功能属于 Bifrost 企业版许可。我们很希望了解您的使用场景，以及如何为您提供帮助。"
				readmeLink="https://docs.getbifrost.ai/enterprise/advanced-governance"
			/>
		</div>
	);
}