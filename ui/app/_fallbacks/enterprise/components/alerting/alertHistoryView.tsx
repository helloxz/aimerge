import AlertingPlaceholderView from "./alertingPlaceholderView";

export default function AlertHistoryView() {
	return (
		<AlertingPlaceholderView
			title="解锁告警历史，实现主动监控"
			description="此功能属于 Bifrost 企业版许可。在一处集中查看告警的送达结果、失败记录与解决事件。"
			readmeLink="https://docs.getbifrost.ai/enterprise/alerting/alert-history"
			testIdPrefix="alert-history"
		/>
	);
}