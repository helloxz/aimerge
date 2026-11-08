import { createFileRoute, Outlet, useChildMatches } from "@tanstack/react-router";
import { NoPermissionView } from "@/components/noPermissionView";
import { RbacOperation, RbacResource, useRbac } from "@enterprise/lib";
import GovernancePage from "./page";

function RouteComponent() {
	const hasVirtualKeysAccess = useRbac(RbacResource.VirtualKeys, RbacOperation.View);
	const hasTeamsAccess = useRbac(RbacResource.Teams, RbacOperation.View);
	const hasCustomersAccess = useRbac(RbacResource.Customers, RbacOperation.View);
	const hasAccessProfilesAccess = useRbac(RbacResource.AccessProfiles, RbacOperation.View);

	const hasAnyGovernanceAccess =
		hasVirtualKeysAccess ||
		hasTeamsAccess ||
		hasCustomersAccess ||
		hasAccessProfilesAccess;

	const childMatches = useChildMatches();
	if (!hasAnyGovernanceAccess) {
		return <NoPermissionView entity="治理" />;
	}
	return childMatches.length === 0 ? <GovernancePage /> : <Outlet />;
}

export const Route = createFileRoute("/workspace/governance")({
	component: RouteComponent,
});