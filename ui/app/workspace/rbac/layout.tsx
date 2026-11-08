import { createFileRoute } from "@tanstack/react-router";
import { NoPermissionView } from "@/components/noPermissionView";
import { RbacOperation, RbacResource, useRbac } from "@enterprise/lib";
import RBACRedirectPage from "./page";

function RouteComponent() {
	const hasRbacAccess = useRbac(RbacResource.RBAC, RbacOperation.View);
	if (!hasRbacAccess) {
		return <NoPermissionView entity="角色与权限" />;
	}
	return <RBACRedirectPage />;
}

export const Route = createFileRoute("/workspace/rbac")({
	component: RouteComponent,
});