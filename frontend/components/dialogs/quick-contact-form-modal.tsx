/**
 * QuickContactFormModal
 * Modal to quickly save a contact from a received contact message
 *
 * Fields:
 * - First Name (required)
 * - Last Name (optional)
 * - Country Code (required, dropdown)
 * - Phone Number (required)
 *
 * Actions:
 * - Save: Creates/updates contact
 * - Cancel: Closes modal
 */

"use client";

import { Button } from "@/components/ui/button";
import { CountryCodeSelect } from "@/components/ui/country-code-select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";

interface QuickContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    firstName: string;
    lastName: string;
    countryCode: string;
    phoneNumber: string;
  }) => void;
  initialData?: {
    firstName?: string;
    lastName?: string;
    countryCode?: string;
    phoneNumber?: string;
  };
  isLoading?: boolean;
}

/**
 * Parse a full phone number to extract country code and local number
 * Example: +59167131914 -> { countryCode: "+591", phoneNumber: "67131914" }
 */
function parsePhoneNumber(fullPhone: string): {
  countryCode: string;
  phoneNumber: string;
} {
  if (!fullPhone) return { countryCode: "", phoneNumber: "" };

  // Remove any spaces, dashes, or parentheses
  const cleaned = fullPhone.replace(/[\s\-()]/g, "");

  // If it starts with +, extract country code (1-3 digits after +)
  if (cleaned.startsWith("+")) {
    // Common country codes are 1-3 digits
    // Try to match common patterns
    const match = cleaned.match(/^(\+\d{1,3})(\d+)$/);
    if (match) {
      return { countryCode: match[1], phoneNumber: match[2] };
    }
  }

  // If no country code detected, return as is
  return { countryCode: "", phoneNumber: cleaned };
}

export function QuickContactFormModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  isLoading = false,
}: QuickContactFormModalProps) {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    countryCode: "",
    phoneNumber: "",
  });
  const [error, setError] = useState<string | null>(null);

  // Initialize form with provided data
  useEffect(() => {
    if (isOpen && initialData) {
      // Parse phone number if country code not provided separately
      let countryCode = initialData.countryCode || "";
      let phoneNumber = initialData.phoneNumber || "";

      if (!countryCode && phoneNumber) {
        const parsed = parsePhoneNumber(phoneNumber);
        countryCode = parsed.countryCode;
        phoneNumber = parsed.phoneNumber;
      }

      setFormData({
        firstName: initialData.firstName || "",
        lastName: initialData.lastName || "",
        countryCode,
        phoneNumber,
      });
      setError(null);
    }
  }, [isOpen, initialData]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFormData({
        firstName: "",
        lastName: "",
        countryCode: "",
        phoneNumber: "",
      });
      setError(null);
    }
  }, [isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (error) setError(null);
  };

  const validateForm = (): boolean => {
    if (!formData.firstName.trim()) {
      setError("First name is required");
      return false;
    }
    if (!formData.countryCode.trim()) {
      setError("Country code is required");
      return false;
    }
    if (!/^\+\d{1,3}$/.test(formData.countryCode)) {
      setError("Invalid country code format (e.g., +1, +34)");
      return false;
    }
    if (!formData.phoneNumber.trim()) {
      setError("Phone number is required");
      return false;
    }
    if (!/^\d{6,15}$/.test(formData.phoneNumber)) {
      setError("Invalid phone number (6-15 digits)");
      return false;
    }
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    onSave({
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      countryCode: formData.countryCode.trim(),
      phoneNumber: formData.phoneNumber.trim(),
    });
  };

  // Determine if this is editing an existing contact
  const isEditMode = !!(initialData?.phoneNumber || initialData?.firstName);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "Edit Contact" : "Save Contact"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          {/* First Name */}
          <div className="grid gap-2">
            <Label htmlFor="firstName">
              First Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="firstName"
              name="firstName"
              placeholder="Enter first name"
              value={formData.firstName}
              onChange={handleChange}
              disabled={isLoading}
              required
            />
          </div>

          {/* Last Name */}
          <div className="grid gap-2">
            <Label htmlFor="lastName">Last Name</Label>
            <Input
              id="lastName"
              name="lastName"
              placeholder="Enter last name"
              value={formData.lastName}
              onChange={handleChange}
              disabled={isLoading}
            />
          </div>

          {/* Country Code & Phone Number */}
          <div className="grid gap-2">
            <Label>
              Phone Number <span className="text-red-500">*</span>
            </Label>
            <div className="grid grid-cols-5 gap-2">
              <div className="col-span-2">
                <CountryCodeSelect
                  value={formData.countryCode}
                  onChange={(code) => {
                    setFormData((prev) => ({
                      ...prev,
                      countryCode: code,
                    }));
                    if (error) setError(null);
                  }}
                  disabled={isLoading}
                />
              </div>
              <div className="col-span-3">
                <Input
                  id="phoneNumber"
                  name="phoneNumber"
                  placeholder="Phone number"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  disabled={isLoading}
                  required
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              6-15 digits without country code
            </p>
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : "Save Contact"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
