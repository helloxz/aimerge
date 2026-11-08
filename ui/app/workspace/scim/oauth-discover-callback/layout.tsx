import { createFileRoute } from "@tanstack/react-router";
import { NoPermissionView } from "@/components/noPermissionView";
import { RbacOperation, RbacResource, useRbac } from "@enterprise/lib";
import OAuthDiscoverCallbackPage from "./page";

function RouteComponent() {
	const hasUserProvisioningAccess = useRbac(RbacResource.UserProvisioning, RbacOperation.View);
	if (!hasUserProvisioningAccess) {
		return <NoPermissionView entity="用户预配" />;
	}
	return <OAuthDiscoverCallbackPage />;
}

export const Route = createFileRoute("/workspace/scim/oauth-discover-callback")({
	component: RouteComponent,
});