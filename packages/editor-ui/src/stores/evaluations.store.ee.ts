import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useRootStore } from './root.store';
import * as testDefinitionsApi from '@/api/evaluations.ee';
import type { ITestDefinition } from '@/api/evaluations.ee';
import { usePostHog } from './posthog.store';
import { STORES, WORKFLOW_EVALUATION_EXPERIMENT } from '@/constants';

export const useEvaluationsStore = defineStore(
	STORES.EVALUATIONS,
	() => {
		// State
		const testDefinitionsById = ref<Record<number, Partial<ITestDefinition>>>({});
		const loading = ref(false);
		const fetchedAll = ref(false);

		// Store instances
		const posthogStore = usePostHog();
		const rootStore = useRootStore();

		// Computed
		const allTestDefinitions = computed(() => {
			return Object.values(testDefinitionsById.value).sort((a, b) =>
				(a.name ?? '').localeCompare(b.name ?? ''),
			);
		});

		// Enable with `window.featureFlags.override('025_workflow_evaluation', true)`
		const isFeatureEnabled = computed(() =>
			posthogStore.isFeatureEnabled(WORKFLOW_EVALUATION_EXPERIMENT),
		);

		const isLoading = computed(() => loading.value);

		const hasTestDefinitions = computed(() => Object.keys(testDefinitionsById.value).length > 0);

		// Methods
		const setAllTestDefinitions = (definitions: ITestDefinition[]) => {
			testDefinitionsById.value = definitions.reduce(
				(acc: Record<number, ITestDefinition>, def: ITestDefinition) => {
					acc[def.id] = def;
					return acc;
				},
				{},
			);
			fetchedAll.value = true;
		};

		/**
		 * Upserts test definitions in the store.
		 * @param toUpsertDefinitions - An array of test definitions to upsert.
		 */
		const upsertTestDefinitions = (toUpsertDefinitions: Array<Partial<ITestDefinition>>) => {
			toUpsertDefinitions.forEach((toUpsertDef) => {
				const defId = toUpsertDef.id;
				if (!defId) throw Error('ID is required for upserting');
				const currentDef = testDefinitionsById.value[defId];
				if (currentDef) {
					testDefinitionsById.value = {
						...testDefinitionsById.value,
						[defId]: {
							...currentDef,
							...toUpsertDef,
						},
					};
				} else {
					testDefinitionsById.value = {
						...testDefinitionsById.value,
						[defId]: toUpsertDef,
					};
				}
			});
		};

		const deleteTestDefinition = (id: number) => {
			const { [id]: deleted, ...rest } = testDefinitionsById.value;
			testDefinitionsById.value = rest;
		};

		/**
		 * Fetches all test definitions from the API.
		 * @param {boolean} force - If true, fetches the definitions from the API even if they were already fetched before.
		 * @param {boolean} includeScopes - If true, includes the scopes in the fetched definitions.
		 */
		const fetchAll = async (params?: { force?: boolean; includeScopes?: boolean }) => {
			const { force = false, includeScopes = false } = params ?? {};
			if (!force && fetchedAll.value) {
				const testDefinitions = Object.values(testDefinitionsById.value);
				return {
					count: testDefinitions.length,
					testDefinitions,
				};
			}

			loading.value = true;
			try {
				const retrievedDefinitions = await testDefinitionsApi.getTestDefinitions(
					rootStore.restApiContext,
					{ includeScopes },
				);

				setAllTestDefinitions(retrievedDefinitions.testDefinitions);
				return retrievedDefinitions;
			} finally {
				loading.value = false;
			}
		};

		/**
		 * Creates a new test definition using the provided parameters.
		 *
		 * @param {Object} params - An object containing the necessary parameters to create a test definition.
		 * @param {string} params.name - The name of the new test definition.
		 * @param {string} params.workflowId - The ID of the workflow associated with the test definition.
		 * @param {string} [params.evaluationWorkflowId] - The optional ID of the evaluation workflow associated with the test definition.
		 * @param {string} [params.description] - An optional description for the new test definition.
		 * @returns {Promise<ITestDefinition>} A promise that resolves to the newly created test definition.
		 * @throws {Error} Throws an error if there is a problem creating the test definition.
		 */
		const create = async (params: {
			name: string;
			workflowId: string;
			evaluationWorkflowId?: string;
			description?: string;
		}) => {
			const createdDefinition = await testDefinitionsApi.createTestDefinition(
				rootStore.restApiContext,
				params,
			);
			upsertTestDefinitions([createdDefinition]);
			return createdDefinition;
		};

		const update = async (params: Partial<Omit<ITestDefinition, 'id'>> & { id: number }) => {
			if (!params.id) throw new Error('ID is required to update a test definition');

			const { id, ...updateParams } = params;
			const updatedDefinition = await testDefinitionsApi.updateTestDefinition(
				rootStore.restApiContext,
				id,
				updateParams,
			);
			upsertTestDefinitions([updatedDefinition]);
			return updatedDefinition;
		};

		/**
		 * Deletes a test definition by its ID.
		 *
		 * @param {number} id - The ID of the test definition to delete.
		 * @returns {Promise<boolean>} A promise that resolves to true if the test definition was successfully deleted, false otherwise.
		 */
		const deleteById = async (id: number) => {
			const result = await testDefinitionsApi.deleteTestDefinition(rootStore.restApiContext, id);

			if (result.success) {
				deleteTestDefinition(id);
			}

			return result.success;
		};

		return {
			// State
			fetchedAll,
			testDefinitionsById,

			// Computed
			allTestDefinitions,
			isLoading,
			hasTestDefinitions,
			isFeatureEnabled,

			// Methods
			fetchAll,
			create,
			update,
			deleteById,
			upsertTestDefinitions,
			deleteTestDefinition,
		};
	},
	{},
);
