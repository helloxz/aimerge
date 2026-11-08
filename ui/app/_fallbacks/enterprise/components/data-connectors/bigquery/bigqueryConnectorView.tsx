import { Database } from "lucide-react";
import ContactUsView from "../../views/contactUsView";

interface EnableToggleProps {
	enabled: boolean;
	onToggle: () => void;
	disabled?: boolean;
}

interface BigQueryConnectorViewProps {
	onDelete?: () => void;
	isDeleting?: boolean;
	enableToggle?: EnableToggleProps;
}

export default function BigQueryConnectorView(_props: BigQueryConnectorViewProps) {
	return (
		<div className="space-y-6">
			{/* Content - OSS: paywall only; no delete/save buttons */}
			<div className="space-y-4">
				<div className="flex w-full flex-col items-center justify-center py-8">
					<ContactUsView
						align="middle"
						className="mx-auto w-full max-w-lg"
						icon={<Database className="h-[5.5rem] w-[5.5rem]" strokeWidth={1} />}
						title="解锁 BigQuery 原生数据接入，助力分析"
						description="此功能属于 Bifrost 企业版许可。我们很希望了解您的使用场景，以及如何为您提供帮助。"
						readmeLink="https://docs.getbifrost.ai/enterprise/bigquery-connector"
					/>
				</div>
			</div>
		</div>
	);
}