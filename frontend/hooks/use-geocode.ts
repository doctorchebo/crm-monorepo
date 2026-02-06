/**
 * useGeocode Hook
 *
 * A custom React hook for geocoding (address to coordinates) and
 * reverse geocoding (coordinates to address) using OpenStreetMap's
 * Nominatim API.
 *
 * Features:
 * - Forward geocoding: Search addresses/places and get coordinates
 * - Reverse geocoding: Get address from coordinates
 * - Debounced search to respect API rate limits
 * - Caching to reduce API calls
 * - Error handling with user-friendly messages
 *
 * Nominatim Usage Policy:
 * - Max 1 request per second
 * - Include a valid User-Agent
 * - Cache results when possible
 *
 * @see https://nominatim.org/release-docs/develop/api/Search/
 */

import { useCallback, useRef, useState } from "react";

// ============================================================================
// Types
// ============================================================================

export interface GeocodingResult {
  /** Unique place ID from OSM */
  placeId: string;
  /** Latitude coordinate */
  latitude: number;
  /** Longitude coordinate */
  longitude: number;
  /** Display name (full address) */
  displayName: string;
  /** Short name (place name without full address) */
  name: string;
  /** Type of place (city, village, building, etc.) */
  type: string;
  /** Importance score for ranking (0-1) */
  importance: number;
  /** Bounding box [south, north, west, east] */
  boundingBox?: [number, number, number, number];
}

export interface ReverseGeocodingResult {
  /** Display name (full address) */
  displayName: string;
  /** Structured address components */
  address: {
    road?: string;
    houseNumber?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
    countryCode?: string;
  };
}

interface UseGeocodeOptions {
  /** Limit results to specific countries (ISO 3166-1 alpha-2 codes) */
  countryCodes?: string[];
  /** Maximum number of results to return */
  limit?: number;
  /** Language for results (e.g., 'en', 'es', 'de') */
  language?: string;
  /** Debounce delay in milliseconds */
  debounceMs?: number;
}

interface UseGeocodeReturn {
  /** Search for locations by query string */
  search: (query: string) => Promise<GeocodingResult[]>;
  /** Get address from coordinates */
  reverseGeocode: (
    lat: number,
    lng: number,
  ) => Promise<ReverseGeocodingResult | null>;
  /** Current search results */
  results: GeocodingResult[];
  /** Whether a search is in progress */
  isSearching: boolean;
  /** Error message if search failed */
  error: string | null;
  /** Clear results and errors */
  clearResults: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
const USER_AGENT = "WhatsAppCRM/1.0 (contact@example.com)";
const DEFAULT_LIMIT = 5;
const DEFAULT_DEBOUNCE_MS = 300;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// Cache
// ============================================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const searchCache = new Map<string, CacheEntry<GeocodingResult[]>>();
const reverseCache = new Map<string, CacheEntry<ReverseGeocodingResult>>();

function getCached<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.data;
  }
  cache.delete(key);
  return null;
}

function setCache<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T) {
  cache.set(key, { data, timestamp: Date.now() });
}

// ============================================================================
// API Response Types
// ============================================================================

interface NominatimSearchResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  class: string;
  type: string;
  place_rank: number;
  importance: number;
  addresstype: string;
  name: string;
  display_name: string;
  boundingbox: [string, string, string, string];
}

interface NominatimReverseResult {
  place_id: number;
  display_name: string;
  address: {
    road?: string;
    house_number?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useGeocode(options: UseGeocodeOptions = {}): UseGeocodeReturn {
  const {
    countryCodes = [],
    limit = DEFAULT_LIMIT,
    language = "en",
    debounceMs = DEFAULT_DEBOUNCE_MS,
  } = options;

  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for debouncing
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Search for locations by query string
   */
  const search = useCallback(
    async (query: string): Promise<GeocodingResult[]> => {
      const trimmedQuery = query.trim();

      // Clear previous timer and abort controller
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Empty query - clear results
      if (!trimmedQuery) {
        setResults([]);
        setError(null);
        return [];
      }

      // Check cache first
      const cacheKey = `${trimmedQuery}:${countryCodes.join(",")}:${limit}:${language}`;
      const cached = getCached(searchCache, cacheKey);
      if (cached) {
        setResults(cached);
        return cached;
      }

      // Debounce the API call
      return new Promise((resolve) => {
        debounceTimerRef.current = setTimeout(async () => {
          setIsSearching(true);
          setError(null);

          abortControllerRef.current = new AbortController();

          try {
            const params = new URLSearchParams({
              q: trimmedQuery,
              format: "json",
              limit: limit.toString(),
              addressdetails: "1",
            });

            if (countryCodes.length > 0) {
              params.set("countrycodes", countryCodes.join(","));
            }

            if (language) {
              params.set("accept-language", language);
            }

            const response = await fetch(
              `${NOMINATIM_BASE_URL}/search?${params.toString()}`,
              {
                headers: {
                  "User-Agent": USER_AGENT,
                },
                signal: abortControllerRef.current.signal,
              },
            );

            if (!response.ok) {
              if (response.status === 429) {
                throw new Error(
                  "Too many requests. Please wait a moment and try again.",
                );
              }
              throw new Error(`Search failed: ${response.statusText}`);
            }

            const data: NominatimSearchResult[] = await response.json();

            const mappedResults: GeocodingResult[] = data.map((item) => ({
              placeId: item.place_id.toString(),
              latitude: parseFloat(item.lat),
              longitude: parseFloat(item.lon),
              displayName: item.display_name,
              name: item.name || item.display_name.split(",")[0],
              type: item.type,
              importance: item.importance,
              boundingBox: item.boundingbox
                ? [
                    parseFloat(item.boundingbox[0]),
                    parseFloat(item.boundingbox[1]),
                    parseFloat(item.boundingbox[2]),
                    parseFloat(item.boundingbox[3]),
                  ]
                : undefined,
            }));

            // Cache the results
            setCache(searchCache, cacheKey, mappedResults);

            setResults(mappedResults);
            setIsSearching(false);
            resolve(mappedResults);
          } catch (err) {
            if (err instanceof Error && err.name === "AbortError") {
              // Ignore aborted requests
              resolve([]);
              return;
            }

            const errorMessage =
              err instanceof Error ? err.message : "Search failed";
            setError(errorMessage);
            setIsSearching(false);
            setResults([]);
            resolve([]);
          }
        }, debounceMs);
      });
    },
    [countryCodes, limit, language, debounceMs],
  );

  /**
   * Get address from coordinates (reverse geocoding)
   */
  const reverseGeocode = useCallback(
    async (
      lat: number,
      lng: number,
    ): Promise<ReverseGeocodingResult | null> => {
      const cacheKey = `${lat.toFixed(6)},${lng.toFixed(6)}:${language}`;
      const cached = getCached(reverseCache, cacheKey);
      if (cached) {
        return cached;
      }

      try {
        const params = new URLSearchParams({
          lat: lat.toString(),
          lon: lng.toString(),
          format: "json",
          addressdetails: "1",
        });

        if (language) {
          params.set("accept-language", language);
        }

        const response = await fetch(
          `${NOMINATIM_BASE_URL}/reverse?${params.toString()}`,
          {
            headers: {
              "User-Agent": USER_AGENT,
            },
          },
        );

        if (!response.ok) {
          if (response.status === 429) {
            throw new Error("Too many requests. Please try again later.");
          }
          return null;
        }

        const data: NominatimReverseResult = await response.json();

        const result: ReverseGeocodingResult = {
          displayName: data.display_name,
          address: {
            road: data.address.road,
            houseNumber: data.address.house_number,
            neighbourhood: data.address.neighbourhood,
            suburb: data.address.suburb,
            city: data.address.city,
            town: data.address.town,
            village: data.address.village,
            county: data.address.county,
            state: data.address.state,
            postcode: data.address.postcode,
            country: data.address.country,
            countryCode: data.address.country_code,
          },
        };

        // Cache the result
        setCache(reverseCache, cacheKey, result);

        return result;
      } catch (err) {
        console.error("Reverse geocoding failed:", err);
        return null;
      }
    },
    [language],
  );

  /**
   * Clear results and errors
   */
  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return {
    search,
    reverseGeocode,
    results,
    isSearching,
    error,
    clearResults,
  };
}
