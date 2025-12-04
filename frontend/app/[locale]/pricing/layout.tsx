import { Header } from "@/components/header";
import { Suspense } from "react";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col min-h-screen">
      <Suspense
        fallback={
          <div className="border-b border-gray-200 dark:border-gray-800 h-16" />
        }
      >
        <Header />
      </Suspense>
      {children}
    </section>
  );
}
