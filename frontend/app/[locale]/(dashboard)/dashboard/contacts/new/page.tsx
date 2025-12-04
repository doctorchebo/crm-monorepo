"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function NewContactRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;

  useEffect(() => {
    router.replace(`/${locale}/dashboard/contacts/form`);
  }, [router, locale]);

  return null;
}
