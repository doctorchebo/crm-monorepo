/**
 * Edit Knowledge Object Page
 *
 * Edit an existing knowledge object.
 */

"use client";

import { ObjectEditor } from "@/components/knowledge-base";
import { useAuthProtection } from "@/hooks/use-auth";
import { use } from "react";

interface EditObjectPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function EditObjectPage({ params }: EditObjectPageProps) {
  useAuthProtection();
  const { id } = use(params);

  return <ObjectEditor objectId={id} />;
}
