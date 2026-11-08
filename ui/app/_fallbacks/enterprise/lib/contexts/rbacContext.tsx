import { createContext, useContext } from "react";

// RBAC Resource Names (must match backend definitions)
export enum RbacResource {
	Settings = "Settings",
	Logs = "Logs",
	Observability = "Observability",
	Dashboard = "Dashboard",
	VirtualKeys = "VirtualKeys",
	ModelProvider = "ModelProvider",
	Plugins = "Plugins",
	MCPGateway = "MCPGateway",
	MCPLogs = "MCPLogs",
	Customers = "Customers",
	Teams = "Teams",
	Governance = "Governance",
	RoutingRules = "RoutingRules",
	PromptRepository = "PromptRepository",
	PromptDeploymentStrategy = "PromptDeploymentStrategy",
	SkillsRepository = "SkillsRepository",
	AccessProfiles = "AccessProfiles",
	Inference = "Inference",
	Metrics = "Metrics",
	FeatureFlags = "FeatureFlags",
}

// RBAC Operation Names (must match backend definitions)
export enum RbacOperation {
	Read = "Read",
	View = "View",
	Create = "Create",
	Update = "Update",
	Delete = "Delete",
	Reveal = "Reveal",
	Download = "Download",
}

interface RbacContextType {
	isAllowed: (resource: RbacResource, operation: RbacOperation) => boolean;
	permissions: Record<string, Record<string, boolean>>;
	isLoading: boolean;
	refetch: () => void;
}

const RbacContext = createContext<RbacContextType | null>(null);

// Dummy provider that allows all permissions
export function RbacProvider({ children }: { children: React.ReactNode }) {
	return (
		<RbacContext.Provider
			value={{
				isAllowed: () => true, // Always allow in OSS
				permissions: {},
				isLoading: false,
				refetch: () => {},
			}}
		>
			{children}
		</RbacContext.Provider>
	);
}

// Hook that always returns true (no restrictions in OSS)
export function useRbac(_resource: RbacResource, _operation: RbacOperation): boolean {
	return true;
}

// Hook to access full RBAC context
export function useRbacContext() {
	const context = useContext(RbacContext);
	if (!context) {
		// Return dummy values if used outside provider
		return {
			isAllowed: () => true,
			permissions: {},
			isLoading: false,
			refetch: () => {},
		};
	}
	return context;
}
