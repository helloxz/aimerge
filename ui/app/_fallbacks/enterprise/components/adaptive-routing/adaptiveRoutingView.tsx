import { Shuffle } from "lucide-react";
import ContactUsView from "../views/contactUsView";

export default function AdaptiveRoutingView() {
	return (
		<div className="h-full w-full">
			<ContactUsView
				className="mx-auto min-h-[80vh]"
				icon={<Shuffle className="h-[5.5rem] w-[5.5rem]" strokeWidth={1} />}
				title="解锁自适应路由，提升性能表现"
				description="此功能属于 Bifrost 企业版许可。我们很希望了解您的使用场景，以及如何为您提供帮助。"
				readmeLink="https://docs.getbifrost.ai/enterprise/adaptive-load-balancing"
			/>
		</div>
	);
}