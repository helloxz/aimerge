import { Layers } from "lucide-react";
import ContactUsView from "../views/contactUsView";

export default function ClusterPage() {
	return (
		<div className="h-full w-full">
			<ContactUsView
				className="mx-auto min-h-[80vh]"
				icon={<Layers className="h-[5.5rem] w-[5.5rem]" strokeWidth={1} />}
				title="解锁集群模式，实现可靠扩展"
				description="此功能属于 Bifrost 企业版许可。我们很希望了解您的使用场景，以及如何为您提供帮助。"
				readmeLink="https://docs.getbifrost.ai/enterprise/clustering"
			/>
		</div>
	);
}