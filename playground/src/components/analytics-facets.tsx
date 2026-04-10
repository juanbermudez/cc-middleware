import type { AnalyticsFacetValue, AnalyticsFacetsResponse } from "../lib/playground";
import { Badge } from "./ui/badge";
import { InlineState } from "./playground-ui";

function FacetGroup(props: {
  title: string;
  description: string;
  values: AnalyticsFacetValue[];
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <div className="space-y-1">
        <div className="text-sm font-medium text-slate-900">{props.title}</div>
        <p className="text-sm leading-6 text-slate-500">{props.description}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {props.values.length > 0 ? (
          props.values.map((item) => (
            <Badge key={`${props.title}-${item.value}`} variant="outline" className="gap-2 px-2.5 py-1">
              <span className="font-medium text-slate-700">{item.value}</span>
              <span className="text-slate-400">{item.count}</span>
            </Badge>
          ))
        ) : (
          <span className="text-sm text-slate-400">No values in range.</span>
        )}
      </div>
    </div>
  );
}

export function AnalyticsFacets(props: {
  facets: AnalyticsFacetsResponse | null;
  loading?: boolean;
  error?: string | null;
}) {
  if (props.error) {
    return (
      <InlineState
        variant="error"
        title="Could not load analytics facets"
        detail={props.error}
      />
    );
  }

  if (!props.loading && !props.facets) {
    return (
      <InlineState
        variant="neutral"
        title="No facet data yet"
        detail="Once transcript history or live middleware events are available, slices will appear here."
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <FacetGroup
        title="Trace kinds"
        description="Root sessions, subagents, and other trace shapes in the current range."
        values={props.facets?.traceKinds ?? []}
      />
      <FacetGroup
        title="Error kinds"
        description="API failures, tool errors, permission denials, and middleware exceptions."
        values={props.facets?.errorKinds ?? []}
      />
      <FacetGroup
        title="Tools"
        description="Tool usage grouped by the derived fact layer."
        values={props.facets?.toolNames ?? []}
      />
      <FacetGroup
        title="Keyword categories"
        description="English keyword buckets detected in the selected time range."
        values={props.facets?.keywordCategories ?? []}
      />
    </div>
  );
}
