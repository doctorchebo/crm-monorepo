"use client";

/**
 * Location Map Component using Leaflet.js
 *
 * A lightweight, open-source map component for displaying and picking locations.
 * Uses OpenStreetMap tiles (free, no API key required).
 *
 * Features:
 * - Display mode: Shows a marker at the specified location
 * - Interactive mode: Allows clicking to select a location
 * - Fully responsive
 */

import { cn } from "@/lib/utils";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { memo, useEffect, useRef } from "react";

// Fix for default marker icons in Leaflet with webpack/Next.js
// The default icons are broken because webpack changes the asset paths
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

interface LocationMapProps {
  latitude: number;
  longitude: number;
  interactive?: boolean;
  zoom?: number;
  className?: string;
  onLocationSelect?: (lat: number, lng: number) => void;
  markerLabel?: string;
}

const LocationMap = memo(function LocationMap({
  latitude,
  longitude,
  interactive = false,
  zoom = 15,
  className,
  onLocationSelect,
  markerLabel,
}: LocationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize map only once
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        center: [latitude, longitude],
        zoom,
        zoomControl: interactive,
        scrollWheelZoom: interactive,
        dragging: interactive,
        doubleClickZoom: interactive,
        touchZoom: interactive,
        attributionControl: false, // We'll add custom attribution
      });

      // Use OpenStreetMap tiles (free, no API key needed)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(mapRef.current);

      // Add custom compact attribution
      L.control
        .attribution({
          prefix: false,
          position: "bottomright",
        })
        .addAttribution(
          '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OSM</a>',
        )
        .addTo(mapRef.current);

      // Add marker
      markerRef.current = L.marker([latitude, longitude]).addTo(mapRef.current);

      if (markerLabel) {
        markerRef.current.bindPopup(markerLabel).openPopup();
      }

      // Handle click events for interactive mode
      if (interactive && onLocationSelect) {
        mapRef.current.on("click", (e: L.LeafletMouseEvent) => {
          const { lat, lng } = e.latlng;
          onLocationSelect(lat, lng);

          // Update marker position
          if (markerRef.current) {
            markerRef.current.setLatLng([lat, lng]);
          }
        });
      }
    }

    return () => {
      // Cleanup on unmount
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, []); // Only run once on mount

  // Update marker position when coordinates change
  useEffect(() => {
    if (markerRef.current && mapRef.current) {
      markerRef.current.setLatLng([latitude, longitude]);
      mapRef.current.setView([latitude, longitude], zoom);
    }
  }, [latitude, longitude, zoom]);

  return (
    <div
      ref={mapContainerRef}
      className={cn("w-full h-full min-h-[120px] rounded-lg", className)}
      style={{ zIndex: 0 }}
    />
  );
});

export default LocationMap;
