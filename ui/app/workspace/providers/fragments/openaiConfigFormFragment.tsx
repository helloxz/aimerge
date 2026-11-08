import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { getErrorMessage, setProviderFormDirtyState, useAppDispatch } from "@/lib/store";
import { useUpdateProviderMutation } from "@/lib/store/apis/providersApi";
import type { ModelProvider } from "@/lib/types/config";
import { openaiConfigFormSchema, type OpenAIConfigFormSchema } from "@/lib/types/schemas";
import { RbacOperation, RbacResource, useRbac } from "@enterprise/lib";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { buildProviderUpdatePayload } from "../views/utils";

interface OpenAIConfigFormFragmentProps {
	provider: ModelProvider;
}

export function OpenAIConfigFormFragment({ provider }: OpenAIConfigFormFragmentProps) {
	const dispatch = useAppDispatch();
	const hasUpdateProviderAccess = useRbac(RbacResource.ModelProvider, RbacOperation.Update);
	const [updateProvider, { isLoading: isUpdatingProvider }] = useUpdateProviderMutation();
	const form = useForm<OpenAIConfigFormSchema, any, OpenAIConfigFormSchema>({
		resolver: zodResolver(openaiConfigFormSchema) as Resolver<OpenAIConfigFormSchema, any, OpenAIConfigFormSchema>,
		mode: "onChange",
		reValidateMode: "onChange",
		defaultValues: {
			disable_store: provider.openai_config?.disable_store ?? false,
		},
	});

	useEffect(() => {
		dispatch(setProviderFormDirtyState(form.formState.isDirty));
	}, [form.formState.isDirty, dispatch]);

	useEffect(() => {
		form.reset({
			disable_store: provider.openai_config?.disable_store ?? false,
		});
	}, [form, provider.name, provider.openai_config?.disable_store]);

	const onSubmit = (data: OpenAIConfigFormSchema) => {
		updateProvider(
			buildProviderUpdatePayload(provider, {
				openai_config: {
					disable_store: data.disable_store,
				},
			}),
		)
			.unwrap()
			.then(() => {
				toast.success("OpenAI 配置已更新");
				form.reset(data);
			})
			.catch((err) => {
				toast.error("更新 OpenAI 配置失败", {
					description: getErrorMessage(err),
				});
			});
	};

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 px-6" data-testid="provider-config-openai-content">
				<div className="space-y-4">
					<FormField
						control={form.control}
						name="disable_store"
						render={({ field }) => (
							<FormItem>
								<div className="flex items-center justify-between space-x-2">
									<div className="space-y-0.5">
										<FormLabel>禁用存储</FormLabel>
										<p className="text-muted-foreground text-xs">
											在 Responses API 中，store 默认为 true；开启后，生成的响应会被存储，以便之后通过 API 检索。OpenAI 提供了检索和删除
											已存储响应的端点，因此你的响应 ID 会成为服务端持久对象，而不再是一次性 ID。
										</p>
									</div>
									<FormControl>
										<Switch
											data-testid="provider-openai-disable-store-switch"
											size="md"
											checked={field.value}
											disabled={!hasUpdateProviderAccess}
											onCheckedChange={(checked) => {
												field.onChange(checked);
												form.trigger("disable_store");
											}}
										/>
									</FormControl>
								</div>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>

				<div className="flex justify-end space-x-2 pb-6">
					<Button
						type="submit"
						disabled={!form.formState.isDirty || !form.formState.isValid || !hasUpdateProviderAccess || isUpdatingProvider}
						isLoading={isUpdatingProvider}
					>
						保存 OpenAI 配置
					</Button>
				</div>
			</form>
		</Form>
	);
}