import { useVirtualKeyUsage } from "@/app/workspace/virtual-keys/hooks/useVirtualKeyUsage";
import { BudgetOverrideDialog } from "@/components/budgetOverrideDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alertDialog";
import { CustomerSelector } from "@/components/entitySelectors/customerSelector";
import { TeamSelector } from "@/components/entitySelectors/teamSelector";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/datePickerWithRange";
import { ComboboxSelect } from "@/components/ui/combobox";
import { ConfigSyncAlert } from "@/components/ui/configSyncAlert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import MultiBudgetLines from "@/components/ui/multibudgets";
import { MultiSelect } from "@/components/ui/multiSelect";
import NumberAndSelect from "@/components/ui/numberAndSelect";
import { ProviderConfigCard } from "@/components/ui/providerConfigCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DottedSeparator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import Toggle from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { resetDurationOptions, supportsCalendarAlignment } from "@/lib/constants/governance";
import { ProviderIconType, RenderProviderIcon } from "@/lib/constants/icons";
import { ProviderLabels, ProviderName } from "@/lib/constants/logs";
import {
	getErrorMessage,
	useCreateVirtualKeyMutation,
	useGetAllKeysQuery,
	useGetMCPClientsQuery,
	useGetProvidersQuery,
	useGetTeamQuery,
	useRotateVirtualKeyMutation,
	useRemoveVirtualKeyBudgetOverrideMutation,
	useSetVirtualKeyBudgetOverrideMutation,
	useUpdateVirtualKeyMutation,
} from "@/lib/store";
import { KnownProvider } from "@/lib/types/config";
import { BudgetOverrideRequest, CreateVirtualKeyRequest, UpdateVirtualKeyRequest, VirtualKey } from "@/lib/types/governance";
import {
	type BudgetComparisonEntry,
	budgetSignature,
	formatCurrency,
	getEffectiveBudgetLimit,
	hasActiveBudgetOverride,
	parseResetPeriod,
	quarterStartOf,
} from "@/lib/utils/governance";
import ManagedVirtualKeyActions from "@enterprise/components/access-profiles/managedVirtualKeyActions";
import { RbacOperation, RbacResource, useRbac } from "@enterprise/lib";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Info, Lock, RotateCcw, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

interface VirtualKeySheetProps {
	virtualKey?: VirtualKey | null;
	// When set, the new VK is created under this team. The entity assignment is pre-set
	// and cannot be changed (but all other fields remain editable).
	defaultTeamId?: string;
	onSave: () => void;
	onCancel: () => void;
}

// Provider configuration schema
const providerConfigSchema = z.object({
	id: z.number().optional(),
	provider: z.string().min(1, "请选择提供商"),
	weight: z.number().min(0, "权重不能小于 0").max(1, "权重不能大于 1").optional(),
	allowed_models: z.array(z.string()).optional(),
	blacklisted_models: z.array(z.string()).optional(),
	key_ids: z.array(z.string()).optional(), // Keys associated with this provider config
	// Provider-level budget
	budgets: z
		.array(
			z.object({
				id: z.string().optional(),
				max_limit: z.number().nonnegative().optional(),
				reset_duration: z.string().optional(),
				// Zod strips unknown keys, so the fiscal quarter has to be declared
				// here or it is erased from form state on every parse.
				reset_config: z.object({ quarter_start_month: z.number().int().min(1).max(12).optional() }).optional(),
			}),
		)
		.optional(),
	// Provider-level rate limits
	rate_limit: z
		.object({
			token_max_limit: z.number().int().nonnegative().optional(),
			token_reset_duration: z.string().optional(),
			request_max_limit: z.number().int().nonnegative().optional(),
			request_reset_duration: z.string().optional(),
		})
		.optional(),
	// Per-model budgets/rate-limits under this provider
	model_budgets: z
		.array(
			z.object({
				model_name: z.string().trim().min(1, "请输入模型名称"),
				budgets: z
					.array(
						z.object({
							id: z.string().optional(),
							max_limit: z.number().nonnegative().optional(),
							reset_duration: z.string().optional(),
							reset_config: z.object({ quarter_start_month: z.number().int().min(1).max(12).optional() }).optional(),
						}),
					)
					.optional(),
				rate_limit: z
					.object({
						token_max_limit: z.number().int().nonnegative().optional(),
						token_reset_duration: z.string().optional(),
						request_max_limit: z.number().int().nonnegative().optional(),
						request_reset_duration: z.string().optional(),
					})
					.optional(),
			}),
		)
		.optional(),
});

const mcpConfigSchema = z.object({
	id: z.number().optional(),
	mcp_client_name: z.string().min(1, "请输入 MCP 客户端名称"),
	tools_to_execute: z.array(z.string()).optional(),
});

// Main form schema
const formSchema = z
	.object({
		name: z.string().min(1, "请输入虚拟密钥名称"),
		description: z.string().optional(),
		providerConfigs: z.array(providerConfigSchema).optional(),
		mcpConfigs: z.array(mcpConfigSchema).optional(),
		entityType: z.enum(["team", "customer", "none"]),
		teamId: z.string().optional(),
		customerId: z.string().optional(),
		isActive: z.boolean(),
		expiresAt: z.string().nullable().optional(), // ISO 8601 datetime-local string, or null to clear
		// Budget
		budgetCalendarAligned: z.boolean(),
		budgets: z
			.array(
				z.object({
					id: z.string().optional(),
					max_limit: z.number().nonnegative().optional(),
					reset_duration: z.string(),
					reset_config: z.object({ quarter_start_month: z.number().int().min(1).max(12).optional() }).optional(),
				}),
			)
			.optional(),
		// Token limits
		tokenMaxLimit: z.number().int().nonnegative().optional(),
		tokenResetDuration: z.string().optional(),
		// Request limits
		requestMaxLimit: z.number().int().nonnegative().optional(),
		requestResetDuration: z.string().optional(),
	})
	.refine(
		(data) => {
			// If entityType is "team", teamId must be provided and not empty
			if (data.entityType === "team") {
				return data.teamId && data.teamId.trim() !== "";
			}
			// If entityType is "customer", customerId must be provided and not empty
			if (data.entityType === "customer") {
				return data.customerId && data.customerId.trim() !== "";
			}
			return true;
		},
		{
			message: "选择分配类型后，请指定有效的团队或客户",
			path: ["entityType"], // This will show the error on the entityType field
		},
	);

type FormData = z.infer<typeof formSchema>;

/**
 * Why the save dialog is asking about existing usage.
 *
 * The two cases need different copy: "over-limit" means the recorded spend already
 * meets or exceeds the new cap, while "quarter-shift" only means the reset boundary
 * moved under a live budget - which fires at any usage above zero, so labelling it
 * as over-limit would misdescribe a budget that is nowhere near its cap.
 */
type BudgetUsageWarning = {
	kind: "over-limit" | "quarter-shift";
	message: string;
};

const pad2 = (n: number) => n.toString().padStart(2, "0");

const toDatetimeLocal = (d: Date) =>
	`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

const presetFromNow = (offsetMs: number) => toDatetimeLocal(new Date(Date.now() + offsetMs));

const EXPIRY_PRESETS = [
	{ label: "30 分钟", ms: 30 * 60_000 },
	{ label: "1 小时", ms: 60 * 60_000 },
	{ label: "24 小时", ms: 24 * 60 * 60_000 },
	{ label: "7 天", ms: 7 * 24 * 60 * 60_000 },
] as const;

interface ExpiryFieldProps {
	value: string | null | undefined;
	onChange: (v: string | null) => void;
}

function ExpiryPickerField({ value, onChange }: ExpiryFieldProps) {
	// Preset timestamps are computed from Date.now() at click time, so the picked
	// preset can't be derived back from the value; track it for highlighting.
	const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

	return (
		<FormItem>
			<FormLabel>过期时间</FormLabel>
			<p className="text-muted-foreground text-xs">
				{value
					? `此密钥将于 ${formatDistanceToNow(new Date(value), { addSuffix: true, locale: zhCN })}过期。`
					: "此密钥永不过期。"}
			</p>
			<div className="flex flex-wrap gap-1.5">
				<Button
					type="button"
					variant={!value ? "default" : "outline"}
					size="sm"
					onClick={() => {
						setSelectedPreset(null);
						onChange(null);
					}}
				>
					永不过期
				</Button>
				{EXPIRY_PRESETS.map(({ label, ms }) => (
					<Button
						key={label}
						type="button"
						variant={value && selectedPreset === label ? "default" : "outline"}
						size="sm"
						onClick={() => {
							setSelectedPreset(label);
							onChange(presetFromNow(ms));
						}}
					>
						{label}
					</Button>
				))}
				<DateTimePicker
					buttonClassName="h-8 text-sm px-3"
					buttonVariant={value && !selectedPreset ? "default" : "outline"}
					dateTime={value ? new Date(value) : undefined}
					disabledBefore={new Date()}
					onDateTimeUpdate={(dt) => {
						setSelectedPreset(null);
						onChange(toDatetimeLocal(dt));
					}}
				/>
			</div>
			<FormMessage />
		</FormItem>
	);
}

export default function VirtualKeySheet({ virtualKey, defaultTeamId, onSave, onCancel }: VirtualKeySheetProps) {
	const [isOpen, setIsOpen] = useState(true);
	const navigate = useNavigate();
	const isEditing = !!virtualKey;

	const hasCreateAccess = useRbac(RbacResource.VirtualKeys, RbacOperation.Create);
	const hasUpdateAccess = useRbac(RbacResource.VirtualKeys, RbacOperation.Update);
	const canSubmit = isEditing ? hasUpdateAccess : hasCreateAccess;

	// Detect AP-managed status via the managing profile's virtual_key_ids, not just by the presence
	// of assignees — directly-attached users don't imply an access-profile relation.
	const { assignedUsers, isManagedByProfile: isManagedByProfileHook, managingProfile } = useVirtualKeyUsage(virtualKey);
	const isManagedByProfile = isEditing && isManagedByProfileHook;
	// Team attachment: when creating from a team context (defaultTeamId provided), the entity
	// assignment is pre-set and locked. When editing an existing VK the assignment can be changed.
	const attachedTeamId = isEditing ? virtualKey?.team_id || "" : defaultTeamId || "";
	const isTeamLocked = !isEditing && !!defaultTeamId;
	// Only the locked banner needs this name, and only when creating under a team,
	// so resolve that one team by id rather than holding the whole list.
	const { data: attachedTeamData } = useGetTeamQuery(attachedTeamId, {
		skip: !isTeamLocked || !attachedTeamId,
	});
	const attachedTeam = attachedTeamData?.team;

	const handleClose = () => {
		setIsOpen(false);
		setTimeout(() => {
			onCancel();
		}, 150); // Slightly longer than the 100ms animation duration
	};

	// RTK Query hooks
	const { data: providersData, error: providersError } = useGetProvidersQuery();
	const { data: keysData, error: keysError } = useGetAllKeysQuery();
	const [createVirtualKey, { isLoading: isCreating }] = useCreateVirtualKeyMutation();
	const [updateVirtualKey, { isLoading: isUpdating }] = useUpdateVirtualKeyMutation();
	const [rotateVirtualKey, { isLoading: isRotating }] = useRotateVirtualKeyMutation();
	const [setBudgetOverride] = useSetVirtualKeyBudgetOverrideMutation();
	const [removeBudgetOverride] = useRemoveVirtualKeyBudgetOverrideMutation();
	const { data: mcpClientsResponse, error: mcpClientsError } = useGetMCPClientsQuery();
	const mcpClientsData = mcpClientsResponse?.clients || [];
	const isLoading = isCreating || isUpdating || isRotating;
	const persistedOverrideBudgets = [
		...(virtualKey?.budgets ?? []).map((budget) => ({
			budget,
			label: "虚拟密钥",
		})),
		...(virtualKey?.provider_configs ?? []).flatMap((config) =>
			(config.budgets ?? []).map((budget) => ({
				budget,
				label: ProviderLabels[config.provider as ProviderName] ?? config.provider,
			})),
		),
	];
	const saveBudgetOverride = async (budgetId: string, data: BudgetOverrideRequest) => {
		if (!virtualKey) throw new Error("Virtual key is required");
		await setBudgetOverride({ vkId: virtualKey.id, budgetId, data }).unwrap();
	};
	const clearBudgetOverride = async (budgetId: string) => {
		if (!virtualKey) throw new Error("Virtual key is required");
		await removeBudgetOverride({ vkId: virtualKey.id, budgetId }).unwrap();
	};

	const availableKeys = keysData || [];
	const availableProviders = providersData || [];

	// Form setup
	const form = useForm<z.input<typeof formSchema>, unknown, FormData>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: virtualKey?.name || "",
			description: virtualKey?.description || "",
			providerConfigs:
				virtualKey?.provider_configs?.map((config) => ({
					id: config.id,
					provider: config.provider,
					weight: config.weight ?? undefined,
					allowed_models: config.allowed_models || [],
					blacklisted_models: config.blacklisted_models || [],
					key_ids: config.allow_all_keys ? ["*"] : config.keys?.map((key) => key.key_id) || [],
					budgets: config.budgets?.map((b) => ({
						id: b.id,
						max_limit: b.max_limit,
						reset_duration: b.reset_duration,
						reset_config: b.reset_config,
					})),
					rate_limit: config.rate_limit
						? {
								token_max_limit: config.rate_limit.token_max_limit ?? undefined,
								token_reset_duration: config.rate_limit.token_reset_duration,
								request_max_limit: config.rate_limit.request_max_limit ?? undefined,
								request_reset_duration: config.rate_limit.request_reset_duration,
							}
						: undefined,
					model_budgets: config.model_budgets?.map((mb) => ({
						model_name: mb.model_name,
						budgets: mb.budgets?.map((b) => ({
							id: b.id,
							max_limit: b.max_limit,
							reset_duration: b.reset_duration,
							reset_config: b.reset_config,
						})),
						rate_limit: mb.rate_limit
							? {
									token_max_limit: mb.rate_limit.token_max_limit ?? undefined,
									token_reset_duration: mb.rate_limit.token_reset_duration,
									request_max_limit: mb.rate_limit.request_max_limit ?? undefined,
									request_reset_duration: mb.rate_limit.request_reset_duration,
								}
							: undefined,
					})),
				})) || [],
			mcpConfigs:
				virtualKey?.mcp_configs?.map((config) => ({
					id: config.id,
					mcp_client_name: config.mcp_client?.name || "",
					tools_to_execute: config.tools_to_execute || [],
				})) || [],
			entityType: virtualKey?.team_id ? "team" : virtualKey?.customer_id ? "customer" : !isEditing && defaultTeamId ? "team" : "none",
			teamId: virtualKey?.team_id || (!isEditing ? defaultTeamId || "" : ""),
			customerId: virtualKey?.customer_id || "",
			isActive: virtualKey?.is_active ?? true,
			expiresAt: virtualKey?.expires_at
				? (() => {
						const d = new Date(virtualKey.expires_at);
						return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
					})()
				: null,
			budgets:
				virtualKey?.budgets && virtualKey.budgets.length > 0
					? virtualKey.budgets.map((b) => ({
							id: b.id,
							max_limit: b.max_limit,
							reset_duration: b.reset_duration ?? "1M",
							reset_config: b.reset_config,
						}))
					: [],
			budgetCalendarAligned: virtualKey?.calendar_aligned ?? false,
			tokenMaxLimit: virtualKey?.rate_limit?.token_max_limit ?? undefined,
			tokenResetDuration: virtualKey?.rate_limit?.token_reset_duration || "1h",
			requestMaxLimit: virtualKey?.rate_limit?.request_max_limit ?? undefined,
			requestResetDuration: virtualKey?.rate_limit?.request_reset_duration || "1h",
		},
	});

	// Handle keys loading error
	useEffect(() => {
		if (keysError) {
			toast.error(`加载可用密钥失败：${getErrorMessage(keysError)}`);
		}
	}, [keysError]);

	// Handle providers loading error
	useEffect(() => {
		if (providersError) {
			toast.error(`加载可用提供商失败：${getErrorMessage(providersError)}`);
		}
	}, [providersError]);

	// Handle mcp clients loading error
	useEffect(() => {
		if (mcpClientsError) {
			toast.error(`加载可用 MCP 客户端失败：${getErrorMessage(mcpClientsError)}`);
		}
	}, [mcpClientsError]);

	// Clear team/customer IDs when entityType changes to "none"
	useEffect(() => {
		const entityType = form.watch("entityType");
		if (entityType === "none") {
			form.setValue("teamId", "", { shouldDirty: true });
			form.setValue("customerId", "", { shouldDirty: true });
		} else if (entityType === "team") {
			form.setValue("customerId", "", { shouldDirty: true });
		} else if (entityType === "customer") {
			form.setValue("teamId", "", { shouldDirty: true });
		}
	}, [form.watch("entityType"), form]);

	// Provider configuration state
	const [selectedProvider, setSelectedProvider] = useState<string>("");

	// MCP client configuration state
	const [selectedMCPClient, setSelectedMCPClient] = useState<string>("");

	// Get current provider configs from form
	const providerConfigs = form.watch("providerConfigs") || [];

	// Get current MCP configs from form
	const mcpConfigs = form.watch("mcpConfigs") || [];

	// Watch budget/rate-limit fields for conditional rendering of reset buttons
	const watchedBudgets = form.watch("budgets");
	const watchedTokenMaxLimit = form.watch("tokenMaxLimit");
	const watchedRequestMaxLimit = form.watch("requestMaxLimit");
	const watchedTokenResetDuration = form.watch("tokenResetDuration");
	const watchedRequestResetDuration = form.watch("requestResetDuration");
	const watchedBudgetCalendarAligned = form.watch("budgetCalendarAligned");

	// Calendar alignment is VK-wide and applies to both budgets and rate limits: show the
	// toggle when any configured budget or rate-limit uses a calendar-alignable duration.
	const hasAnyAlignableBudget =
		watchedBudgets &&
		watchedBudgets.length > 0 &&
		watchedBudgets.some((b) => b.max_limit !== undefined && b.max_limit !== null && supportsCalendarAlignment(b.reset_duration || "1M"));
	const hasAnyAlignableRateLimit =
		(watchedTokenMaxLimit !== undefined && watchedTokenMaxLimit !== null && supportsCalendarAlignment(watchedTokenResetDuration || "1h")) ||
		(watchedRequestMaxLimit !== undefined &&
			watchedRequestMaxLimit !== null &&
			supportsCalendarAlignment(watchedRequestResetDuration || "1h"));
	const showCalendarAlignToggle = hasAnyAlignableBudget || hasAnyAlignableRateLimit;

	// Handle adding a new provider configuration
	const handleAddProvider = (provider: string) => {
		const existingConfig = providerConfigs.find((config) => config.provider === provider);
		if (existingConfig) {
			toast.error("该提供商已配置");
			return;
		}

		const newConfig = {
			provider: provider,
			weight: undefined as number | undefined, // undefined = excluded from weighted routing until user sets a weight
			allowed_models: ["*"],
			blacklisted_models: [],
			key_ids: ["*"],
		};

		form.setValue("providerConfigs", [...providerConfigs, newConfig], {
			shouldDirty: true,
		});
	};

	// Handle removing a provider configuration
	const handleRemoveProvider = (index: number) => {
		const updatedConfigs = providerConfigs.filter((_, i) => i !== index);
		form.setValue("providerConfigs", updatedConfigs, { shouldDirty: true });
	};

	// Handle adding a new MCP client configuration
	const handleAddMCPClient = (mcpClientName: string) => {
		const existingConfig = mcpConfigs.find((config) => config.mcp_client_name === mcpClientName);
		if (existingConfig) {
			toast.error("该 MCP 客户端已配置");
			return;
		}

		const newConfig = {
			mcp_client_name: mcpClientName,
			tools_to_execute: ["*"],
		};

		form.setValue("mcpConfigs", [...mcpConfigs, newConfig], {
			shouldDirty: true,
		});
	};

	// Handle removing an MCP client configuration
	const handleRemoveMCPClient = (index: number) => {
		const updatedConfigs = mcpConfigs.filter((_, i) => i !== index);
		form.setValue("mcpConfigs", updatedConfigs, { shouldDirty: true });
	};

	// Handle updating MCP client configuration
	const handleUpdateMCPConfig = (index: number, field: keyof (typeof mcpConfigs)[0], value: any) => {
		const updatedConfigs = [...mcpConfigs];
		updatedConfigs[index] = { ...updatedConfigs[index], [field]: value };
		form.setValue("mcpConfigs", updatedConfigs, { shouldDirty: true });
	};

	const [showCalendarAlignWarning, setShowCalendarAlignWarning] = useState(false);
	const [showReassignTeamWarning, setShowReassignTeamWarning] = useState(false);
	const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);
	const [showRotateWarning, setShowRotateWarning] = useState(false);
	const [showBudgetResetPrompt, setShowBudgetResetPrompt] = useState(false);
	const [pendingBudgetResetData, setPendingBudgetResetData] = useState<FormData | null>(null);
	const [pendingBudgetUsageWarning, setPendingBudgetUsageWarning] = useState<BudgetUsageWarning | null>(null);

	const handleCalendarAlignedChange = (checked: boolean) => {
		if (checked && isEditing) {
			// Show warning when enabling on an existing VK
			setShowCalendarAlignWarning(true);
		} else {
			form.setValue("budgetCalendarAligned", checked, { shouldDirty: true });
		}
	};

	const clearVirtualKeyBudget = () => {
		form.setValue("budgets", [], { shouldDirty: true });
		form.setValue("budgetCalendarAligned", false, { shouldDirty: true });
	};

	const clearVirtualKeyRateLimits = () => {
		form.setValue("tokenMaxLimit", undefined, { shouldDirty: true });
		form.setValue("tokenResetDuration", "1h", { shouldDirty: true });
		form.setValue("requestMaxLimit", undefined, { shouldDirty: true });
		form.setValue("requestResetDuration", "1h", { shouldDirty: true });
	};

	// Build a request rate-limit payload from the form's rate-limit fields. Returns the field
	// values when a limit is set, {} to clear an existing rate limit (removal), or undefined.
	const normalizeRateLimit = (
		rl: { token_max_limit?: number; token_reset_duration?: string; request_max_limit?: number; request_reset_duration?: string } | undefined,
		hadExisting: boolean,
	) => {
		const hasToken = rl?.token_max_limit !== undefined;
		const hasRequest = rl?.request_max_limit !== undefined;
		if (hasToken || hasRequest) {
			return {
				token_max_limit: rl?.token_max_limit ?? null,
				token_reset_duration: hasToken ? rl?.token_reset_duration || "1h" : null,
				request_max_limit: rl?.request_max_limit ?? null,
				request_reset_duration: hasRequest ? rl?.request_reset_duration || "1h" : null,
			};
		}
		return hadExisting ? {} : undefined;
	};

	const normalizeProviderConfigs = (configs: typeof providerConfigs, existingConfigs?: VirtualKey["provider_configs"]): any[] => {
		return configs.map((config) => {
			const existingConfig = existingConfigs?.find((item) => (config.id ? item.id === config.id : item.provider === config.provider));
			return {
				...config,
				budgets: config.budgets?.filter((b): b is { id?: string; max_limit: number; reset_duration: string } => b.max_limit !== undefined),
				weight: config.weight ?? null,
				rate_limit: normalizeRateLimit(config.rate_limit, !!existingConfig?.rate_limit),
				// Full desired per-model set: drop unfilled models, keep an empty array so the
				// backend prunes any per-model budgets removed here.
				model_budgets: (config.model_budgets || [])
					.filter((mb) => mb.model_name && mb.model_name.trim() !== "")
					.map((mb) => {
						const existingMB = existingConfig?.model_budgets?.find((m) => m.model_name === mb.model_name.trim());
						return {
							model_name: mb.model_name.trim(),
							budgets: (mb.budgets || []).filter(
								(b): b is { id?: string; max_limit: number; reset_duration: string } => b.max_limit !== undefined,
							),
							rate_limit: normalizeRateLimit(mb.rate_limit, !!existingMB?.rate_limit),
						};
					})
					.filter((mb) => mb.budgets.length > 0 || mb.rate_limit !== undefined),
			};
		});
	};

	const parseResetDurationMs = (duration?: string) => {
		if (!duration) return null;
		const match = duration.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d|w|M|Q|Y)$/);
		if (!match) return null;
		const amount = Number(match[1]);
		const unit = match[2];
		const multipliers: Record<string, number> = {
			ms: 1,
			s: 1000,
			m: 60 * 1000,
			h: 60 * 60 * 1000,
			d: 24 * 60 * 60 * 1000,
			w: 7 * 24 * 60 * 60 * 1000,
			M: 30 * 24 * 60 * 60 * 1000,
			Q: 90 * 24 * 60 * 60 * 1000,
			Y: 365 * 24 * 60 * 60 * 1000,
		};
		return amount * multipliers[unit];
	};

	const formatBudgetAmount = (value: number) =>
		new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
			maximumFractionDigits: 2,
		}).format(value);

	const findBudgetUsageWarning = (
		currentBudgets: BudgetComparisonEntry[] | undefined,
		existingBudgets: BudgetComparisonEntry[] | undefined,
		scopeLabel: string,
	) => {
		const current = (currentBudgets || [])
			.filter(
				(
					budget,
				): budget is BudgetComparisonEntry & {
					max_limit: number;
					reset_duration: string;
				} => {
					return budget.max_limit !== undefined && !!budget.reset_duration;
				},
			)
			.sort((left, right) => (parseResetDurationMs(left.reset_duration) ?? 0) - (parseResetDurationMs(right.reset_duration) ?? 0));
		const existingByID = new Map((existingBudgets || []).filter((budget) => budget.id).map((budget) => [budget.id, budget]));
		const existingByDuration = new Map((existingBudgets || []).map((budget) => [budget.reset_duration, budget]));
		const reconciled: BudgetComparisonEntry[] = [];

		for (const budget of current) {
			const existing = budget.id ? existingByID.get(budget.id) : existingByDuration.get(budget.reset_duration);
			if (existing) {
				const configChanged = existing.max_limit !== budget.max_limit || existing.reset_duration !== budget.reset_duration;
				const usage = existing.current_usage ?? 0;
				if (configChanged && usage >= budget.max_limit) {
					return {
						kind: "over-limit" as const,
						message: `${scopeLabel} ${budget.reset_duration} 预算已产生 ${formatBudgetAmount(usage)} 用量，已达到或超过新的 ${formatBudgetAmount(budget.max_limit)} 上限。`,
					};
				}
				// Moving the fiscal quarter moves the reset boundary under a live budget.
				// Spend is deliberately carried into the new quarter rather than forgiven,
				// so surface it before saving instead of letting the number reappear
				// unexplained against a window the operator did not think they had started.
				if (budget.reset_duration.endsWith("Q") && quarterStartOf(existing) !== quarterStartOf(budget) && usage > 0) {
					return {
						kind: "quarter-shift" as const,
						message: `${scopeLabel}季度预算已产生 ${formatBudgetAmount(usage)} 用量。更改财年季度会移动重置日期，并将该用量结转到新季度。`,
					};
				}
				reconciled.push({ ...budget, current_usage: usage });
				continue;
			}

			const targetDuration = parseResetDurationMs(budget.reset_duration);
			const closestShorter = reconciled.reduce<BudgetComparisonEntry | null>((closest, candidate) => {
				const candidateDuration = parseResetDurationMs(candidate.reset_duration);
				const closestDuration = parseResetDurationMs(closest?.reset_duration);
				if (targetDuration === null || candidateDuration === null || candidateDuration >= targetDuration) {
					return closest;
				}
				if (closest === null || closestDuration === null || candidateDuration > closestDuration) {
					return candidate;
				}
				return closest;
			}, null);
			const inheritedUsage = closestShorter?.current_usage ?? 0;
			if (inheritedUsage >= budget.max_limit) {
				return {
					kind: "over-limit" as const,
					message: `${scopeLabel} ${budget.reset_duration} 预算将从 ${closestShorter?.reset_duration} 预算继承 ${formatBudgetAmount(inheritedUsage)} 用量，已达到或超过新的 ${formatBudgetAmount(budget.max_limit)} 上限。`,
				};
			}
			reconciled.push({ ...budget, current_usage: inheritedUsage });
		}

		return null;
	};

	const getBudgetUsageWarning = (data: FormData) => {
		if (!isEditing || !virtualKey || isManagedByProfile) {
			return null;
		}

		const vkWarning = findBudgetUsageWarning(data.budgets, virtualKey.budgets, "虚拟密钥");
		if (vkWarning) {
			return vkWarning;
		}

		const existingProviderConfigs = new Map<string, NonNullable<VirtualKey["provider_configs"]>[number]>();
		(virtualKey.provider_configs || []).forEach((config) => {
			existingProviderConfigs.set(String(config.id ?? config.provider), config);
		});
		for (const config of data.providerConfigs || []) {
			const existingConfig = existingProviderConfigs.get(String(config.id ?? config.provider));
			const providerLabel = ProviderLabels[config.provider as ProviderName] ?? config.provider;
			const warning = findBudgetUsageWarning(config.budgets, existingConfig?.budgets, `${providerLabel} 提供商`);
			if (warning) {
				return warning;
			}
		}

		return null;
	};

	const hasBudgetResetRelevantChanges = (data: FormData) => {
		if (!isEditing || !virtualKey || isManagedByProfile) {
			return false;
		}

		const currentBudgets = (data.budgets || []).filter(
			(budget): budget is { id?: string; max_limit: number; reset_duration: string } => budget.max_limit !== undefined,
		);
		const existingBudgets = virtualKey.budgets || [];
		const hasBudgetFields =
			currentBudgets.length > 0 ||
			existingBudgets.length > 0 ||
			(data.providerConfigs || []).some((config) => (config.budgets || []).some((budget) => budget.max_limit !== undefined)) ||
			(virtualKey.provider_configs || []).some((config) => (config.budgets || []).length > 0);

		if (budgetSignature(currentBudgets) !== budgetSignature(existingBudgets)) {
			return true;
		}

		if (hasBudgetFields && data.budgetCalendarAligned !== (virtualKey.calendar_aligned ?? false)) {
			return true;
		}

		const existingProviderConfigs = new Map<string, NonNullable<VirtualKey["provider_configs"]>[number]>();
		(virtualKey.provider_configs || []).forEach((config) => {
			existingProviderConfigs.set(String(config.id ?? config.provider), config);
		});

		const currentProviderConfigs = new Map<string, NonNullable<FormData["providerConfigs"]>[number]>();
		(data.providerConfigs || []).forEach((config) => {
			currentProviderConfigs.set(String(config.id ?? config.provider), config);
		});

		const providerConfigKeys = new Set([...existingProviderConfigs.keys(), ...currentProviderConfigs.keys()]);
		for (const key of providerConfigKeys) {
			const currentSignature = budgetSignature(currentProviderConfigs.get(key)?.budgets);
			const existingSignature = budgetSignature(existingProviderConfigs.get(key)?.budgets);
			if (currentSignature !== existingSignature) {
				return true;
			}
		}

		return false;
	};

	const handleRotateVirtualKey = async () => {
		if (!virtualKey) return;
		if (!hasUpdateAccess) {
			toast.error("你没有执行此操作的权限");
			return;
		}
		try {
			await rotateVirtualKey(virtualKey.id).unwrap();
			toast.success("虚拟密钥轮换成功");
			setShowRotateWarning(false);
			onSave();
		} catch (error) {
			toast.error(getErrorMessage(error));
		}
	};

	const submitVirtualKeyForm = async (data: FormData, resetBudgetUsage = false) => {
		if (!canSubmit) {
			toast.error("你没有执行此操作的权限");
			return;
		}
		try {
			// Managed VKs only allow name + description updates; all other fields are owned by the access profile.
			if (isManagedByProfile && virtualKey) {
				await updateVirtualKey({
					vkId: virtualKey.id,
					data: {
						name: data.name,
						description: data.description,
					},
				}).unwrap();
				toast.success("虚拟密钥已更新");
				onSave();
				return;
			}

			// Normalize provider configs to ensure weights are numbers and handle budget/rate limits
			const normalizedProviderConfigs = data.providerConfigs
				? normalizeProviderConfigs(data.providerConfigs, virtualKey?.provider_configs)
				: [];
			if (isEditing && virtualKey) {
				// Update existing virtual key
				// Only include expires_at when the user actually changed the expiry field
				// (a timestamp sets it, "" clears it). Pre-filled defaultValues are not dirty,
				// so an unchanged expired key won't resend its old expired timestamp and
				// cause the backend to reject the edit.
				const expiryChanged = !!form.formState.dirtyFields.expiresAt;
				const expiryPayload = expiryChanged
					? data.expiresAt
						? { expires_at: new Date(data.expiresAt).toISOString() }
						: virtualKey?.expires_at
							? { expires_at: "" }
							: {}
					: {};

				const updateData: UpdateVirtualKeyRequest = {
					name: data.name,
					description: data.description,
					provider_configs: normalizedProviderConfigs,
					mcp_configs: data.mcpConfigs,
					team_id:
						assignedUsers.length > 0
							? undefined
							: data.entityType === "team" && data.teamId && data.teamId.trim() !== ""
								? data.teamId
								: data.entityType === "none"
									? null
									: undefined,
					customer_id:
						assignedUsers.length > 0
							? undefined
							: data.entityType === "customer" && data.customerId && data.customerId.trim() !== ""
								? data.customerId
								: data.entityType === "none"
									? null
									: undefined,
					is_active: data.isActive,
					calendar_aligned: data.budgetCalendarAligned,
					reset_budget_usage: resetBudgetUsage,
					...expiryPayload,
				};

				// Add budgets if enabled
				const validBudgets = (data.budgets || []).filter(
					(b): b is { id?: string; max_limit: number; reset_duration: string; reset_config?: { quarter_start_month?: number } } =>
						b.max_limit !== undefined,
				);
				const hadBudget = virtualKey.budgets && virtualKey.budgets.length > 0;
				if (validBudgets.length > 0) {
					updateData.budgets = validBudgets;
				} else if (hadBudget) {
					updateData.budgets = [];
				}

				// Add rate limit if enabled
				const hadRateLimit = !!virtualKey.rate_limit;
				const hasTokenMaxLimit = data.tokenMaxLimit !== undefined;
				const hasRequestMaxLimit = data.requestMaxLimit !== undefined;
				const hasRateLimit = hasTokenMaxLimit || hasRequestMaxLimit;
				if (hasRateLimit) {
					updateData.rate_limit = {
						token_max_limit: data.tokenMaxLimit ?? null,
						token_reset_duration: hasTokenMaxLimit ? data.tokenResetDuration || "1h" : null,
						request_max_limit: data.requestMaxLimit ?? null,
						request_reset_duration: hasRequestMaxLimit ? data.requestResetDuration || "1h" : null,
					};
				} else if (hadRateLimit) {
					updateData.rate_limit = {};
				}

				await updateVirtualKey({
					vkId: virtualKey.id,
					data: updateData,
				}).unwrap();
				toast.success("虚拟密钥更新成功");
			} else {
				// Create new virtual key
				const createData: CreateVirtualKeyRequest = {
					name: data.name,
					description: data.description || undefined,
					provider_configs: normalizedProviderConfigs,
					mcp_configs: data.mcpConfigs,
					team_id: data.entityType === "team" && data.teamId && data.teamId.trim() !== "" ? data.teamId : undefined,
					customer_id: data.entityType === "customer" && data.customerId && data.customerId.trim() !== "" ? data.customerId : undefined,
					is_active: data.isActive,
					// VK-level setting that governs both budget and rate-limit calendar alignment.
					calendar_aligned: data.budgetCalendarAligned,
					// Optional expiry: send as UTC ISO string, or omit for no expiry
					...(data.expiresAt ? { expires_at: new Date(data.expiresAt).toISOString() } : {}),
				};

				// Add budgets if enabled
				const validBudgets = (data.budgets || []).filter(
					(b): b is { id?: string; max_limit: number; reset_duration: string; reset_config?: { quarter_start_month?: number } } =>
						b.max_limit !== undefined,
				);
				if (validBudgets.length > 0) {
					createData.budgets = validBudgets;
				}

				// Add rate limit if enabled
				const hasTokenMaxLimit = data.tokenMaxLimit !== undefined;
				const hasRequestMaxLimit = data.requestMaxLimit !== undefined;
				if (hasTokenMaxLimit || hasRequestMaxLimit) {
					createData.rate_limit = {
						token_max_limit: data.tokenMaxLimit,
						token_reset_duration: hasTokenMaxLimit ? data.tokenResetDuration || "1h" : undefined,
						request_max_limit: data.requestMaxLimit,
						request_reset_duration: hasRequestMaxLimit ? data.requestResetDuration || "1h" : undefined,
					};
				}

				await createVirtualKey(createData).unwrap();
				toast.success("虚拟密钥创建成功");
			}

			onSave();
		} catch (error: any) {
			if (error?.status === 409) {
				form.setError("name", { message: getErrorMessage(error) });
				return;
			}
			toast.error(getErrorMessage(error));
		}
	};

	// Handle form submission
	const onSubmit = async (data: FormData) => {
		if (hasBudgetResetRelevantChanges(data)) {
			setPendingBudgetResetData(data);
			setPendingBudgetUsageWarning(getBudgetUsageWarning(data));
			setShowBudgetResetPrompt(true);
			return;
		}

		await submitVirtualKeyForm(data, false);
	};

	const handleBudgetResetChoice = async (resetBudgetUsage: boolean) => {
		if (!pendingBudgetResetData) return;
		const data = pendingBudgetResetData;
		setPendingBudgetResetData(null);
		setPendingBudgetUsageWarning(null);
		setShowBudgetResetPrompt(false);
		await submitVirtualKeyForm(data, resetBudgetUsage);
	};

	return (
		<Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<SheetContent
				className="flex w-full flex-col gap-4 overflow-x-hidden p-0 pt-4"
				data-testid="vk-sheet-content"
				onInteractOutside={(e) => e.preventDefault()}
				onEscapeKeyDown={() => handleClose()}
			>
				<SheetHeader className="flex flex-col items-start px-0 py-4" headerClassName="mb-0 sticky -top-4 bg-card z-10 px-8">
					<SheetTitle className="flex items-center gap-2">{isEditing ? virtualKey?.name : "创建虚拟密钥"}</SheetTitle>
					<SheetDescription>
						{isEditing ? "更新虚拟密钥的配置与权限。" : "创建新的虚拟密钥，并设置其权限、预算和速率限制。"}
					</SheetDescription>
				</SheetHeader>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="flex h-full flex-col gap-6">
						<div className="grow space-y-4 px-8">
							{isManagedByProfile && (
								<>
									<Alert variant="info">
										<Lock className="h-4 w-4" />
										<AlertDescription>
											该虚拟密钥由访问配置管理。仅可修改名称和描述，提供商、预算、速率限制及 MCP 访问权限均由该配置控制。
										</AlertDescription>
									</Alert>
									<ManagedVirtualKeyActions managingProfile={managingProfile} />
								</>
							)}

							{isTeamLocked && !isManagedByProfile && (
								<Alert variant="info">
									<Users className="h-4 w-4" />
									<AlertDescription>
										将在团队 <span className="font-medium">{attachedTeam?.name ?? attachedTeamId}</span> 下创建此虚拟密钥。团队分配已预设，其余字段均可编辑。
									</AlertDescription>
								</Alert>
							)}

							{/* Assigned User */}
							{assignedUsers.length > 0 && (
								<div className="space-y-1">
									<Label className="text-sm font-medium">分配对象</Label>
									<div className="flex items-center gap-2">
										<Users className="text-muted-foreground h-4 w-4" />
										<span className="text-sm">{assignedUsers.map((u) => u.name || u.email).join(", ")}</span>
									</div>
								</div>
							)}

							{/* Basic Information */}
							<div className="space-y-4">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel>名称 *</FormLabel>
											<FormControl>
												<Input placeholder="例如：生产 API 密钥" data-testid="vk-name-input" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="description"
									render={({ field }) => (
										<FormItem>
											<FormLabel>描述</FormLabel>
											<FormControl>
												<Textarea placeholder="此密钥用于..." data-testid="vk-description-input" {...field} rows={3} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
							<fieldset
								disabled={isManagedByProfile}
								aria-disabled={isManagedByProfile}
								inert={isManagedByProfile ? true : undefined}
								className={isManagedByProfile ? "pointer-events-none space-y-4 opacity-50" : "space-y-4"}
							>
								<div className="space-y-4">
									<FormField
										control={form.control}
										name="isActive"
										render={({ field }) => (
											<FormItem>
												<Toggle label="是否启用此密钥？" val={field.value} setVal={field.onChange} data-testid="vk-is-active-toggle" />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="expiresAt"
										render={({ field }) => <ExpiryPickerField value={field.value} onChange={field.onChange} />}
									/>
								</div>
								{/* Provider Configurations */}
								<div className="space-y-2">
									<div className="flex items-center gap-2">
										<Label className="text-sm font-medium">提供商配置</Label>
										<TooltipProvider>
											<Tooltip>
												<TooltipTrigger asChild>
													<span>
														<Info className="text-muted-foreground h-3 w-3" />
													</span>
												</TooltipTrigger>
												<TooltipContent>
													<p>
														配置此虚拟密钥可使用的提供商及其具体设置。留空将阻止所有提供商，添加提供商即可允许使用。
													</p>
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									</div>

									{/* Add Provider Dropdown */}
									<div className="flex gap-2">
										<Select
											value={selectedProvider}
											onValueChange={(provider) => {
												if (provider === "__manage_providers__") {
													navigate({ to: "/workspace/providers" });
													setSelectedProvider("");
													return;
												}
												handleAddProvider(provider);
												setSelectedProvider(""); // Reset to placeholder state
											}}
										>
											<SelectTrigger className="flex-1" data-testid="vk-provider-select">
												<SelectValue placeholder="选择要添加的提供商" />
											</SelectTrigger>
											<SelectContent>
												{(() => {
													// Filter out already configured providers
													const unconfiguredProviders = availableProviders.filter(
														(provider) => !providerConfigs.some((config) => config.provider === provider.name),
													);

													if (unconfiguredProviders.length === 0) {
														return (
															<SelectItem
																value="__manage_providers__"
																className="text-muted-foreground hover:text-foreground"
																data-testid="vk-provider-config-link"
															>
																<span>
																	没有可配置的提供商了。<span className="text-primary font-medium underline">点击添加</span>
																</span>
															</SelectItem>
														);
													}

													// Separate base providers and custom providers
													const baseProviders = unconfiguredProviders.filter((provider) => !provider.custom_provider_config);
													const customProviders = unconfiguredProviders.filter((provider) => provider.custom_provider_config);

													return (
														<>
															{/* Base providers first */}
															{baseProviders
																.filter((p) => p.name)
																.map((provider, index) => (
																	<SelectItem key={`base-${index}`} value={provider.name}>
																		<RenderProviderIcon provider={provider.name as KnownProvider} size="sm" className="h-4 w-4" />
																		{ProviderLabels[provider.name as ProviderName]}
																	</SelectItem>
																))}

															{/* Custom providers second */}
															{customProviders
																.filter((p) => p.name)
																.map((provider, index) => (
																	<SelectItem key={`custom-${index}`} value={provider.name}>
																		<RenderProviderIcon
																			provider={provider.custom_provider_config?.base_provider_type || (provider.name as KnownProvider)}
																			size="sm"
																			className="h-4 w-4"
																		/>
																		{provider.name}
																	</SelectItem>
																))}
														</>
													);
												})()}
											</SelectContent>
										</Select>
									</div>

									{/* Provider Configurations Table */}
									{providerConfigs.length > 0 && (
										<div className="space-y-2.5">
											{providerConfigs.map((config, index) => {
												const providerConfig = availableProviders.find((provider) => provider.name === config.provider);
												const providerLabel = providerConfig?.custom_provider_config
													? providerConfig.name
													: ProviderLabels[config.provider as ProviderName] || config.provider;
												const iconProvider = (providerConfig?.custom_provider_config?.base_provider_type ||
													config.provider) as ProviderIconType;
												const providerKeys = availableKeys.filter((key) => key.provider === config.provider);
												return (
													<ProviderConfigCard
														key={config.provider}
														index={index}
														testIdPrefix="vk"
														providerLabel={providerLabel}
														iconProvider={iconProvider}
														providerKeys={providerKeys}
														showModelBudgets
														onRemove={() => handleRemoveProvider(index)}
														value={{
															providerName: config.provider,
															allowedModels: config.allowed_models || [],
															blacklistedModels: config.blacklisted_models || [],
															weight: config.weight,
															keyIds: config.key_ids || [],
															budgets: config.budgets || [],
															rateLimit: config.rate_limit ?? null,
															modelBudgets: (config.model_budgets || []).map((mb) => ({
																model_name: mb.model_name,
																budgets: mb.budgets || [],
																rate_limit: mb.rate_limit,
															})),
														}}
														onChange={(next) => {
															const updated = [...providerConfigs];
															updated[index] = {
																...config,
																allowed_models: next.allowedModels,
																blacklisted_models: next.blacklistedModels,
																weight: next.weight ?? undefined,
																key_ids: next.keyIds,
																budgets: next.budgets.map((l) => ({
																	id: l.id,
																	max_limit: l.max_limit,
																	reset_duration: l.reset_duration,
																	reset_config: l.reset_config,
																})),
																rate_limit: next.rateLimit ?? undefined,
																model_budgets: next.modelBudgets,
															};
															form.setValue("providerConfigs", updated, {
																shouldDirty: true,
															});
														}}
													/>
												);
											})}
										</div>
									)}
									{/* Display validation errors for provider configurations */}
									{form.formState.errors.providerConfigs && (
										<div className="text-destructive text-sm">{form.formState.errors.providerConfigs.message}</div>
									)}
								</div>
								{/* MCP Client Configurations */}
								{((mcpClientsData && mcpClientsData.length > 0) || (mcpConfigs && mcpConfigs.length > 0)) && (
									<div className="mt-6 space-y-2">
										<div className="flex items-center gap-2">
											<Label className="text-sm font-medium">MCP 客户端配置</Label>
											<TooltipProvider>
												<Tooltip>
													<TooltipTrigger asChild>
														<span>
															<Info className="text-muted-foreground h-3 w-3" />
														</span>
													</TooltipTrigger>
													<TooltipContent>
														<p>
															配置此虚拟密钥可使用的 MCP 客户端及其允许的工具。留空此部分将阻止所有 MCP 工具。添加 MCP 客户端后，必须选择具体工具或选择 <span className="font-medium">允许所有工具</span> 才能授予工具访问权限。
														</p>
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										</div>

										{/* MCP servers available on all virtual keys by default, excluding explicitly overridden ones */}
										{(() => {
											const defaultMCPClients = mcpClientsData.filter(
												(client) =>
													client.config.allow_on_all_virtual_keys &&
													!mcpConfigs.some((config) => config.mcp_client_name === client.config.name),
											);
											return defaultMCPClients.length > 0 ? (
												<div className="text-muted-foreground rounded-md border p-3 text-xs">
													<div className="flex items-start gap-1.5">
														<Info className="mt-0.5 h-3 w-3 shrink-0" />
														<span>
															以下 MCP 服务器默认对此密钥可用，且该客户端上的所有工具均已启用：
															<span className="text-foreground font-medium">{defaultMCPClients.map((c) => c.config.name).join(", ")}</span>。在下方为其中任一服务器添加显式配置，将为该密钥覆盖“所有工具”的默认设置。
														</span>
													</div>
												</div>
											) : null;
										})()}

										{/* Add MCP Client Dropdown */}
										{mcpClientsData && mcpClientsData.length > 0 && (
											<div className="flex gap-2">
												<Select
													value={selectedMCPClient}
													onValueChange={(mcpClientId) => {
														handleAddMCPClient(mcpClientId);
														setSelectedMCPClient(""); // Reset to placeholder state
													}}
												>
													<SelectTrigger className="flex-1">
														<SelectValue placeholder="选择要添加的 MCP 客户端" />
													</SelectTrigger>
													<SelectContent>
														{mcpClientsData.filter((client) => !mcpConfigs.some((config) => config.mcp_client_name === client.config.name))
															.length > 0 ? (
															mcpClientsData
																.filter(
																	(client) =>
																		client.config.name && !mcpConfigs.some((config) => config.mcp_client_name === client.config.name),
																)
																.map((client, index) => {
																	const client_tools = client.tools || [];
																	const totalTools = client.config.tools_to_execute?.includes("*")
																		? client_tools.length
																		: client_tools.filter((tool) => client.config.tools_to_execute?.includes(tool.name)).length;
																	return (
																		<SelectItem key={index} value={client.config.name}>
																			<div className="flex items-center gap-2">
																				{client.config.name}
																				<span className="text-muted-foreground text-xs">
																					（{totalTools} 个已启用工具）
																				</span>
																			</div>
																		</SelectItem>
																	);
																})
														) : (
															<div className="text-muted-foreground px-2 py-1.5 text-sm">所有 MCP 客户端均已配置</div>
														)}
													</SelectContent>
												</Select>
											</div>
										)}

										{/* MCP Configurations Table */}
										{mcpConfigs.length > 0 && (
											<div className="rounded-md border">
												<Table>
													<TableHeader>
														<TableRow>
															<TableHead>MCP 客户端</TableHead>
															<TableHead>允许的工具</TableHead>
															<TableHead className="w-[50px]"></TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{mcpConfigs.map((config, index) => {
															const mcpClient = mcpClientsData?.find((client) => client.config.name === config.mcp_client_name);

															// Handle new wildcard semantics for client-level filtering
															const clientToolsToExecute = mcpClient?.config?.tools_to_execute;
															let availableTools: any[] = [];

															if (!clientToolsToExecute || clientToolsToExecute.length === 0) {
																// nil/undefined or empty array - no tools available from client config
																availableTools = [];
															} else if (clientToolsToExecute.includes("*")) {
																// Wildcard - all tools available
																availableTools = mcpClient?.tools || [];
															} else {
																// Specific tools listed
																availableTools = (mcpClient?.tools || []).filter((tool) => clientToolsToExecute.includes(tool.name)) || [];
															}

															const enabledToolsByConfig =
																(mcpClient?.tools || []).filter((tool) => config.tools_to_execute?.includes(tool.name)) || [];
															const selectedTools = config.tools_to_execute || [];

															return (
																<TableRow key={`${config.mcp_client_name}-${index}`}>
																	<TableCell className="w-[150px]">{config.mcp_client_name}</TableCell>
																	<TableCell>
																		<MultiSelect
																			options={[
																				{
																					label: "允许所有工具",
																					value: "*",
																					description: "允许当前及后续所有工具",
																				},
																				...[...availableTools, ...enabledToolsByConfig]
																					.filter((tool, index, arr) => arr.findIndex((t) => t.name === tool.name) === index)
																					.map((tool) => ({
																						label: tool.name,
																						value: tool.name,
																						description: tool.description,
																					})),
																			]}
																			defaultValue={selectedTools}
																			onValueChange={(tools: string[]) => {
																				const hadStar = selectedTools.includes("*");
																				const hasStar = tools.includes("*");
																				if (!hadStar && hasStar) {
																					// Just selected "Allow All Tools" — set to ["*"] only
																					handleUpdateMCPConfig(index, "tools_to_execute", ["*"]);
																				} else if (hadStar && hasStar && tools.length > 1) {
																					// Had "*", still has "*", but user also selected a specific tool — drop "*"
																					handleUpdateMCPConfig(
																						index,
																						"tools_to_execute",
																						tools.filter((t) => t !== "*"),
																					);
																				} else {
																					handleUpdateMCPConfig(index, "tools_to_execute", tools);
																				}
																			}}
																			placeholder={
																				selectedTools.length === 0
																					? "未选择工具"
																					: selectedTools.includes("*")
																						? "已允许所有工具"
																						: "选择工具..."
																			}
																			variant="inverted"
																			className="hover:bg-accent w-full bg-white dark:bg-zinc-800"
																			commandClassName="w-full max-w-96"
																			modalPopover={true}
																			animation={0}
																		/>
																	</TableCell>
																	<TableCell>
																		<Button
																			type="button"
																			variant="ghost"
																			size="sm"
																			onClick={() => handleRemoveMCPClient(index)}
																			data-testid={`vk-delete-mcp-${index}`}
																		>
																			<Trash2 className="h-4 w-4" />
																		</Button>
																	</TableCell>
																</TableRow>
															);
														})}
													</TableBody>
												</Table>
											</div>
										)}
									</div>
								)}
								<DottedSeparator className="mt-6 mb-5" />
								{/* Budget Configuration */}
								<div className="space-y-4">
									<MultiBudgetLines
										data-testid="vk-budget-lines"
										label="预算配置"
										lines={form.watch("budgets") ?? []}
										onChange={(lines) => {
											form.setValue("budgets", lines, { shouldDirty: true });
										}}
										onReset={clearVirtualKeyBudget}
										showReset={isEditing && !!(virtualKey?.budgets?.length || (watchedBudgets && watchedBudgets.length > 0))}
									/>

									{isEditing && !isManagedByProfile && persistedOverrideBudgets.length > 0 ? (
										<div className="space-y-3 rounded-sm border p-4" data-testid="vk-budget-overrides-section">
											<div>
												<h4 className="text-sm font-medium">预算覆盖</h4>
												<p className="text-muted-foreground text-xs">
													在不更改上方已配置基础预算的前提下，临时追加额度。
												</p>
											</div>
											<div className="divide-y">
												{persistedOverrideBudgets.map(({ budget, label }) => (
													<div key={budget.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
														<div className="min-w-0">
															<p className="truncate text-sm font-medium">
																{label} · 每 {parseResetPeriod(budget.reset_duration)} 重置
															</p>
															<p className="text-muted-foreground text-xs">
																基础 {formatCurrency(budget.max_limit)}
																{hasActiveBudgetOverride(budget) ? ` · 生效额度 ${formatCurrency(getEffectiveBudgetLimit(budget))}` : ""}
															</p>
														</div>
														<BudgetOverrideDialog
															budget={budget}
															onSave={(data) => saveBudgetOverride(budget.id, data)}
															onRemove={() => clearBudgetOverride(budget.id)}
															disabled={!hasUpdateAccess}
															calendarAligned={virtualKey.calendar_aligned}
														/>
													</div>
												))}
											</div>
										</div>
									) : null}

									{/* Reassign team confirmation dialog */}
									<AlertDialog
										open={showReassignTeamWarning}
										onOpenChange={(open) => {
											setShowReassignTeamWarning(open);
											if (!open) {
												setPendingTeamId(null);
											}
										}}
									>
										<AlertDialogContent>
											<AlertDialogHeader>
												<AlertDialogTitle>重新分配到其他团队？</AlertDialogTitle>
												<AlertDialogDescription>
													此密钥当前分配给其他团队。重新分配会将预算统计移至该团队；此后通过此密钥发起的请求将计入该团队的预算，而非原团队。
												</AlertDialogDescription>
											</AlertDialogHeader>
											<AlertDialogFooter>
												<AlertDialogCancel data-testid="virtual-key-reassign-cancel" onClick={() => setPendingTeamId(null)}>
													取消
												</AlertDialogCancel>
												<AlertDialogAction
													data-testid="virtual-key-reassign-confirm"
													onClick={() => {
														if (pendingTeamId !== null) {
															form.setValue("teamId", pendingTeamId, {
																shouldDirty: true,
															});
															void form.trigger("entityType");
														}
														setPendingTeamId(null);
														setShowReassignTeamWarning(false);
													}}
												>
												重新分配
												</AlertDialogAction>
											</AlertDialogFooter>
										</AlertDialogContent>
									</AlertDialog>
								</div>
								{/* Rate Limiting Configuration */}
								<div className="space-y-4">
									<div className="flex items-center justify-between gap-2">
										<Label className="text-sm font-medium">速率限制配置</Label>
										{isEditing && (virtualKey?.rate_limit || watchedTokenMaxLimit || watchedRequestMaxLimit) && (
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={clearVirtualKeyRateLimits}
												data-testid="vk-rate-limit-reset-button"
											>
												<RotateCcw className="h-4 w-4" />
												重置
											</Button>
										)}
									</div>

									<FormField
										control={form.control}
										name="tokenMaxLimit"
										render={({ field }) => (
											<FormItem>
												<NumberAndSelect
													id="tokenMaxLimit"
													labelClassName="font-normal"
													label="最大 Token 数"
													value={field.value}
													selectValue={form.watch("tokenResetDuration") || "1h"}
													onChangeNumber={(value) => {
														field.onChange(value);
													}}
													onChangeSelect={(value) =>
														form.setValue("tokenResetDuration", value, {
															shouldDirty: true,
														})
													}
													options={resetDurationOptions}
												/>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="requestMaxLimit"
										render={({ field }) => (
											<FormItem>
												<NumberAndSelect
													id="requestMaxLimit"
													labelClassName="font-normal"
													label="最大请求数"
													value={field.value}
													selectValue={form.watch("requestResetDuration") || "1h"}
													onChangeNumber={(value) => {
														field.onChange(value);
													}}
													onChangeSelect={(value) =>
														form.setValue("requestResetDuration", value, {
															shouldDirty: true,
														})
													}
													options={resetDurationOptions}
												/>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
								{/* Calendar alignment — VK-wide setting that applies to both budgets and rate limits */}
								{showCalendarAlignToggle && (
									<div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
										<div className="space-y-0.5">
											<Label htmlFor="vk-budget-calendar-aligned-toggle" className="text-sm font-normal">
												按自然周期对齐
											</Label>
											<p id="vk-budget-calendar-aligned-description" className="text-muted-foreground text-xs">
												在每个周期开始时（例如每月 1 日）重置预算和速率限制，而非从创建日期滚动计算。季度预算始终按财年季度起始日对齐。仅对一天及以上的周期生效。
											</p>
										</div>
										<Switch
											id="vk-budget-calendar-aligned-toggle"
											aria-describedby="vk-budget-calendar-aligned-description"
											checked={watchedBudgetCalendarAligned}
											onCheckedChange={handleCalendarAlignedChange}
											data-testid="vk-budget-calendar-aligned-toggle"
										/>
									</div>
								)}

								{/* Warning dialog shown when enabling calendar alignment on an existing VK */}
								<AlertDialog open={showCalendarAlignWarning} onOpenChange={setShowCalendarAlignWarning}>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>重置预算和速率限制用量？</AlertDialogTitle>
											<AlertDialogDescription>
												启用自然周期对齐后，此虚拟密钥的预算用量将重置为 <span className="font-semibold">$0.00</span>，Token/请求速率限制计数将重置为 <span className="font-semibold">0</span>，并将各重置日期对齐到当前周期的起始日（如当天、本周、本月或今年的起始日）。用量重置无法撤销，但之后可以关闭自然周期对齐。此更改将在保存后生效。
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel data-testid="vk-calendar-align-cancel-btn">取消</AlertDialogCancel>
											<AlertDialogAction
												data-testid="vk-calendar-align-enable-btn"
												onClick={() => {
													form.setValue("budgetCalendarAligned", true, {
														shouldDirty: true,
													});
													setShowCalendarAlignWarning(false);
												}}
											>
												启用自然周期对齐
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
								<DottedSeparator className="my-6" />

								{/* Entity Assignment */}
								<div className="space-y-4">
									<Label className="text-sm font-medium">实体分配</Label>

									<div className="grid grid-cols-1 items-start gap-2 md:grid-cols-2">
										<FormField
											control={form.control}
											name="entityType"
											render={({ field }) => (
												<FormItem>
													<FormLabel className="font-normal">分配类型</FormLabel>
													<ComboboxSelect
														options={[
															{ value: "none", label: "不分配" },
															{ value: "team", label: "分配给团队" },
															{
																value: "customer",
																label: "分配给客户",
															},
														]}
														value={field.value}
														onValueChange={(value) => {
															const val = value ?? "none";
															field.onChange(val);
															// Switching type clears both ids and lets the user pick;
															// there is no entity list loaded to default from.
															// Defer validation until submit or until an entity is chosen —
															// eager trigger left a stuck refine error on entityType.
															form.setValue("teamId", "", { shouldDirty: true });
															form.setValue("customerId", "", { shouldDirty: true });
															form.clearErrors(["entityType", "teamId", "customerId"]);
														}}
														disabled={isTeamLocked || (isEditing && assignedUsers.length > 0)}
														disableSearch
														hideClear
														className="h-9"
													/>
													{isEditing && assignedUsers.length > 0 ? (
														<p className="text-muted-foreground text-xs">
															此密钥已分配给用户。请先解除用户关联，再更改分配类型。
														</p>
													) : (
														<FormMessage />
													)}
												</FormItem>
											)}
										/>
										{form.watch("entityType") === "team" && (
											<FormField
												control={form.control}
												name="teamId"
												render={({ field }) => (
													<FormItem>
														<FormLabel className="font-normal">选择团队</FormLabel>
														<TeamSelector
															value={field.value || ""}
															onChange={(newVal) => {
																if (isEditing && virtualKey?.team_id && newVal && newVal !== virtualKey.team_id) {
																	setPendingTeamId(newVal);
																	setShowReassignTeamWarning(true);
																} else {
																	field.onChange(newVal);
																	// Refine error lives on entityType; re-run so a valid
																	// team selection clears the assignment-type message.
																	void form.trigger("entityType");
																}
															}}
															// The already-assigned team may fall outside the
															// selector's first page, so seed its label from the
															// team embedded on the virtual key itself.
															fallbackOption={
																field.value
																	? {
																			value: field.value,
																			label: field.value === virtualKey?.team_id ? (virtualKey?.team?.name ?? field.value) : field.value,
																		}
																	: null
															}
															disabled={isTeamLocked || (isEditing && assignedUsers.length > 0)}
															triggerClassName="h-9"
														/>
														<FormMessage />
													</FormItem>
												)}
											/>
										)}

										{form.watch("entityType") === "customer" && (
											<FormField
												control={form.control}
												name="customerId"
												render={({ field }) => (
													<FormItem>
														<FormLabel className="font-normal">选择客户</FormLabel>
														<CustomerSelector
															value={field.value || ""}
															onChange={(val) => {
																field.onChange(val);
																void form.trigger("entityType");
															}}
															fallbackOption={
																field.value
																	? {
																			value: field.value,
																			label:
																				field.value === virtualKey?.customer_id ? (virtualKey?.customer?.name ?? field.value) : field.value,
																		}
																	: null
															}
															disabled={isEditing && assignedUsers.length > 0}
															triggerClassName="h-9"
														/>
														<FormMessage />
													</FormItem>
												)}
											/>
										)}
									</div>
								</div>
							</fieldset>
						</div>
						<AlertDialog open={showRotateWarning} onOpenChange={setShowRotateWarning}>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>轮换虚拟密钥？</AlertDialogTitle>
									<AlertDialogDescription>
										此操作将替换「{virtualKey?.name}」的密钥值。密钥 ID、预算、速率限制、提供商权限、MCP 访问权限及分配关系保持不变。旧密钥将立即失效。
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel data-testid="vk-rotate-cancel-btn">取消</AlertDialogCancel>
									<AlertDialogAction onClick={handleRotateVirtualKey} disabled={isRotating} data-testid="vk-rotate-confirm-btn">
										{isRotating ? "轮换中..." : "轮换密钥"}
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
						<AlertDialog open={showBudgetResetPrompt} onOpenChange={setShowBudgetResetPrompt}>
							<AlertDialogContent data-testid="vk-budget-reset-dialog">
								<AlertDialogHeader>
									<AlertDialogTitle>
										{pendingBudgetUsageWarning?.kind === "over-limit"
											? "保留超限用量？"
											: pendingBudgetUsageWarning?.kind === "quarter-shift"
												? "将用量结转到新季度？"
												: "重置预算用量？"}
									</AlertDialogTitle>
									<AlertDialogDescription>
										{pendingBudgetUsageWarning
											? `${pendingBudgetUsageWarning.message} 你仍可保留用量，或将用量重置为 0。`
											: "你更改了预算金额、重置频率或自然周期对齐设置。可将当前预算用量重置为 0，或保留现有用量计数。"}
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel onClick={() => handleBudgetResetChoice(false)} data-testid="vk-budget-reset-preserve-btn">
										{pendingBudgetUsageWarning ? "仍然保留" : "保留用量"}
									</AlertDialogCancel>
									<AlertDialogAction onClick={() => handleBudgetResetChoice(true)} data-testid="vk-budget-reset-confirm-btn">
										重置用量
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
						{isEditing && virtualKey?.config_hash && (
							<div className="px-8">
								<ConfigSyncAlert className="mt-2" />
							</div>
						)}
						{/* Form Footer */}
						<div className="border-border bg-card sticky bottom-0 z-10 border-t px-8 py-4">
							<div className="flex items-center justify-between gap-2">
								{isEditing ? (
									<Button
										type="button"
										variant="outline"
										onClick={() => setShowRotateWarning(true)}
										disabled={!hasUpdateAccess || isRotating}
										data-testid="vk-rotate-btn"
									>
										<RotateCcw className="h-4 w-4" />
										{isRotating ? "轮换中..." : "轮换密钥"}
									</Button>
								) : (
									<span />
								)}
								<div className="flex justify-end gap-2">
									<Button type="button" variant="outline" onClick={handleClose} data-testid="vk-cancel-btn">
										取消
									</Button>
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<span className="inline-block">
													<Button type="submit" disabled={isLoading || !form.formState.isDirty || !canSubmit} data-testid="vk-save-btn">
														{isLoading ? "保存中..." : isEditing ? "更新" : "创建"}
													</Button>
												</span>
											</TooltipTrigger>
											{(isLoading || !form.formState.isDirty || !canSubmit) && (
												<TooltipContent>
													<p>
														{!canSubmit
															? "你没有执行此操作的权限"
															: isLoading
																? "保存中..."
																: !form.formState.isDirty
																	? "未做任何更改"
																	: ""}
													</p>
												</TooltipContent>
											)}
										</Tooltip>
									</TooltipProvider>
								</div>
							</div>
						</div>
					</form>
				</Form>
			</SheetContent>
		</Sheet>
	);
}