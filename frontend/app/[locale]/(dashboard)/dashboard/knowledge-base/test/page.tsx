/**
 * Knowledge Base Test Page
 *
 * Test interface for knowledge retrieval queries.
 */

"use client";

import { TestInterface } from "@/components/knowledge-base";
import { useAuthProtection } from "@/hooks/use-auth";

export default function TestPage() {
  useAuthProtection();

  return <TestInterface />;
}
