import { Users } from "lucide-react";
import ContactUsView from "../views/contactUsView";

export default function UsersView() {
	return (
		<div className="w-full">
			<ContactUsView
				className="mx-auto min-h-[80vh]"
				icon={<Users className="h-[5.5rem] w-[5.5rem]" strokeWidth={1} />}
				title="解锁用户与用户治理"
				description="管理用户、设置每用户预算与速率限制，并通过企业级治理控制访问。此功能属于 Bifrost 企业版许可。"
				readmeLink="https://docs.getbifrost.ai/enterprise/advanced-governance"
			/>
		</div>
	);
}