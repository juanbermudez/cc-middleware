import { useCallback, useEffect, useState } from "react";
import type {
  CheckResult,
  ResourceMetadataDefinition,
  ResourceMetadataDefinitionsResponse,
  ResourceMetadataValuesResponse,
} from "./playground";

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`.trim());
  }
  return response.json() as Promise<T>;
}

async function writeJson<T>(url: string, method: "POST" | "PUT" | "DELETE", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text}`.trim());
  }

  return response.json() as Promise<T>;
}

export function useResourceMetadata(resourceType: string, resourceId?: string) {
  return useResourceMetadataQuery(resourceType, { valueResourceId: resourceId });
}

export function useResourceMetadataQuery(
  resourceType: string,
  resourceIdOrOptions?: string | {
    definitionsQuery?: string;
    valuesQuery?: string;
    valueResourceId?: string;
  },
  maybeOptions?: {
    definitionsQuery?: string;
    valuesQuery?: string;
    valueResourceId?: string;
  }
) {
  const resourceId = typeof resourceIdOrOptions === "string"
    ? resourceIdOrOptions
    : resourceIdOrOptions?.valueResourceId;
  const options = typeof resourceIdOrOptions === "string"
    ? maybeOptions
    : resourceIdOrOptions;
  const [definitions, setDefinitions] = useState<ResourceMetadataDefinition[]>([]);
  const [metadata, setMetadata] = useState<ResourceMetadataValuesResponse | null>(null);
  const [definitionsLoading, setDefinitionsLoading] = useState(true);
  const [valuesLoading, setValuesLoading] = useState(true);
  const [definitionsError, setDefinitionsError] = useState<string | null>(null);
  const [valuesError, setValuesError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<CheckResult>({
    status: "idle",
    detail: "Metadata changes will appear here.",
  });

  const loadDefinitions = useCallback(async () => {
    setDefinitionsLoading(true);
    setDefinitionsError(null);

    try {
      const params = new URLSearchParams();
      if (options?.definitionsQuery?.trim()) {
        params.set("q", options.definitionsQuery.trim());
      }
      const url = params.size > 0
        ? `/api/v1/metadata/definitions/${encodeURIComponent(resourceType)}?${params.toString()}`
        : `/api/v1/metadata/definitions/${encodeURIComponent(resourceType)}`;
      const result = await readJson<ResourceMetadataDefinitionsResponse>(
        url
      );
      setDefinitions(
        [...result.definitions].sort((left, right) => right.updatedAt - left.updatedAt)
      );
    } catch (error) {
      setDefinitionsError(error instanceof Error ? error.message : String(error));
    } finally {
      setDefinitionsLoading(false);
    }
  }, [options?.definitionsQuery, resourceType]);

  const loadValues = useCallback(async () => {
    setValuesLoading(true);
    setValuesError(null);

    try {
      const params = new URLSearchParams();
      if (resourceId) {
        params.set("resourceId", resourceId);
      }
      if (options?.valuesQuery?.trim()) {
        params.set("q", options.valuesQuery.trim());
      }
      const url = params.size > 0
        ? `/api/v1/metadata/values/${encodeURIComponent(resourceType)}?${params.toString()}`
        : `/api/v1/metadata/values/${encodeURIComponent(resourceType)}`;
      const result = await readJson<ResourceMetadataValuesResponse>(
        url
      );
      setMetadata({
        ...result,
        metadata: [...result.metadata].sort((left, right) => right.updatedAt - left.updatedAt),
      });
    } catch (error) {
      setValuesError(error instanceof Error ? error.message : String(error));
    } finally {
      setValuesLoading(false);
    }
  }, [options?.valuesQuery, resourceId, resourceType]);

  useEffect(() => {
    void loadDefinitions();
  }, [loadDefinitions]);

  useEffect(() => {
    void loadValues();
  }, [loadValues]);

  const saveDefinition = useCallback(async (definition: {
    key: string;
    label: string;
    description?: string;
    searchable: boolean;
    filterable: boolean;
  }) => {
    setActionState({ status: "loading", detail: "Saving metadata field…" });

    try {
      await writeJson<ResourceMetadataDefinitionsResponse>(
        `/api/v1/metadata/definitions/${encodeURIComponent(resourceType)}`,
        "POST",
        definition
      );
      await loadDefinitions();
      setActionState({ status: "pass", detail: `Saved ${definition.label}.` });
    } catch (error) {
      setActionState({
        status: "error",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }, [loadDefinitions, resourceType]);

  const deleteDefinition = useCallback(async (key: string) => {
    setActionState({ status: "loading", detail: `Removing ${key}…` });

    try {
      await writeJson<ResourceMetadataDefinitionsResponse>(
        `/api/v1/metadata/definitions/${encodeURIComponent(resourceType)}/${encodeURIComponent(key)}`,
        "DELETE"
      );
      await Promise.all([loadDefinitions(), loadValues()]);
      setActionState({ status: "pass", detail: `Removed ${key}.` });
    } catch (error) {
      setActionState({
        status: "error",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }, [loadDefinitions, loadValues, resourceType]);

  const saveValueForResource = useCallback(async (
    targetResourceId: string,
    payload: { key: string; value: string }
  ) => {
    if (!targetResourceId) {
      return;
    }

    setActionState({ status: "loading", detail: `Applying ${payload.key}…` });

    try {
      await writeJson<ResourceMetadataValuesResponse>(
        `/api/v1/metadata/values/${encodeURIComponent(resourceType)}/${encodeURIComponent(targetResourceId)}`,
        "PUT",
        payload
      );
      await loadValues();
      setActionState({ status: "pass", detail: `Applied ${payload.key}.` });
      await loadDefinitions();
    } catch (error) {
      setActionState({
        status: "error",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }, [loadDefinitions, loadValues, resourceId, resourceType]);

  const saveValue = useCallback(async (payload: { key: string; value: string }) => {
    if (!resourceId) {
      return;
    }

    await saveValueForResource(resourceId, payload);
  }, [resourceId, saveValueForResource]);

  const deleteValueForResource = useCallback(async (
    targetResourceId: string,
    key: string
  ) => {
    if (!targetResourceId) {
      return;
    }

    setActionState({ status: "loading", detail: `Removing ${key}…` });

    try {
      await writeJson<ResourceMetadataValuesResponse>(
        `/api/v1/metadata/values/${encodeURIComponent(resourceType)}/${encodeURIComponent(targetResourceId)}/${encodeURIComponent(key)}`,
        "DELETE"
      );
      await loadValues();
      setActionState({ status: "pass", detail: `Removed ${key}.` });
      await loadDefinitions();
    } catch (error) {
      setActionState({
        status: "error",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }, [loadDefinitions, loadValues, resourceId, resourceType]);

  const deleteValue = useCallback(async (key: string) => {
    if (!resourceId) {
      return;
    }

    await deleteValueForResource(resourceId, key);
  }, [deleteValueForResource, resourceId]);

  return {
    definitions,
    metadata,
    definitionsLoading,
    valuesLoading,
    definitionsError,
    valuesError,
    actionState,
    saveDefinition,
    deleteDefinition,
    saveValue,
    saveValueForResource,
    deleteValue,
    deleteValueForResource,
    reloadDefinitions: loadDefinitions,
    reloadValues: loadValues,
  };
}
