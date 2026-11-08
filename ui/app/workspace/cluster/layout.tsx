import { createFileRoute } from "@tanstack/react-router";
import { NoPermissionView } from "@/components/noPermissionView";
import { RbacOperation, RbacResource, useRbac } from "@enterprise/lib";
import ClusterPage from "./page";

function RouteComponent() {
	const hasClusterAccess = useRbac(RbacResource.Cluster, RbacOperation.View);
	if (!hasClusterAccess) {
		return <NoPermissionView entity="集群配置" />;
	}
	return <ClusterPage />;
}

export const Route = createFileRoute("/workspace/cluster")({
	component: RouteComponent,
});