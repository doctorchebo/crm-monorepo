/**
 * Auto-detect column to field mappings
 * Rule-based header detection (no AI per spec)
 */

import { HeaderSuggestion, InternalField } from "../types";

// Mapping rules: pattern -> internal field
const HEADER_PATTERNS: Array<{
    patterns: RegExp[];
    field: InternalField;
    priority: number;
}> = [
        {
            field: "first_name",
            patterns: [
                /^first[_\s-]?name$/i,
                /^first$/i,
                /^given[_\s-]?name$/i,
                /^nombre$/i,
                /^prenom$/i,
            ],
            priority: 1,
        },
        {
            field: "last_name",
            patterns: [
                /^last[_\s-]?name$/i,
                /^last$/i,
                /^surname$/i,
                /^family[_\s-]?name$/i,
                /^apellido$/i,
            ],
            priority: 2,
        },
        {
            field: "phone_number",
            patterns: [
                /^phone$/i,
                /^phone[_\s-]?number$/i,
                /^mobile$/i,
                /^cell$/i,
                /^tel$/i,
                /^telephone$/i,
                /^telefono$/i,
                /^whatsapp$/i,
            ],
            priority: 3,
        },
        {
            field: "email",
            patterns: [
                /^email$/i,
                /^e[_\s-]?mail$/i,
                /^mail$/i,
                /^email[_\s-]?address$/i,
                /^correo$/i,
            ],
            priority: 4,
        },
        {
            field: "country_code",
            patterns: [
                /^country[_\s-]?code$/i,
                /^cc$/i,
                /^dial[_\s-]?code$/i,
                /^prefix$/i,
                /^codigo[_\s-]?pais$/i,
            ],
            priority: 5,
        },
        {
            field: "language",
            patterns: [
                /^lang$/i,
                /^language$/i,
                /^locale$/i,
                /^idioma$/i,
            ],
            priority: 6,
        },
    ];

/**
 * Suggest field mappings for source headers
 */
export function detectHeaders(headers: string[]): HeaderSuggestion[] {
    const suggestions: HeaderSuggestion[] = [];
    const usedFields = new Set<InternalField>();

    // Sort by priority to ensure higher priority fields are matched first
    const sortedPatterns = [...HEADER_PATTERNS].sort(
        (a, b) => a.priority - b.priority
    );

    for (const header of headers) {
        const normalizedHeader = header.trim();
        let suggestion: HeaderSuggestion = {
            sourceColumn: header,
            suggestedField: null,
            confidence: 0,
        };

        for (const { patterns, field } of sortedPatterns) {
            // Skip if this field was already matched
            if (usedFields.has(field)) continue;

            for (const pattern of patterns) {
                if (pattern.test(normalizedHeader)) {
                    suggestion = {
                        sourceColumn: header,
                        suggestedField: field,
                        confidence: 0.9,
                    };
                    usedFields.add(field);
                    break;
                }
            }

            if (suggestion.suggestedField) break;
        }

        // Check for partial matches with lower confidence
        if (!suggestion.suggestedField) {
            for (const { patterns, field } of sortedPatterns) {
                if (usedFields.has(field)) continue;

                const lowerHeader = normalizedHeader.toLowerCase();
                if (
                    lowerHeader.includes("phone") ||
                    lowerHeader.includes("mobile") ||
                    lowerHeader.includes("tel")
                ) {
                    suggestion = {
                        sourceColumn: header,
                        suggestedField: "phone_number",
                        confidence: 0.7,
                    };
                    usedFields.add("phone_number");
                    break;
                }
                if (lowerHeader.includes("email") || lowerHeader.includes("mail")) {
                    suggestion = {
                        sourceColumn: header,
                        suggestedField: "email",
                        confidence: 0.7,
                    };
                    usedFields.add("email");
                    break;
                }
                if (lowerHeader.includes("first") || lowerHeader.includes("name")) {
                    if (!usedFields.has("first_name")) {
                        suggestion = {
                            sourceColumn: header,
                            suggestedField: "first_name",
                            confidence: 0.5,
                        };
                        usedFields.add("first_name");
                        break;
                    }
                }
            }
        }

        suggestions.push(suggestion);
    }

    return suggestions;
}

/**
 * Check if "full name" or "name" column exists that needs splitting
 */
export function hasFullNameColumn(headers: string[]): string | null {
    for (const header of headers) {
        const normalized = header.trim().toLowerCase();
        if (
            normalized === "name" ||
            normalized === "full_name" ||
            normalized === "fullname" ||
            normalized === "contact_name" ||
            normalized === "nombre_completo"
        ) {
            return header;
        }
    }
    return null;
}
