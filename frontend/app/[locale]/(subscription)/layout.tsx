"use client";

/**
 * Subscription Layout - Full-screen layout without sidebar
 * Used for the subscription/pricing page when accessed from within the app.
 */
export default function SubscriptionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
