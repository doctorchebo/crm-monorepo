/**
 * Knowledge Base Templates Page
 *
 * Lists all available object templates.
 */

"use client";

import { TemplateList } from "@/components/knowledge-base";
import { useAuthProtection } from "@/hooks/use-auth";

export default function TemplatesPage() {
  useAuthProtection();

  return <TemplateList />;
}
