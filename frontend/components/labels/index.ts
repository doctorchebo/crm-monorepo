/**
 * Labels Components
 * Exports all label-related components for easy importing
 */

// Color utilities
export {
  LABEL_COLORS,
  MAX_LABELS,
  getContrastTextColor,
  getNextAvailableColor,
  getRandomLabelColor,
  isLightColor,
  type LabelColor,
} from "./label-colors";

// Badge components
export { LabelBadge, LabelBadgeList } from "./label-badge";

// Color picker
export { LabelColorDot, LabelColorPicker } from "./label-color-picker";

// Modals
export {
  LabelFormModal,
  type LabelFormData,
  type LabelFormMode,
} from "./label-form-modal";
export { LabelSelectorModal } from "./label-selector-modal";

// Management panel
export {
  LabelsManagementPanel,
  type LabelChatItem,
} from "./labels-management-panel";

// Filter components
export { LabelFilterChips } from "./label-filter-chips";

// Selection mode components
export {
  ChatSelectionBanner,
  SelectionCheckbox,
} from "./chat-selection-banner";
