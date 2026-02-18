/**
 * Enhanced Template Components
 *
 * This module exports all components for building enhanced WhatsApp templates
 * with support for media headers, buttons, carousels, and more.
 */

// Editor components
export { ButtonEditor } from "./button-editor";
export { CarouselEditor } from "./carousel-editor";
export { EnhancedTemplateEditor } from "./enhanced-template-editor";
export { EnhancedTemplatePreview } from "./enhanced-template-preview";
export { HeaderEditor } from "./header-editor";

// Hooks
export {
  MEDIA_CONSTRAINTS,
  getAcceptString,
  getMediaConstraints,
  useMediaUpload,
} from "./use-media-upload";

// Re-export types from the types module for convenience
export type {
  AuthenticationConfig,
  ButtonType,
  CarouselCard,
  CopyCodeButton,
  FlowButton,
  HeaderFormat,
  LimitedTimeOffer,
  LocationHeader,
  MediaHeader,
  MpmButton,
  OtpButton,
  PhoneButton,
  QuickReplyButton,
  SpmButton,
  TemplateBody,
  TemplateButton,
  TemplateComponents,
  TemplateFooter,
  TemplateHeader,
  TextHeader,
  UrlButton,
} from "@/lib/types/template-components.types";

export {
  componentsFromLegacy,
  componentsToDto,
  componentsToLegacy,
  createEmptyComponents,
  dtoToComponents,
  hasAdvancedFeatures,
  isLocationHeader,
  isMediaHeader,
  isTextHeader,
} from "@/lib/types/template-components.types";
