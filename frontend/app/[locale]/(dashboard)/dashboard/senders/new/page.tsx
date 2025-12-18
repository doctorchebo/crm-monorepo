"use client";

import { useParams } from "next/navigation";
import SenderFormPage from "../[id]/edit/page";

export default function NewSenderPage() {
  const params = useParams();

  return (
    <SenderFormPage
      params={Promise.resolve({
        locale: params.locale as string,
      })}
    />
  );
}
