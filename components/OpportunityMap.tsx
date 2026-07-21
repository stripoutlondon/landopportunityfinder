"use client";

import dynamic from "next/dynamic";
import type { Opportunity } from "@/lib/types";

const OpportunityMapInner = dynamic(() => import("./OpportunityMapInner"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading Hertsmere opportunity map…</div>,
});

export default function OpportunityMap({ items, priorityIds }: { items: Opportunity[]; priorityIds: Set<string> }) {
  return <OpportunityMapInner items={items} priorityIds={[...priorityIds]} />;
}
