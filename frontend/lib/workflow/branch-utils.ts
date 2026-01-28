/**
 * Workflow Branch Utilities
 *
 * Centralized utilities for managing workflow node branches (outputs).
 * This module provides:
 * - Consistent color generation for branch handles and edges
 * - Type definitions for branch configurations
 * - Helper functions to extract branches from different node types
 *
 * Branch Terminology:
 * - Branch: An output handle from a node that can connect to another node
 * - Handle: The visual connector point on a node (React Flow concept)
 * - Edge: The connection line between nodes (React Flow concept)
 */

// ============================================================================
// Types
// ============================================================================

export interface BranchOutput {
  /** Unique identifier for this branch (used as handle ID) */
  id: string;
  /** Human-readable label for the branch */
  label: string;
  /** Color for the branch handle and connected edge */
  color: string;
  /** Optional description for UI tooltips */
  description?: string;
}

export interface BranchConfig {
  branches: BranchOutput[];
  /** Whether the node has a fallback/default branch */
  hasFallback?: boolean;
  /** ID of the fallback branch if it exists */
  fallbackId?: string;
}

// ============================================================================
// Color Palette
// ============================================================================

/**
 * Predefined colors for common branch types.
 * Using a consistent palette ensures visual coherence across the workflow.
 */
export const BRANCH_COLORS = {
  // Semantic colors for common branch types
  success: "#22c55e", // green-500
  failure: "#ef4444", // red-500
  true: "#22c55e", // green-500
  false: "#ef4444", // red-500
  yes: "#22c55e", // green-500
  no: "#ef4444", // red-500
  timeout: "#f59e0b", // amber-500
  error: "#dc2626", // red-600
  default: "#64748b", // slate-500
  fallback: "#64748b", // slate-500
  other: "#64748b", // slate-500

  // Dynamic branch colors (for AI classification categories, etc.)
  // Using a harmonious palette that works well together
  dynamic: [
    "#3b82f6", // blue-500
    "#8b5cf6", // violet-500
    "#ec4899", // pink-500
    "#14b8a6", // teal-500
    "#f97316", // orange-500
    "#06b6d4", // cyan-500
    "#84cc16", // lime-500
    "#a855f7", // purple-500
    "#f43f5e", // rose-500
    "#0ea5e9", // sky-500
    "#eab308", // yellow-500
    "#22d3ee", // cyan-400
  ] as const,
} as const;

// ============================================================================
// Color Generation
// ============================================================================

/**
 * Get color for a branch based on its ID/type.
 * Uses semantic colors for known types, dynamic colors for custom branches.
 *
 * @param branchId - The branch identifier
 * @param index - Optional index for dynamic color assignment
 * @returns Hex color string
 */
export function getBranchColor(branchId: string, index?: number): string {
  // Check semantic colors first
  const normalizedId = branchId.toLowerCase();

  // Direct semantic matches
  if (normalizedId in BRANCH_COLORS) {
    return BRANCH_COLORS[normalizedId as keyof typeof BRANCH_COLORS] as string;
  }

  // Pattern matching for common variations
  if (
    normalizedId === "condition_true" ||
    normalizedId === "success" ||
    normalizedId === "yes"
  ) {
    return BRANCH_COLORS.success;
  }
  if (
    normalizedId === "condition_false" ||
    normalizedId === "failure" ||
    normalizedId === "no"
  ) {
    return BRANCH_COLORS.failure;
  }

  // For dynamic branches, use index if provided, otherwise hash the ID
  if (typeof index === "number") {
    return BRANCH_COLORS.dynamic[index % BRANCH_COLORS.dynamic.length];
  }

  // Hash the branch ID to get a consistent color
  return getColorFromString(branchId);
}

/**
 * Generate a consistent color from a string using simple hashing.
 * Ensures the same string always produces the same color.
 */
export function getColorFromString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  const index = Math.abs(hash) % BRANCH_COLORS.dynamic.length;
  return BRANCH_COLORS.dynamic[index];
}

/**
 * Get edge color for a connection based on type or source handle.
 * This is used by the workflow canvas to color connection lines.
 *
 * @param type - Connection type or source handle ID
 * @param sourceHandleId - Optional explicit source handle ID
 * @returns Hex color string
 */
export function getEdgeColor(
  type: string | null | undefined,
  sourceHandleId?: string | null,
): string {
  // Use source handle ID if provided and different from "output"
  const identifier =
    sourceHandleId && sourceHandleId !== "output" ? sourceHandleId : type;

  if (!identifier) {
    return BRANCH_COLORS.default;
  }

  return getBranchColor(identifier);
}

// ============================================================================
// Branch Extraction Helpers
// ============================================================================

/**
 * Extract branches from a condition node configuration.
 * Handles different condition types (ai_classification, simple boolean, etc.)
 */
export function getConditionBranches(
  config: Record<string, unknown> | undefined,
): BranchConfig {
  if (!config) {
    // Default boolean branches for conditions without config
    return {
      branches: [
        { id: "true", label: "Yes", color: BRANCH_COLORS.true },
        { id: "false", label: "No", color: BRANCH_COLORS.false },
      ],
      hasFallback: false,
    };
  }

  const conditionType = config.conditionType as string;

  // AI Classification: Dynamic branches based on categories
  if (conditionType === "ai_classification") {
    const aiConfig = config.aiClassification as
      | {
          categories?: Array<{ name: string; description?: string }>;
          fallbackCategory?: string;
        }
      | undefined;

    if (aiConfig?.categories && aiConfig.categories.length > 0) {
      const branches: BranchOutput[] = aiConfig.categories.map((cat, idx) => ({
        id: cat.name,
        label: cat.name,
        color: getBranchColor(cat.name, idx),
        description: cat.description,
      }));

      // Determine fallback ID
      const fallbackId = aiConfig.fallbackCategory || "other";

      // Only add fallback if it doesn't already exist as a category
      const categoryNames = aiConfig.categories.map((c) =>
        c.name.toLowerCase(),
      );
      const fallbackExists = categoryNames.includes(fallbackId.toLowerCase());

      if (!fallbackExists) {
        branches.push({
          id: fallbackId,
          label: fallbackId.charAt(0).toUpperCase() + fallbackId.slice(1),
          color: BRANCH_COLORS.fallback,
          description: "Fallback when no category matches",
        });
      }

      return {
        branches,
        hasFallback: !fallbackExists,
        fallbackId: fallbackExists ? undefined : fallbackId,
      };
    }
  }

  // Time-based conditions: business hours branches
  if (conditionType === "time_based") {
    return {
      branches: [
        { id: "in_range", label: "In Range", color: BRANCH_COLORS.success },
        {
          id: "out_of_range",
          label: "Out of Range",
          color: BRANCH_COLORS.failure,
        },
      ],
      hasFallback: false,
    };
  }

  // Default boolean branches for all other condition types
  return {
    branches: [
      { id: "true", label: "Yes", color: BRANCH_COLORS.true },
      { id: "false", label: "No", color: BRANCH_COLORS.false },
    ],
    hasFallback: false,
  };
}

/**
 * Extract branches from a branch node configuration.
 */
export function getBranchNodeBranches(
  config: Record<string, unknown> | undefined,
): BranchConfig {
  if (!config) {
    return {
      branches: [
        { id: "output", label: "Default", color: BRANCH_COLORS.default },
      ],
      hasFallback: false,
    };
  }

  const branchesConfig = config.branches as
    | Array<{
        name: string;
        condition?: Record<string, unknown>;
      }>
    | undefined;

  if (!branchesConfig || branchesConfig.length === 0) {
    return {
      branches: [
        { id: "output", label: "Default", color: BRANCH_COLORS.default },
      ],
      hasFallback: false,
    };
  }

  const branches: BranchOutput[] = branchesConfig.map((branch, idx) => ({
    id: branch.name || `branch_${idx}`,
    label: branch.name || `Branch ${idx + 1}`,
    color: getBranchColor(branch.name, idx),
  }));

  // Add default branch if configured
  const defaultBranch = config.defaultBranch as string | undefined;
  if (defaultBranch) {
    branches.push({
      id: "default",
      label: defaultBranch,
      color: BRANCH_COLORS.default,
    });
  }

  return {
    branches,
    hasFallback: Boolean(defaultBranch),
    fallbackId: defaultBranch ? "default" : undefined,
  };
}

/**
 * Extract branches from any node type based on its configuration.
 * This is the main entry point for getting branches from a node.
 */
export function getNodeBranches(
  nodeType: string,
  config: Record<string, unknown> | undefined,
): BranchConfig {
  switch (nodeType) {
    case "condition":
      return getConditionBranches(config);
    case "branch":
      return getBranchNodeBranches(config);
    case "trigger":
    case "action":
    case "delay":
    case "sub_workflow":
      // Single output nodes
      return {
        branches: [
          { id: "output", label: "Output", color: BRANCH_COLORS.default },
        ],
        hasFallback: false,
      };
    case "end":
      // No outputs for end nodes
      return { branches: [], hasFallback: false };
    default:
      return {
        branches: [
          { id: "output", label: "Output", color: BRANCH_COLORS.default },
        ],
        hasFallback: false,
      };
  }
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate that a branch ID is unique within a set of branches.
 */
export function isBranchIdUnique(
  id: string,
  existingBranches: BranchOutput[],
  excludeIndex?: number,
): boolean {
  return !existingBranches.some(
    (branch, idx) => branch.id === id && idx !== excludeIndex,
  );
}

/**
 * Generate a unique branch ID from a name.
 * Converts to lowercase, replaces spaces with underscores.
 */
export function generateBranchId(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Create a new branch with default values.
 */
export function createDefaultBranch(
  index: number,
  existingBranches: BranchOutput[] = [],
): BranchOutput {
  let baseName = `Category ${index + 1}`;
  let id = generateBranchId(baseName);

  // Ensure unique ID
  let counter = 1;
  while (!isBranchIdUnique(id, existingBranches)) {
    counter++;
    baseName = `Category ${index + counter}`;
    id = generateBranchId(baseName);
  }

  return {
    id,
    label: baseName,
    color: getBranchColor(id, existingBranches.length),
  };
}
