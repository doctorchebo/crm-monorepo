/**
 * New Knowledge Object Page
 *
 * Create a new knowledge object from a template.
 */

"use client";

import { ObjectEditor } from "@/components/knowledge-base";
import { useAuthProtection } from "@/hooks/use-auth";
import { useSearchParams } from "next/navigation";

export default function NewObjectPage() {
  useAuthProtection();
  const searchParams = useSearchParams();
  const templateId = searchParams.get("templateId") || undefined;

  return <ObjectEditor templateId={templateId} />;
}
