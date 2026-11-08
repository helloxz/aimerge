import { CircuitBoard } from "lucide-react";
import ContactUsView from "../views/contactUsView";

export default function CircuitBreakerView() {
	return (
		<div className="h-full w-full">
			<ContactUsView
				className="mx-auto min-h-[80vh]"
				icon={<CircuitBoard className="h-[5.5rem] w-[5.5rem]" strokeWidth={1} />}
				title="解锁熔断，实现可靠的故障转移"
				description="此功能属于 Bifrost 企业版许可。当主端点出现故障迹象时，自动将流量切换到备用提供商。"
				readmeLink="https://docs.getbifrost.ai/enterprise/circuit-breaker"
			/>
		</div>
	);
}