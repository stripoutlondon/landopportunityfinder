"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import type { Opportunity } from "@/lib/types";
import { deriveOpportunityIntelligence } from "@/lib/atlas/opportunity-intelligence";

function FitVisibleMarkers({ items }: { items: Opportunity[] }) {
  const map = useMap();
  useEffect(() => {
    const coordinates: Array<[number, number]> = items
      .filter((item) => item.latitude !== null && item.longitude !== null)
      .map((item) => [item.latitude as number, item.longitude as number]);
    if (coordinates.length > 1) map.fitBounds(coordinates as LatLngBoundsExpression, { padding: [24, 24], maxZoom: 14 });
  }, [items, map]);
  return null;
}

export default function OpportunityMapInner({ items, priorityIds }: { items: Opportunity[]; priorityIds: string[] }) {
  const mapped = items.filter((item) => item.latitude !== null && item.longitude !== null);
  const priority = new Set(priorityIds);
  return <MapContainer center={[51.66, -0.27]} zoom={11} scrollWheelZoom className="opportunity-map">
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <FitVisibleMarkers items={mapped} />
    {mapped.map((item) => {
      const intelligence = deriveOpportunityIntelligence(item);
      return <CircleMarker key={item.id} center={[item.latitude as number, item.longitude as number]} radius={priority.has(item.id) ? 9 : 6} pathOptions={{ color: priority.has(item.id) ? "#245c39" : "#a36712", fillOpacity: .78, weight: 2 }}>
        <Popup><div className="map-popup"><strong>{item.name}</strong><span>{intelligence.capacityLabel}</span><span>{intelligence.planningPosition}</span><a href={`/opportunities/${item.id}`}>Open investigation →</a></div></Popup>
      </CircleMarker>;
    })}
  </MapContainer>;
}
