import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useResourceMetadataQuery } from "../lib/use-resource-metadata";
import { cn, formatNumber, formatTimestamp } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import { Textarea } from "./ui/textarea";
import {
  CompactDataTable,
  InlineState,
  ModalSurface,
  TableMetaBadges,
} from "./playground-ui";

export interface MetadataInventoryOption {
  label: string;
  resourceType: string;
  items: Array<{
    id: string;
    label: string;
    detail?: string;
  }>;
}

interface MetadataFieldDraft {
  key: string;
  label: string;
  description: string;
  searchable: boolean;
  filterable: boolean;
}

interface MetadataValueDraft {
  resourceId: string;
  resourceLabel: string;
  key: string;
  label: string;
  description?: string;
  value: string;
  resourceLocked: boolean;
}

type ConfirmationState =
  | {
      kind: "definition";
      key: string;
      label: string;
    }
  | {
      kind: "value";
      resourceId: string;
      key: string;
      label: string;
    };

const ALL_RESOURCES_FILTER = "__all__";

export function ResourceMetadataWorkspace(props: {
  title: string;
  description: string;
  inventories: MetadataInventoryOption[];
}) {
  const [inventoryIndex, setInventoryIndex] = useState(0);
  const [definitionsQuery, setDefinitionsQuery] = useState("");
  const [valuesQuery, setValuesQuery] = useState("");
  const [valueResourceFilter, setValueResourceFilter] = useState(ALL_RESOURCES_FILTER);
  const [fieldEditorOpen, setFieldEditorOpen] = useState(false);
  const [fieldEditorMode, setFieldEditorMode] = useState<"create" | "edit">("create");
  const [fieldDraft, setFieldDraft] = useState<MetadataFieldDraft>({
    key: "owner",
    label: "Owner",
    description: "Internal owner label for this resource.",
    searchable: true,
    filterable: true,
  });
  const [valueEditorOpen, setValueEditorOpen] = useState(false);
  const [valueEditorMode, setValueEditorMode] = useState<"create" | "edit">("create");
  const [valueDraft, setValueDraft] = useState<MetadataValueDraft | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [confirmationInput, setConfirmationInput] = useState("");

  useEffect(() => {
    const normalizedIndex = Math.min(inventoryIndex, Math.max(props.inventories.length - 1, 0));
    if (normalizedIndex !== inventoryIndex) {
      setInventoryIndex(normalizedIndex);
    }
  }, [inventoryIndex, props.inventories.length]);

  const activeInventory = props.inventories[inventoryIndex] ?? props.inventories[0];
  const inventoryItems = activeInventory?.items ?? [];
  const filteredResourceId = valueResourceFilter !== ALL_RESOURCES_FILTER
    ? valueResourceFilter
    : undefined;

  useEffect(() => {
    if (!filteredResourceId) {
      return;
    }

    if (inventoryItems.some((item) => item.id === filteredResourceId)) {
      return;
    }

    setValueResourceFilter(ALL_RESOURCES_FILTER);
  }, [filteredResourceId, inventoryItems]);

  const metadata = useResourceMetadataQuery(activeInventory?.resourceType ?? "resource", {
    definitionsQuery,
    valuesQuery,
    valueResourceId: filteredResourceId,
  });

  const metadataEntries = metadata.metadata?.metadata ?? [];
  const actionStateVariant =
    metadata.actionState.status === "error"
      ? "error"
      : metadata.actionState.status === "loading"
        ? "warning"
        : "neutral";

  function findResource(resourceId: string) {
    return inventoryItems.find((item) => item.id === resourceId);
  }

  function openCreateField(): void {
    setFieldEditorMode("create");
    setFieldDraft({
      key: "owner",
      label: "Owner",
      description: "Internal owner label for this resource.",
      searchable: true,
      filterable: true,
    });
    setFieldEditorOpen(true);
  }

  function openEditField(definition: {
    key: string;
    label: string;
    description?: string;
    searchable: boolean;
    filterable: boolean;
  }): void {
    setFieldEditorMode("edit");
    setFieldDraft({
      key: definition.key,
      label: definition.label,
      description: definition.description ?? "",
      searchable: definition.searchable,
      filterable: definition.filterable,
    });
    setFieldEditorOpen(true);
  }

  function openValueEditorForDefinition(definition: {
    key: string;
    label: string;
    description?: string;
  }): void {
    const defaultResourceId = filteredResourceId ?? inventoryItems[0]?.id ?? "";
    if (!defaultResourceId) {
      return;
    }

    const resource = findResource(defaultResourceId);
    const existing = metadataEntries.find((entry) => (
      entry.key === definition.key && entry.resourceId === defaultResourceId
    ));

    setValueEditorMode(existing ? "edit" : "create");
    setValueDraft({
      resourceId: defaultResourceId,
      resourceLabel: resource?.label ?? defaultResourceId,
      key: definition.key,
      label: definition.label,
      description: definition.description,
      value: existing?.value ?? "",
      resourceLocked: false,
    });
    setValueEditorOpen(true);
  }

  function openValueEditorForEntry(entry: {
    resourceId: string;
    key: string;
    label: string;
    description?: string;
    value: string;
  }): void {
    const targetResource = findResource(entry.resourceId);
    setValueEditorMode("edit");
    setValueDraft({
      resourceId: entry.resourceId,
      resourceLabel: targetResource?.label ?? entry.resourceId,
      key: entry.key,
      label: entry.label,
      description: entry.description,
      value: entry.value,
      resourceLocked: true,
    });
    setValueEditorOpen(true);
  }

  function openDeleteDefinition(definition: { key: string; label: string }): void {
    setConfirmation({
      kind: "definition",
      key: definition.key,
      label: definition.label,
    });
    setConfirmationInput("");
  }

  function openDeleteValue(entry: {
    resourceId: string;
    key: string;
    label: string;
  }): void {
    setConfirmation({
      kind: "value",
      resourceId: entry.resourceId,
      key: entry.key,
      label: entry.label,
    });
    setConfirmationInput("");
  }

  function updateValueDraftResource(nextResourceId: string): void {
    setValueDraft((current) => {
      if (!current) {
        return current;
      }

      const targetResource = findResource(nextResourceId);
      const existing = metadataEntries.find((entry) => (
        entry.resourceId === nextResourceId && entry.key === current.key
      ));

      return {
        ...current,
        resourceId: nextResourceId,
        resourceLabel: targetResource?.label ?? nextResourceId,
        value: existing?.value ?? "",
      };
    });
  }

  async function confirmDestructiveAction(): Promise<void> {
    if (!confirmation || confirmationInput.trim() !== confirmation.key) {
      return;
    }

    if (confirmation.kind === "definition") {
      await metadata.deleteDefinition(confirmation.key);
    } else {
      await metadata.deleteValueForResource(confirmation.resourceId, confirmation.key);
    }

    setConfirmation(null);
    setConfirmationInput("");
  }

  async function saveFieldDraft(): Promise<void> {
    await metadata.saveDefinition({
      key: fieldDraft.key,
      label: fieldDraft.label,
      description: fieldDraft.description,
      searchable: fieldDraft.searchable,
      filterable: fieldDraft.filterable,
    });
    setFieldEditorOpen(false);
  }

  async function saveValueDraft(): Promise<void> {
    if (!valueDraft?.resourceId) {
      return;
    }

    await metadata.saveValueForResource(valueDraft.resourceId, {
      key: valueDraft.key,
      value: valueDraft.value,
    });
    setValueEditorOpen(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-medium text-slate-900">{props.title}</div>
        <p className="mt-1 text-sm leading-6 text-slate-500">{props.description}</p>
      </div>

      {metadata.actionState.status !== "idle" ? (
        <InlineState
          variant={actionStateVariant}
          title={activeInventory?.label ?? props.title}
          detail={metadata.actionState.detail}
        />
      ) : null}

      <CompactDataTable
        title="Metadata fields"
        description={`Registered fields for ${activeInventory?.label ?? "this inventory"}. Newest updates are shown first.`}
        search={{
          value: definitionsQuery,
          onChange: setDefinitionsQuery,
          placeholder: "Search metadata fields",
        }}
        meta={(
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {props.inventories.length > 1 ? (
              <Select
                value={String(inventoryIndex)}
                onChange={(event) => setInventoryIndex(Number(event.target.value))}
                className="h-9 min-w-[180px]"
              >
                {props.inventories.map((inventory, index) => (
                  <option key={inventory.resourceType} value={index}>
                    {inventory.label}
                  </option>
                ))}
              </Select>
            ) : null}
            <Select
              value={valueResourceFilter}
              onChange={(event) => setValueResourceFilter(event.target.value)}
              className="h-9 min-w-[220px]"
              disabled={inventoryItems.length === 0}
            >
              <option value={ALL_RESOURCES_FILTER}>All resources</option>
              {inventoryItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
            <Button type="button" variant="secondary" size="sm" onClick={openCreateField}>
              Add field
            </Button>
            <TableMetaBadges
              total={metadata.definitions.length}
              noun="fields"
              loading={metadata.definitionsLoading}
              query={definitionsQuery}
            />
          </div>
        )}
        loading={metadata.definitionsLoading}
        error={metadata.definitionsError}
        columns={["Field", "Key", "Usage", "State", "Actions"]}
        rows={metadata.definitions.map((definition) => {
          const filteredFieldValue = filteredResourceId
            ? metadataEntries.find((entry) => (
                entry.key === definition.key && entry.resourceId === filteredResourceId
              ))
            : undefined;

          return {
            id: definition.key,
            cells: [
              <span className="font-medium text-slate-900">{definition.label}</span>,
              <span className="font-mono text-xs text-slate-500">{definition.key}</span>,
              <Badge variant="outline">{formatNumber(definition.usageCount)} items</Badge>,
              <div className="flex flex-wrap gap-2">
                {definition.searchable ? <Badge variant="info">Searchable</Badge> : null}
                {definition.filterable ? <Badge variant="outline">Filterable</Badge> : null}
              </div>,
              <RowActionMenu
                label={`${definition.label} actions`}
                items={[
                  {
                    label: "Edit field",
                    onSelect: () => openEditField(definition),
                  },
                  {
                    label: filteredFieldValue ? "Edit value" : "Add value",
                    onSelect: () => openValueEditorForDefinition(definition),
                    disabled: inventoryItems.length === 0,
                  },
                  {
                    label: "Remove field",
                    destructive: true,
                    onSelect: () => openDeleteDefinition(definition),
                  },
                ]}
              />,
            ],
            previewEyebrow: "Metadata Field",
            previewTitle: definition.label,
            previewDescription: definition.description || "No description",
            previewMeta: [
              { label: "Key", value: definition.key },
              { label: "Usage", value: `${formatNumber(definition.usageCount)} items` },
            ],
            drawerMeta: [
              { label: "Resource type", value: definition.resourceType },
              { label: "Key", value: definition.key },
              { label: "Usage", value: `${formatNumber(definition.usageCount)} items` },
              { label: "Searchable", value: definition.searchable ? "Yes" : "No" },
              { label: "Filterable", value: definition.filterable ? "Yes" : "No" },
              { label: "Updated", value: formatTimestamp(definition.updatedAt) },
            ],
            drawerContent: (
              <div className="space-y-2">
                <div className="text-sm text-slate-600">
                  {filteredResourceId && filteredFieldValue
                    ? "A value is already attached for the currently filtered resource."
                    : "Use Add value to attach this field to a resource in this inventory."}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => openValueEditorForDefinition(definition)}
                  disabled={inventoryItems.length === 0}
                >
                  {filteredFieldValue ? "Edit value" : "Add value"}
                </Button>
              </div>
            ),
          };
        })}
        emptyTitle="No metadata fields yet"
        emptyDetail="Create a field to start attaching structured metadata to this resource inventory."
      />

      <CompactDataTable
        title="Metadata values"
        description={`Recent metadata values for ${activeInventory?.label ?? "this inventory"}. Filter by resource when you want a narrower view.`}
        search={{
          value: valuesQuery,
          onChange: setValuesQuery,
          placeholder: "Search metadata values",
        }}
        meta={(
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {props.inventories.length > 1 ? (
              <Select
                value={String(inventoryIndex)}
                onChange={(event) => setInventoryIndex(Number(event.target.value))}
                className="h-9 min-w-[180px]"
              >
                {props.inventories.map((inventory, index) => (
                  <option key={inventory.resourceType} value={index}>
                    {inventory.label}
                  </option>
                ))}
              </Select>
            ) : null}
            <Select
              value={valueResourceFilter}
              onChange={(event) => setValueResourceFilter(event.target.value)}
              className="h-9 min-w-[220px]"
              disabled={inventoryItems.length === 0}
            >
              <option value={ALL_RESOURCES_FILTER}>All resources</option>
              {inventoryItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
            <TableMetaBadges
              total={metadataEntries.length}
              noun="entries"
              loading={metadata.valuesLoading}
              query={valuesQuery}
            />
          </div>
        )}
        loading={metadata.valuesLoading}
        error={metadata.valuesError}
        columns={["Field", "Value", "Resource", "Updated", "Actions"]}
        rows={metadataEntries.map((entry) => {
          const resource = findResource(entry.resourceId);

          return {
            id: `${entry.resourceId}-${entry.key}`,
            cells: [
              <span className="font-medium text-slate-900">{entry.label}</span>,
              <span className="text-sm text-slate-600">{entry.value}</span>,
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-700">
                  {resource?.label ?? entry.resourceId}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {resource?.detail ?? entry.resourceId}
                </div>
              </div>,
              <span className="text-xs text-slate-500">{formatTimestamp(entry.updatedAt)}</span>,
              <RowActionMenu
                label={`${entry.label} value actions`}
                items={[
                  {
                    label: "Edit value",
                    onSelect: () => openValueEditorForEntry(entry),
                  },
                  {
                    label: "Remove value",
                    destructive: true,
                    onSelect: () => openDeleteValue(entry),
                  },
                ]}
              />,
            ],
            previewEyebrow: "Resource Metadata",
            previewTitle: entry.label,
            previewDescription: entry.description || "No description",
            previewMeta: [
              { label: "Value", value: entry.value },
              { label: "Resource", value: resource?.label ?? entry.resourceId },
            ],
            drawerMeta: [
              { label: "Resource type", value: entry.resourceType },
              { label: "Resource", value: resource?.label ?? entry.resourceId },
              { label: "Resource id", value: entry.resourceId },
              { label: "Key", value: entry.key },
              { label: "Value", value: entry.value },
              { label: "Updated", value: formatTimestamp(entry.updatedAt) },
            ],
          };
        })}
        emptyTitle="No metadata values yet"
        emptyDetail="Use a field row action to attach the first value, or narrow this table with a resource filter."
      />

      <ModalSurface
        open={fieldEditorOpen}
        onClose={() => setFieldEditorOpen(false)}
        title={fieldEditorMode === "edit" ? "Edit metadata field" : "New metadata field"}
        description={`Define the field contract for ${activeInventory?.label ?? "this inventory"}, then reuse it consistently across resources.`}
        footer={(
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setFieldEditorOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void saveFieldDraft()}
              disabled={!fieldDraft.key.trim() || !fieldDraft.label.trim()}
            >
              Save field
            </Button>
          </div>
        )}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <Input
            value={fieldDraft.key}
            onChange={(event) => setFieldDraft((current) => ({ ...current, key: event.target.value }))}
            placeholder="Field key"
            disabled={fieldEditorMode === "edit"}
          />
          <Input
            value={fieldDraft.label}
            onChange={(event) => setFieldDraft((current) => ({ ...current, label: event.target.value }))}
            placeholder="Field label"
          />
        </div>
        <Textarea
          value={fieldDraft.description}
          onChange={(event) => setFieldDraft((current) => ({ ...current, description: event.target.value }))}
          placeholder="Field description"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={fieldDraft.searchable}
              onChange={(event) => setFieldDraft((current) => ({ ...current, searchable: event.target.checked }))}
            />
            Searchable in this inventory
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={fieldDraft.filterable}
              onChange={(event) => setFieldDraft((current) => ({ ...current, filterable: event.target.checked }))}
            />
            Filterable for clients
          </label>
        </div>
      </ModalSurface>

      <ModalSurface
        open={valueEditorOpen}
        onClose={() => setValueEditorOpen(false)}
        title={valueEditorMode === "edit" ? "Edit metadata value" : "Add metadata value"}
        description={valueDraft
          ? `Attach ${valueDraft.label} to a resource in ${activeInventory?.label ?? "this inventory"}.`
          : "Attach a metadata value to a resource."}
        footer={(
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setValueEditorOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void saveValueDraft()}
              disabled={!valueDraft?.resourceId || !valueDraft.value.trim()}
            >
              Save value
            </Button>
          </div>
        )}
      >
        {valueDraft ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Resource
                </div>
                <Select
                  value={valueDraft.resourceId}
                  onChange={(event) => updateValueDraftResource(event.target.value)}
                  disabled={valueDraft.resourceLocked || inventoryItems.length === 0}
                >
                  {inventoryItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Field
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm text-slate-700">
                  {valueDraft.label}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                Field key
              </div>
              <div className="mt-1 font-mono text-xs text-slate-600">{valueDraft.key}</div>
              {valueDraft.description ? (
                <div className="mt-2 text-sm leading-6 text-slate-500">{valueDraft.description}</div>
              ) : null}
            </div>

            <Textarea
              value={valueDraft.value}
              onChange={(event) => setValueDraft((current) => current
                ? { ...current, value: event.target.value }
                : current)}
              placeholder="Metadata value"
            />
          </div>
        ) : null}
      </ModalSurface>

      <ModalSurface
        open={confirmation !== null}
        onClose={() => {
          setConfirmation(null);
          setConfirmationInput("");
        }}
        title={confirmation?.kind === "definition" ? "Remove metadata field" : "Remove metadata value"}
        description={confirmation
          ? `Type ${confirmation.key} to confirm removal of ${confirmation.label}.`
          : undefined}
        footer={(
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setConfirmation(null);
                setConfirmationInput("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="border-rose-200 text-rose-700 hover:bg-rose-50"
              onClick={() => void confirmDestructiveAction()}
              disabled={!confirmation || confirmationInput.trim() !== confirmation.key}
            >
              Remove
            </Button>
          </div>
        )}
      >
        {confirmation ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-3 text-sm leading-6 text-rose-700">
              {confirmation.kind === "definition"
                ? "Removing a field also removes its attached values for this resource type."
                : "This removes only the selected value from the current resource."}
            </div>
            <Input
              value={confirmationInput}
              onChange={(event) => setConfirmationInput(event.target.value)}
              placeholder={confirmation.key}
            />
          </div>
        ) : null}
      </ModalSurface>
    </div>
  );
}

function RowActionMenu(props: {
  label: string;
  items: Array<{
    label: string;
    onSelect: () => void;
    disabled?: boolean;
    destructive?: boolean;
  }>;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function updatePosition(): void {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const menuWidth = 176;
      const viewportPadding = 12;
      const top = rect.bottom + 8;
      const left = Math.min(
        Math.max(viewportPadding, rect.right - menuWidth),
        window.innerWidth - menuWidth - viewportPadding
      );

      setPosition({ top, left });
    }

    function handlePointerDown(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <Button
        ref={buttonRef}
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 rounded-md p-0 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
        aria-label={props.label}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>

      {open && position
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-50 min-w-44 rounded-xl border border-slate-200 bg-white/98 p-1.5 shadow-[0_18px_48px_rgba(15,23,42,0.12)]"
              style={{
                top: `${position.top}px`,
                left: `${position.left}px`,
              }}
            >
              <div className="space-y-1">
                {props.items.map((item) => (
                  <ActionMenuItem
                    key={item.label}
                    destructive={item.destructive}
                    disabled={item.disabled}
                    onSelect={() => {
                      setOpen(false);
                      item.onSelect();
                    }}
                  >
                    {item.label}
                  </ActionMenuItem>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function ActionMenuItem(props: {
  children: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      className={cn(
        "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors",
        props.disabled
          ? "cursor-not-allowed text-slate-300"
          : props.destructive
            ? "text-rose-700 hover:bg-rose-50"
            : "text-slate-700 hover:bg-slate-50"
      )}
      onClick={(event) => {
        event.stopPropagation();
        if (props.disabled) {
          return;
        }
        props.onSelect();
      }}
    >
      {props.children}
    </button>
  );
}
