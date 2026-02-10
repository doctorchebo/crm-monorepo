"use client";

/**
 * Location Picker Component
 *
 * A reusable component for selecting geographic locations using a Leaflet map.
 * Can be used standalone or embedded within modals/forms.
 *
 * Features:
 * - Interactive map for picking locations by clicking
 * - Address/place search using OpenStreetMap Nominatim
 * - Current location detection (with user permission)
 * - Auto-fill address from selected coordinates
 * - Responsive design with configurable size
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GeocodingResult, useGeocode } from "@/hooks/use-geocode";
import { cn } from "@/lib/utils";
import { Crosshair, Loader2, MapPin, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

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
      <div className="w-full h-full bg-muted rounded-lg flex items-center justify-center min-h-[200px]">
        <MapPin className="h-8 w-8 text-muted-foreground animate-pulse" />
      </div>
    ),
  },
);

/** Location data structure */
export interface LocationData {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

/** Props for LocationPicker component */
export interface LocationPickerProps {
  /** Current location value */
  value?: Partial<LocationData>;
  /** Callback when location changes */
  onChange: (location: LocationData) => void;
  /** Whether the picker is disabled */
  disabled?: boolean;
  /** Height of the map container */
  mapHeight?: string;
  /** Whether to show name/address input fields */
  showOptionalFields?: boolean;
  /** Whether to show the search bar */
  showSearch?: boolean;
  /** Whether to show the current location button */
  showCurrentLocation?: boolean;
  /** Whether to show coordinates display */
  showCoordinates?: boolean;
  /** Custom class name for the container */
  className?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
}

/**
 * LocationPicker Component
 *
 * A reusable location selection component with map, search, and optional fields.
 */
export function LocationPicker({
  value,
  onChange,
  disabled = false,
  mapHeight = "h-64",
  showOptionalFields = true,
  showSearch = true,
  showCurrentLocation = true,
  showCoordinates = true,
  className,
  size = "md",
}: LocationPickerProps) {
  const t = useTranslations("chats.location");

  // Default to a central location (Bolivia - can be customized)
  const [latitude, setLatitude] = useState<number>(value?.latitude ?? -17.7833);
  const [longitude, setLongitude] = useState<number>(
    value?.longitude ?? -63.1822,
  );
  const [name, setName] = useState(value?.name ?? "");
  const [address, setAddress] = useState(value?.address ?? "");
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [hasSelectedLocation, setHasSelectedLocation] = useState(
    value?.latitude !== undefined && value?.longitude !== undefined,
  );

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchResultsRef = useRef<HTMLDivElement>(null);

  // Geocoding hook
  const {
    search,
    reverseGeocode,
    results: searchResults,
    isSearching,
    error: searchError,
    clearResults,
  } = useGeocode({
    limit: 5,
    debounceMs: 400,
  });

  // Sync external value changes
  useEffect(() => {
    if (value?.latitude !== undefined && value?.latitude !== latitude) {
      setLatitude(value.latitude);
    }
    if (value?.longitude !== undefined && value?.longitude !== longitude) {
      setLongitude(value.longitude);
    }
    if (value?.name !== undefined && value?.name !== name) {
      setName(value.name);
    }
    if (value?.address !== undefined && value?.address !== address) {
      setAddress(value.address);
    }
    if (value?.latitude !== undefined && value?.longitude !== undefined) {
      setHasSelectedLocation(true);
    }
  }, [value?.latitude, value?.longitude, value?.name, value?.address]);

  // Emit changes to parent
  const emitChange = useCallback(
    (
      lat: number,
      lng: number,
      locationName?: string,
      locationAddress?: string,
    ) => {
      onChange({
        latitude: lat,
        longitude: lng,
        name: locationName?.trim() || undefined,
        address: locationAddress?.trim() || undefined,
      });
    },
    [onChange],
  );

  // Handle search input change
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const query = e.target.value;
      setSearchQuery(query);
      setShowSearchResults(true);
      search(query);
    },
    [search],
  );

  // Handle search result selection
  const handleSearchResultSelect = useCallback(
    async (result: GeocodingResult) => {
      setLatitude(result.latitude);
      setLongitude(result.longitude);
      setName(result.name);

      // Try to get a shorter address from the display name
      const addressParts = result.displayName.split(", ");
      const shortAddress =
        addressParts.length > 2
          ? addressParts.slice(0, 3).join(", ")
          : result.displayName;
      setAddress(shortAddress);

      setHasSelectedLocation(true);
      setLocationError(null);
      setSearchQuery("");
      setShowSearchResults(false);
      clearResults();

      emitChange(result.latitude, result.longitude, result.name, shortAddress);
    },
    [clearResults, emitChange],
  );

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setShowSearchResults(false);
    clearResults();
  }, [clearResults]);

  // Handle click outside search results
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchResultsRef.current &&
        !searchResultsRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Handle location selection from map click
  const handleLocationSelect = useCallback(
    async (lat: number, lng: number) => {
      if (disabled) return;

      setLatitude(lat);
      setLongitude(lng);
      setHasSelectedLocation(true);
      setLocationError(null);

      // Try to get address from coordinates (reverse geocoding)
      let newName = name;
      let newAddress = address;

      const result = await reverseGeocode(lat, lng);
      if (result) {
        // Build a short address from components
        const addr = result.address;
        const parts = [];

        if (addr.road) {
          parts.push(
            addr.houseNumber ? `${addr.road} ${addr.houseNumber}` : addr.road,
          );
        }
        if (addr.neighbourhood || addr.suburb) {
          parts.push(addr.neighbourhood || addr.suburb);
        }
        if (addr.city || addr.town || addr.village) {
          parts.push(addr.city || addr.town || addr.village);
        }

        if (parts.length > 0) {
          newAddress = parts.join(", ");
          setAddress(newAddress);
        }
      }

      emitChange(lat, lng, newName, newAddress);
    },
    [disabled, reverseGeocode, emitChange, name, address],
  );

  // Get current location using browser geolocation API
  const handleGetCurrentLocation = useCallback(() => {
    if (disabled) return;

    if (!navigator.geolocation) {
      setLocationError(t("errors.geolocationNotSupported"));
      return;
    }

    setIsLoadingLocation(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setLatitude(lat);
        setLongitude(lng);
        setHasSelectedLocation(true);
        setIsLoadingLocation(false);

        // Try reverse geocoding for address
        let newAddress = address;
        const result = await reverseGeocode(lat, lng);
        if (result) {
          const addr = result.address;
          const parts = [];
          if (addr.road) {
            parts.push(
              addr.houseNumber ? `${addr.road} ${addr.houseNumber}` : addr.road,
            );
          }
          if (addr.city || addr.town || addr.village) {
            parts.push(addr.city || addr.town || addr.village);
          }
          if (parts.length > 0) {
            newAddress = parts.join(", ");
            setAddress(newAddress);
          }
        }

        emitChange(lat, lng, name, newAddress);
      },
      (error) => {
        setIsLoadingLocation(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError(t("errors.permissionDenied"));
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError(t("errors.positionUnavailable"));
            break;
          case error.TIMEOUT:
            setLocationError(t("errors.timeout"));
            break;
          default:
            setLocationError(t("errors.failed"));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  }, [disabled, t, reverseGeocode, emitChange, name, address]);

  // Handle name change
  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newName = e.target.value;
      setName(newName);
      if (hasSelectedLocation) {
        emitChange(latitude, longitude, newName, address);
      }
    },
    [hasSelectedLocation, latitude, longitude, address, emitChange],
  );

  // Handle address change
  const handleAddressChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newAddress = e.target.value;
      setAddress(newAddress);
      if (hasSelectedLocation) {
        emitChange(latitude, longitude, name, newAddress);
      }
    },
    [hasSelectedLocation, latitude, longitude, name, emitChange],
  );

  const inputSize = size === "sm" ? "h-8 text-sm" : size === "lg" ? "h-11" : "";

  return (
    <div className={cn("space-y-3", className)}>
      {/* Search Bar */}
      {showSearch && (
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder={t("search.placeholder")}
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => searchQuery && setShowSearchResults(true)}
              className={cn("pl-9 pr-9", inputSize)}
              disabled={disabled}
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                onClick={handleClearSearch}
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {showSearchResults &&
            (searchResults.length > 0 || isSearching || searchError) && (
              <div
                ref={searchResultsRef}
                className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto"
              >
                {isSearching && (
                  <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("search.searching")}
                  </div>
                )}

                {searchError && (
                  <div className="p-3 text-sm text-destructive">
                    {searchError}
                  </div>
                )}

                {!isSearching &&
                  !searchError &&
                  searchResults.length === 0 &&
                  searchQuery.length >= 2 && (
                    <div className="p-3 text-sm text-muted-foreground">
                      {t("search.noResults")}
                    </div>
                  )}

                {searchResults.map((result) => (
                  <button
                    key={result.placeId}
                    type="button"
                    className="w-full text-left px-3 py-2.5 hover:bg-accent transition-colors border-b last:border-b-0 focus:outline-none focus:bg-accent"
                    onClick={() => handleSearchResultSelect(result)}
                    disabled={disabled}
                  >
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">
                          {result.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {result.displayName}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
        </div>
      )}

      {/* Map */}
      <div className="relative rounded-lg overflow-hidden border">
        <LocationMap
          latitude={latitude}
          longitude={longitude}
          interactive={!disabled}
          zoom={hasSelectedLocation ? 16 : 12}
          onLocationSelect={handleLocationSelect}
          className={cn("w-full", mapHeight)}
        />

        {/* Current Location Button */}
        {showCurrentLocation && (
          <Button
            variant="secondary"
            size="sm"
            className="absolute top-2 right-2 shadow-md"
            onClick={handleGetCurrentLocation}
            disabled={isLoadingLocation || disabled}
          >
            {isLoadingLocation ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Crosshair className="h-4 w-4" />
            )}
            <span className="ml-1.5 hidden sm:inline">{t("myLocation")}</span>
          </Button>
        )}
      </div>

      {/* Location Error */}
      {locationError && (
        <p className="text-sm text-destructive">{locationError}</p>
      )}

      {/* Coordinates Display */}
      {showCoordinates && (
        <div
          className={cn(
            "text-sm px-3 py-2 rounded-md",
            hasSelectedLocation
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          <span className="font-medium">
            {hasSelectedLocation
              ? `${t("selected")}: `
              : `${t("tapToSelect")}: `}
          </span>
          {latitude.toFixed(6)}, {longitude.toFixed(6)}
        </div>
      )}

      {/* Optional Name/Address Fields */}
      {showOptionalFields && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="location-name" className="text-sm">
              {t("name")}
            </Label>
            <Input
              id="location-name"
              placeholder={t("namePlaceholder")}
              value={name}
              onChange={handleNameChange}
              maxLength={100}
              disabled={disabled}
              className={inputSize}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="location-address" className="text-sm">
              {t("address")}
            </Label>
            <Input
              id="location-address"
              placeholder={t("addressPlaceholder")}
              value={address}
              onChange={handleAddressChange}
              maxLength={200}
              disabled={disabled}
              className={inputSize}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default LocationPicker;
