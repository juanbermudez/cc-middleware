import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { MiddlewareContext } from "../server.js";

const ResourceTypeSchema = z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/);
const ResourceIdSchema = z.string().min(1);
const MetadataQuerySchema = z.object({
  q: z.string().optional(),
});
const MetadataValuesQuerySchema = z.object({
  q: z.string().optional(),
  resourceId: z.string().min(1).optional(),
});

const UpsertResourceMetadataDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1).optional(),
  searchable: z.boolean().optional(),
  filterable: z.boolean().optional(),
});

const UpsertResourceMetadataValueSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
});

function ensureStore(ctx: MiddlewareContext) {
  return ctx.sessionStore;
}

function normalizeQuery(value?: string): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

function matchesQuery(query: string | undefined, values: Array<string | undefined>): boolean {
  if (!query) {
    return true;
  }

  return values
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase().includes(query));
}

export function registerMetadataRoutes(app: FastifyInstance, ctx: MiddlewareContext): void {
  app.get<{
    Params: { resourceType: string };
    Querystring: { q?: string };
  }>("/api/v1/metadata/definitions/:resourceType", async (request, reply) => {
    const store = ensureStore(ctx);
    if (!store) {
      return reply.status(501).send({
        error: {
          code: "SESSION_STORE_UNAVAILABLE",
          message: "Resource metadata requires an indexed session store",
        },
      });
    }

    const resourceType = ResourceTypeSchema.parse(request.params.resourceType);
    const filters = MetadataQuerySchema.parse(request.query ?? {});
    const query = normalizeQuery(filters.q);
    return reply.send({
      resourceType,
      definitions: store.listResourceMetadataDefinitions(resourceType).filter((definition) => matchesQuery(query, [
        definition.key,
        definition.label,
        definition.description,
      ])),
    });
  });

  app.post<{
    Params: { resourceType: string };
    Body: unknown;
  }>("/api/v1/metadata/definitions/:resourceType", async (request, reply) => {
    const store = ensureStore(ctx);
    if (!store) {
      return reply.status(501).send({
        error: {
          code: "SESSION_STORE_UNAVAILABLE",
          message: "Resource metadata requires an indexed session store",
        },
      });
    }

    const resourceType = ResourceTypeSchema.parse(request.params.resourceType);
    const parseResult = UpsertResourceMetadataDefinitionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: parseResult.error.issues,
        },
      });
    }

    const existing = store.getResourceMetadataDefinition(resourceType, parseResult.data.key);
    const now = Date.now();
    const definition = {
      resourceType,
      key: parseResult.data.key,
      label: parseResult.data.label,
      description: parseResult.data.description,
      valueType: "string" as const,
      searchable: parseResult.data.searchable ?? existing?.searchable ?? true,
      filterable: parseResult.data.filterable ?? existing?.filterable ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    store.upsertResourceMetadataDefinition(definition);

    return reply.status(existing ? 200 : 201).send({
      resourceType,
      definition: store.getResourceMetadataDefinition(resourceType, definition.key),
    });
  });

  app.delete<{
    Params: { resourceType: string; key: string };
  }>("/api/v1/metadata/definitions/:resourceType/:key", async (request, reply) => {
    const store = ensureStore(ctx);
    if (!store) {
      return reply.status(501).send({
        error: {
          code: "SESSION_STORE_UNAVAILABLE",
          message: "Resource metadata requires an indexed session store",
        },
      });
    }

    const resourceType = ResourceTypeSchema.parse(request.params.resourceType);
    const existing = store.getResourceMetadataDefinition(resourceType, request.params.key);

    if (!existing) {
      return reply.status(404).send({
        error: {
          code: "RESOURCE_METADATA_DEFINITION_NOT_FOUND",
          message: `Metadata definition ${request.params.key} not found for ${resourceType}`,
        },
      });
    }

    store.deleteResourceMetadataDefinition(resourceType, request.params.key);

    return reply.send({
      resourceType,
      definitions: store.listResourceMetadataDefinitions(resourceType),
    });
  });

  app.get<{
    Params: { resourceType: string };
    Querystring: { q?: string; resourceId?: string };
  }>("/api/v1/metadata/values/:resourceType", async (request, reply) => {
    const store = ensureStore(ctx);
    if (!store) {
      return reply.status(501).send({
        error: {
          code: "SESSION_STORE_UNAVAILABLE",
          message: "Resource metadata requires an indexed session store",
        },
      });
    }

    const resourceType = ResourceTypeSchema.parse(request.params.resourceType);
    const filters = MetadataValuesQuerySchema.parse(request.query ?? {});
    const query = normalizeQuery(filters.q);
    const resourceId = filters.resourceId
      ? ResourceIdSchema.parse(filters.resourceId)
      : undefined;

    return reply.send({
      resourceType,
      ...(resourceId ? { resourceId } : {}),
      metadata: store.listResourceMetadataValues(resourceType, resourceId).filter((entry) => matchesQuery(query, [
        entry.key,
        entry.label,
        entry.description,
        entry.value,
        entry.resourceId,
      ])),
    });
  });

  app.get<{
    Params: { resourceType: string; resourceId: string };
    Querystring: { q?: string };
  }>("/api/v1/metadata/values/:resourceType/:resourceId", async (request, reply) => {
    const store = ensureStore(ctx);
    if (!store) {
      return reply.status(501).send({
        error: {
          code: "SESSION_STORE_UNAVAILABLE",
          message: "Resource metadata requires an indexed session store",
        },
      });
    }

    const resourceType = ResourceTypeSchema.parse(request.params.resourceType);
    const resourceId = ResourceIdSchema.parse(request.params.resourceId);
    const filters = MetadataQuerySchema.parse(request.query ?? {});
    const query = normalizeQuery(filters.q);

    return reply.send({
      resourceType,
      resourceId,
      metadata: store.listResourceMetadataValues(resourceType, resourceId).filter((entry) => matchesQuery(query, [
        entry.key,
        entry.label,
        entry.description,
        entry.value,
      ])),
    });
  });

  app.put<{
    Params: { resourceType: string; resourceId: string };
    Body: unknown;
  }>("/api/v1/metadata/values/:resourceType/:resourceId", async (request, reply) => {
    const store = ensureStore(ctx);
    if (!store) {
      return reply.status(501).send({
        error: {
          code: "SESSION_STORE_UNAVAILABLE",
          message: "Resource metadata requires an indexed session store",
        },
      });
    }

    const resourceType = ResourceTypeSchema.parse(request.params.resourceType);
    const resourceId = ResourceIdSchema.parse(request.params.resourceId);
    const parseResult = UpsertResourceMetadataValueSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: parseResult.error.issues,
        },
      });
    }

    const definition = store.getResourceMetadataDefinition(resourceType, parseResult.data.key);
    if (!definition) {
      return reply.status(404).send({
        error: {
          code: "RESOURCE_METADATA_DEFINITION_NOT_FOUND",
          message: `Metadata definition ${parseResult.data.key} not found for ${resourceType}`,
        },
      });
    }

    const existing = store
      .listResourceMetadataValues(resourceType, resourceId)
      .find((entry) => entry.key === parseResult.data.key);
    const now = Date.now();

    store.setResourceMetadataValue({
      resourceType,
      resourceId,
      key: parseResult.data.key,
      value: parseResult.data.value,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    return reply.send({
      resourceType,
      resourceId,
      metadata: store.listResourceMetadataValues(resourceType, resourceId),
    });
  });

  app.delete<{
    Params: { resourceType: string; resourceId: string; key: string };
  }>("/api/v1/metadata/values/:resourceType/:resourceId/:key", async (request, reply) => {
    const store = ensureStore(ctx);
    if (!store) {
      return reply.status(501).send({
        error: {
          code: "SESSION_STORE_UNAVAILABLE",
          message: "Resource metadata requires an indexed session store",
        },
      });
    }

    const resourceType = ResourceTypeSchema.parse(request.params.resourceType);
    const resourceId = ResourceIdSchema.parse(request.params.resourceId);
    store.deleteResourceMetadataValue(resourceType, resourceId, request.params.key);

    return reply.send({
      resourceType,
      resourceId,
      metadata: store.listResourceMetadataValues(resourceType, resourceId),
    });
  });
}
