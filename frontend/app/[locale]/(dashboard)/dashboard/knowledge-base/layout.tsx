/**
 * Knowledge Base Layout
 *
 * Provides consistent padding and container styling
 * for all knowledge base pages. Parent layout handles scrolling.
 */

export default function KnowledgeBaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-16">
        {children}
      </div>
    </div>
  );
}
