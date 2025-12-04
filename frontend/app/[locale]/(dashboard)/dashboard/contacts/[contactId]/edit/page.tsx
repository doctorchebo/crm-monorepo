"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function EditContactRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const contactId = params.contactId as string;

  useEffect(() => {
    router.replace(`/${locale}/dashboard/contacts/form?id=${contactId}`);
  }, [router, locale, contactId]);

  return null;
}
