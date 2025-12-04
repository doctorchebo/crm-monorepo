"use client";

import { useParams } from "next/navigation";
import SenderFormPage from "../[id]/edit/page";

export default function NewSenderPage() {
  const params = useParams();

  return (
    <SenderFormPage
      params={{
        locale: params.locale as string,
      }}
    />
  );
}
