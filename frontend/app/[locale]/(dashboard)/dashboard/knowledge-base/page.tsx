/**
 * Knowledge Base Dashboard Page
 *
 * Main entry point for the knowledge base management system.
 */

"use client";

import { KnowledgeBaseDashboard } from "@/components/knowledge-base";
import { useAuthProtection } from "@/hooks/use-auth";

export default function KnowledgeBasePage() {
  // Protect this route
  useAuthProtection();

  return <KnowledgeBaseDashboard />;
}
