"use client";

/**
 * Location Picker Modal Component
 *
 * A modal dialog for selecting and sending a location via WhatsApp.
 * Uses Leaflet.js with OpenStreetMap for the interactive map.
 *
 * Features:
 * - Interactive map for picking locations by clicking
 * - Current location detection (with user permission)
 * - Search by coordinates
 * - Optional name and address fields
 * - Responsive design
 */

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Crosshair, Loader2, MapPin, Send } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";

// Define the props type for LocationMap
interface LocationMapProps {
  latitude: number;
  longitude: number;
  interactive?: boolean;
  zoom?: number;
  className?: string;
  onLocationSelect?: (lat: number, lng: number) => void;
  markerLabel?: string;
}

// Dynamically import the map component to avoid SSR issues with Leaflet
const LocationMap = dynamic<LocationMapProps>(
  () => import("@/components/location/location-map").then((mod) => mod.default),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-64 bg-muted rounded-lg flex items-center justify-center">
        <MapPin className="h-8 w-8 text-muted-foreground animate-pulse" />
      </div>
    ),
  },
);

export interface LocationPickerResult {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (location: LocationPickerResult) => void;
  isSending?: boolean;
}

export function LocationPickerModal({
  isOpen,
  onClose,
  onSend,
  isSending = false,
}: LocationPickerModalProps) {
  // Default to a central location (can be customized per user)
  const [latitude, setLatitude] = useState<number>(-17.7833); // La Paz, Bolivia
  const [longitude, setLongitude] = useState<number>(-63.1822);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [hasSelectedLocation, setHasSelectedLocation] = useState(false);

  // Handle location selection from map click
  const handleLocationSelect = useCallback((lat: number, lng: number) => {
    setLatitude(lat);
    setLongitude(lng);
    setHasSelectedLocation(true);
    setLocationError(null);
  }, []);

  // Get current location using browser geolocation API
  const handleGetCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      return;
    }

    setIsLoadingLocation(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setHasSelectedLocation(true);
        setIsLoadingLocation(false);
      },
      (error) => {
        setIsLoadingLocation(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError("Location permission denied");
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError("Location information unavailable");
            break;
          case error.TIMEOUT:
            setLocationError("Location request timed out");
            break;
          default:
            setLocationError("Failed to get location");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  }, []);

  // Handle send
  const handleSend = useCallback(() => {
    if (!hasSelectedLocation) {
      setLocationError("Please select a location on the map");
      return;
    }

    onSend({
      latitude,
      longitude,
      name: name.trim() || undefined,
      address: address.trim() || undefined,
    });
  }, [latitude, longitude, name, address, hasSelectedLocation, onSend]);

  // Reset state when modal closes
  const handleClose = useCallback(() => {
    setLatitude(-17.7833);
    setLongitude(-63.1822);
    setName("");
    setAddress("");
    setHasSelectedLocation(false);
    setLocationError(null);
    onClose();
  }, [onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Send Location
          </DialogTitle>
          <DialogDescription>
            Click on the map to select a location, or use your current location.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Map */}
          <div className="relative rounded-lg overflow-hidden border">
            <LocationMap
              latitude={latitude}
              longitude={longitude}
              interactive={true}
              zoom={hasSelectedLocation ? 16 : 12}
              onLocationSelect={handleLocationSelect}
              className="w-full h-64"
            />

            {/* Current Location Button */}
            <Button
              variant="secondary"
              size="sm"
              className="absolute top-2 right-2 shadow-md"
              onClick={handleGetCurrentLocation}
              disabled={isLoadingLocation}
            >
              {isLoadingLocation ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Crosshair className="h-4 w-4" />
              )}
              <span className="ml-1.5 hidden sm:inline">My Location</span>
            </Button>
          </div>

          {/* Location Error */}
          {locationError && (
            <p className="text-sm text-destructive">{locationError}</p>
          )}

          {/* Coordinates Display */}
          <div
            className={cn(
              "text-sm px-3 py-2 rounded-md",
              hasSelectedLocation
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            <span className="font-medium">
              {hasSelectedLocation ? "Selected: " : "Tap map to select: "}
            </span>
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </div>

          {/* Optional Fields */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="location-name" className="text-sm">
                Location Name (optional)
              </Label>
              <Input
                id="location-name"
                placeholder="e.g., Office, Home, Restaurant"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="location-address" className="text-sm">
                Address (optional)
              </Label>
              <Input
                id="location-address"
                placeholder="e.g., 123 Main Street, City"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                maxLength={200}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isSending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!hasSelectedLocation || isSending}
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Location
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
