"use client";

/**
 * Location Editor Modal Component
 *
 * A modal dialog for selecting a location to use in templates or other contexts.
 * Similar to LocationPickerModal but designed for editing/saving rather than sending.
 *
 * Features:
 * - Interactive map for picking locations by clicking
 * - Current location detection (with user permission)
 * - Address/place search using OpenStreetMap Nominatim (free)
 * - Auto-fill address from selected coordinates
 * - Optional name and address fields
 * - Pre-populated with existing location data for editing
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
import { Check, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import type { LocationData } from "./location-picker";
import { LocationPicker } from "./location-picker";

export interface LocationEditorResult {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

interface LocationEditorModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Callback when location is saved */
  onSave: (location: LocationEditorResult) => void;
  /** Initial location data for editing */
  initialLocation?: LocationEditorResult;
  /** Title override for the modal */
  title?: string;
  /** Description override for the modal */
  description?: string;
}

export function LocationEditorModal({
  isOpen,
  onClose,
  onSave,
  initialLocation,
  title,
  description,
}: LocationEditorModalProps) {
  const t = useTranslations("chats.location");

  // Current location state
  const [location, setLocation] = useState<LocationData | null>(null);
  const [hasSelectedLocation, setHasSelectedLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Initialize with existing location when modal opens or initialLocation changes
  useEffect(() => {
    if (isOpen && initialLocation) {
      setLocation({
        latitude: initialLocation.latitude,
        longitude: initialLocation.longitude,
        name: initialLocation.name,
        address: initialLocation.address,
      });
      setHasSelectedLocation(true);
      setLocationError(null);
    }
  }, [isOpen, initialLocation]);

  // Handle location change from picker
  const handleLocationChange = useCallback((newLocation: LocationData) => {
    setLocation(newLocation);
    setHasSelectedLocation(true);
    setLocationError(null);
  }, []);

  // Handle save
  const handleSave = useCallback(() => {
    if (!hasSelectedLocation || !location) {
      setLocationError(t("errors.pleaseSelect"));
      return;
    }

    onSave({
      latitude: location.latitude,
      longitude: location.longitude,
      name: location.name,
      address: location.address,
    });

    // Close modal after successful save
    onClose();
  }, [location, hasSelectedLocation, onSave, onClose, t]);

  // Reset state when modal closes
  const handleClose = useCallback(() => {
    setLocation(null);
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
            {title || t("title")}
          </DialogTitle>
          <DialogDescription>
            {description || t("description")}
          </DialogDescription>
        </DialogHeader>

        <LocationPicker
          value={location ?? undefined}
          onChange={handleLocationChange}
          mapHeight="h-64"
          showOptionalFields={true}
          showSearch={true}
          showCurrentLocation={true}
          showCoordinates={true}
        />

        {/* Location Error */}
        {locationError && (
          <p className="text-sm text-destructive">{locationError}</p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={!hasSelectedLocation}>
            <Check className="h-4 w-4 mr-2" />
            {t("save") || "Save Location"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
