/**
 * Label Color Constants
 * Predefined colors for labels with good contrast and accessibility
 */

/**
 * Maximum number of labels allowed per account
 * This matches WhatsApp's label limit
 */
export const MAX_LABELS = 20;

export const LABEL_COLORS = [
  // Row 1 - Reds and Oranges
  "#ef4444", // red-500
  "#f97316", // orange-500
  "#fb923c", // orange-400
  "#fbbf24", // amber-400
  "#facc15", // yellow-400
  // Row 2 - Greens
  "#84cc16", // lime-500
  "#22c55e", // green-500
  "#10b981", // emerald-500
  "#14b8a6", // teal-500
  "#06b6d4", // cyan-500
  // Row 3 - Blues
  "#0ea5e9", // sky-500
  "#3b82f6", // blue-500
  "#6366f1", // indigo-500
  "#8b5cf6", // violet-500
  "#a855f7", // purple-500
  // Row 4 - Pinks and Neutrals
  "#d946ef", // fuchsia-500
  "#ec4899", // pink-500
  "#f43f5e", // rose-500
  "#78716c", // stone-500
  "#64748b", // slate-500
] as const;

export type LabelColor = (typeof LABEL_COLORS)[number];

/**
 * Get a random color from the palette
 */
export function getRandomLabelColor(): LabelColor {
  return LABEL_COLORS[Math.floor(Math.random() * LABEL_COLORS.length)];
}

/**
 * Get the next color in sequence (for new labels)
 * Takes existing label colors and returns a color not yet used
 */
export function getNextAvailableColor(usedColors: string[]): LabelColor {
  const availableColors = LABEL_COLORS.filter((c) => !usedColors.includes(c));
  if (availableColors.length > 0) {
    return availableColors[0];
  }
  return getRandomLabelColor();
}

/**
 * Check if a color is light (for determining text contrast)
 */
export function isLightColor(hexColor: string): boolean {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

/**
 * Get contrasting text color for a background
 */
export function getContrastTextColor(hexColor: string): string {
  return isLightColor(hexColor) ? "#000000" : "#ffffff";
}
