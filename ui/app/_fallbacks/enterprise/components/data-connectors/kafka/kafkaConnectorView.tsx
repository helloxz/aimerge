import ContactUsView from "../../views/contactUsView";

interface KafkaConnectorViewProps {
	onDelete?: () => void;
	isDeleting?: boolean;
}

export default function KafkaConnectorView(_props: KafkaConnectorViewProps) {
	return (
		<div className="space-y-6">
			<div className="space-y-4">
				<div className="flex w-full flex-col items-center justify-center py-8">
					<ContactUsView
						align="middle"
						className="mx-auto w-full max-w-lg"
						testIdPrefix="kafka-connector"
						icon={<img src="/images/kafka-logo.svg" alt="Kafka" width={88} height={88} />}
						title="解锁 Kafka 原生日志流，实现实时可观测性"
						description="此功能属于 Bifrost 企业版许可。将已完成的请求链路以 JSON 形式流式写入 Kafka 主题，用于实时分析、告警与下游处理。"
						readmeLink="https://docs.getbifrost.ai/enterprise/kafka-connector"
					/>
				</div>
			</div>
		</div>
	);
}