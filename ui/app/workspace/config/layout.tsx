import { createFileRoute, Outlet, useChildMatches } from "@tanstack/react-router";
import FullPageLoader from "@/components/fullPageLoader";
import { NoPermissionView } from "@/components/noPermissionView";
import { useGetCoreConfigQuery } from "@/lib/store";
import { RbacOperation, RbacResource, useRbac } from "@enterprise/lib";
import ConfigPage from "./page";

function RouteComponent() {
	const hasSettingsAccess = useRbac(RbacResource.Settings, RbacOperation.View);
	const childMatches = useChildMatches();

	const { isLoading } = useGetCoreConfigQuery({ fromDB: true }, { skip: !hasSettingsAccess });

	if (!hasSettingsAccess) {
		return <NoPermissionView entity="配置" />;
	}

	if (isLoading) {
		return <FullPageLoader />;
	}

	return childMatches.length === 0 ? <ConfigPage /> : <Outlet />;
}

export const Route = createFileRoute("/workspace/config")({
	component: RouteComponent,
});