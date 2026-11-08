import AlertingPlaceholderView from "./alertingPlaceholderView";

export default function AlertRulesView() {
	return (
		<AlertingPlaceholderView
			title="解锁告警规则，实现主动监控"
			description="此功能属于 Bifrost 企业版许可。定义告警规则，在预算、延迟与性能劣化演变为故障之前及时捕获。"
			readmeLink="https://docs.getbifrost.ai/enterprise/alerting/alert-rules"
			testIdPrefix="alert-rules"
		/>
	);
}