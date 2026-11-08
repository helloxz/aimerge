import { ShieldCheck } from "lucide-react";
import ContactUsView from "../views/contactUsView";

export default function AccessProfilesIndexView() {
	return (
		<div className="h-full w-full">
			<ContactUsView
				className="mx-auto min-h-[80vh]"
				icon={<ShieldCheck className="h-[5.5rem] w-[5.5rem]" strokeWidth={1} />}
				title="解锁访问配置，提升性能表现"
				description="此功能属于 Bifrost 企业版许可。创建访问配置以控制对您资源的访问。"
				readmeLink="https://docs.getbifrost.ai/enterprise/access-profiles"
				testIdPrefix="access-profiles"
			/>
		</div>
	);
}