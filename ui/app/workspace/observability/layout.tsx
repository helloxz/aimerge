import { createFileRoute } from "@tanstack/react-router";
import { NoPermissionView } from "@/components/noPermissionView";
import { RbacOperation, RbacResource, useRbac } from "@enterprise/lib";
import ObservabilityPage from "./page";

function RouteComponent() {
	const hasObservabilityAccess = useRbac(RbacResource.Observability, RbacOperation.View);
	if (!hasObservabilityAccess) {
		return <NoPermissionView entity="可观测性设置" />;
	}
	return <ObservabilityPage />;
}

export const Route = createFileRoute("/workspace/observability")({
	component: RouteComponent,
});