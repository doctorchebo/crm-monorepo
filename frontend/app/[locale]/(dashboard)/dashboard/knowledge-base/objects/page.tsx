/**
 * Knowledge Base Objects List Page
 *
 * Lists all knowledge objects with filtering and bulk actions.
 */

"use client";

import { ObjectList } from "@/components/knowledge-base";
import { useAuthProtection } from "@/hooks/use-auth";

export default function ObjectsPage() {
  useAuthProtection();

  return <ObjectList />;
}
