"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { countries } from "countries-list";
import { ChevronDown } from "lucide-react";
import * as React from "react";

interface CountryCodeSelectProps {
  value: string;
  onChange: (countryCode: string) => void;
  disabled?: boolean;
}

// Generate flag emoji from country code (e.g., "US" -> "🇺🇸")
function getFlagEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return "🌍";

  try {
    const codePoints = countryCode
      .toUpperCase()
      .split("")
      .map((char) => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  } catch {
    return "🌍";
  }
}

// Convert countries object to sorted array with dial codes
const getCountriesList = () => {
  const list = Object.entries(countries)
    .map(([code, data]) => {
      const dialCode =
        data.phone && data.phone.length > 0 ? `+${data.phone[0]}` : "";
      return {
        code,
        name: data.name,
        dialCode,
        flag: getFlagEmoji(code),
      };
    })
    .filter((c) => c.dialCode) // Only include countries with dial codes
    .sort((a, b) => a.name.localeCompare(b.name));

  return list;
};

export function CountryCodeSelect({
  value,
  onChange,
  disabled = false,
}: CountryCodeSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const countriesList = React.useMemo(() => getCountriesList(), []);

  // Store the selected country code separately to preserve it
  const [selectedCountryCode, setSelectedCountryCode] = React.useState<
    string | null
  >(null);

  // Find the selected country - prioritize exact code match first, then dial code
  const selectedCountry = React.useMemo(() => {
    if (selectedCountryCode) {
      return countriesList.find((c) => c.code === selectedCountryCode);
    }
    return countriesList.find((c) => c.dialCode === value);
  }, [value, selectedCountryCode, countriesList]);

  // Filter countries based on search
  const filtered = countriesList.filter((country) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      country.name.toLowerCase().includes(searchLower) ||
      country.dialCode.includes(searchTerm) ||
      country.code.toLowerCase().includes(searchLower)
    );
  });

  const handleSelect = (country: (typeof countriesList)[0]) => {
    setSelectedCountryCode(country.code);
    onChange(country.dialCode);
    setOpen(false);
    setSearchTerm("");
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between px-3"
          disabled={disabled}
        >
          <span className="flex items-center gap-2 text-left flex-1 min-w-0">
            <span className="text-xl flex-shrink-0">
              {selectedCountry?.flag || "🌍"}
            </span>
            <span className="text-sm font-medium truncate">
              {selectedCountry?.dialCode || "Select country"}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-96">
        <div className="p-2">
          <Input
            placeholder="Search by country name or code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8"
            autoFocus
          />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup className="max-h-96 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-2 py-4 text-sm text-muted-foreground text-center">
              No countries found
            </div>
          ) : (
            filtered.map((country) => (
              <button
                key={country.code}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer outline-none transition-colors",
                  selectedCountryCode === country.code &&
                    "bg-accent text-accent-foreground"
                )}
                onClick={() => handleSelect(country)}
              >
                <span className="text-2xl flex-shrink-0">{country.flag}</span>
                <div className="flex-1 text-left min-w-0">
                  <div className="font-medium">{country.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {country.code}
                  </div>
                </div>
                <div className="font-semibold text-base flex-shrink-0">
                  {country.dialCode}
                </div>
              </button>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
