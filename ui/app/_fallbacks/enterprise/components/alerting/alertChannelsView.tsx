import AlertingPlaceholderView from "./alertingPlaceholderView";

export default function AlertChannelsView() {
	return (
		<AlertingPlaceholderView
			title="解锁告警通道，实现主动监控"
			description="此功能属于 Bifrost 企业版许可。配置 Slack、PagerDuty、OpsGenie 和 Webhook 告警，提前发现预算与性能问题。"
			readmeLink="https://docs.getbifrost.ai/enterprise/alerting/alert-channels"
			testIdPrefix="alert-channels"
		/>
	);
}
