/**
 * Public Booking Layout
 *
 * Minimal layout for public booking pages.
 * No authentication required, no header navigation.
 */
import { Toaster } from "sonner";

export default function BookingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {children}
      <Toaster position="top-center" richColors />
    </div>
  );
}
