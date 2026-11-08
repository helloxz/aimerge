import { Radio } from "lucide-react";
import ContactUsView from "../../views/contactUsView";

interface EnableToggleProps {
	enabled: boolean;
	onToggle: () => void;
	disabled?: boolean;
}

interface PubSubConnectorViewProps {
	onDelete?: () => void;
	isDeleting?: boolean;
	enableToggle?: EnableToggleProps;
}

export default function PubSubConnectorView(_props: PubSubConnectorViewProps) {
	return (
		<div className="space-y-6">
			<div className="space-y-4">
				<div className="flex w-full flex-col items-center justify-center py-8">
					<ContactUsView
						align="middle"
						className="mx-auto w-full max-w-lg"
						icon={<Radio className="h-[5.5rem] w-[5.5rem]" strokeWidth={1} />}
						title="解锁 Google Cloud Pub/Sub 链路流式传输"
						description="此功能属于 Bifrost 企业版许可。我们很希望了解您的使用场景，以及如何为您提供帮助。"
						readmeLink="https://docs.getbifrost.ai/enterprise/pubsub-connector"
						testIdPrefix="pubsub-connector"
					/>
				</div>
			</div>
		</div>
	);
}