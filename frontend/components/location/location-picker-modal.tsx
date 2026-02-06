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
 * - Address/place search using OpenStreetMap Nominatim (free)
 * - Auto-fill address from selected coordinates
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
import { GeocodingResult, useGeocode } from "@/hooks/use-geocode";
import { cn } from "@/lib/utils";
import { Crosshair, Loader2, MapPin, Search, Send, X } from "lucide-react";
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
  const t = useTranslations("chats.location");

  // Default to a central location (can be customized per user)
  const [latitude, setLatitude] = useState<number>(-17.7833);
  const [longitude, setLongitude] = useState<number>(-63.1822);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [hasSelectedLocation, setHasSelectedLocation] = useState(false);

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
    },
    [clearResults],
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
      setLatitude(lat);
      setLongitude(lng);
      setHasSelectedLocation(true);
      setLocationError(null);

      // Try to get address from coordinates (reverse geocoding)
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
          setAddress(parts.join(", "));
        }
      }
    },
    [reverseGeocode],
  );

  // Get current location using browser geolocation API
  const handleGetCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError(t("errors.geolocationNotSupported"));
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
  }, [t]);

  // Handle send
  const handleSend = useCallback(() => {
    if (!hasSelectedLocation) {
      setLocationError(t("errors.pleaseSelect"));
      return;
    }

    onSend({
      latitude,
      longitude,
      name: name.trim() || undefined,
      address: address.trim() || undefined,
    });
  }, [latitude, longitude, name, address, hasSelectedLocation, onSend, t]);

  // Reset state when modal closes
  const handleClose = useCallback(() => {
    setLatitude(-17.7833);
    setLongitude(-63.1822);
    setName("");
    setAddress("");
    setHasSelectedLocation(false);
    setLocationError(null);
    setSearchQuery("");
    setShowSearchResults(false);
    clearResults();
    onClose();
  }, [onClose, clearResults]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder={t("search.placeholder")}
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={() => searchQuery && setShowSearchResults(true)}
                className="pl-9 pr-9"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={handleClearSearch}
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
              <span className="ml-1.5 hidden sm:inline">{t("myLocation")}</span>
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
              {hasSelectedLocation
                ? `${t("selected")}: `
                : `${t("tapToSelect")}: `}
            </span>
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </div>

          {/* Optional Fields */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="location-name" className="text-sm">
                {t("name")}
              </Label>
              <Input
                id="location-name"
                placeholder={t("namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
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
                onChange={(e) => setAddress(e.target.value)}
                maxLength={200}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isSending}>
            {t("cancel")}
          </Button>
          <Button
            onClick={handleSend}
            disabled={!hasSelectedLocation || isSending}
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("sending")}
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                {t("send")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
