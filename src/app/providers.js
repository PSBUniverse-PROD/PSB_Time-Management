"use client";

import { config } from "@fortawesome/fontawesome-svg-core";
import AuthProvider from "@/core/auth/AuthProvider";
import AppLayout from "@/shared/components/layout/AppLayout";
import { GlobalToastHost } from "@/shared/components/ui";
import ClientBodyCleanup from "@/app/client-body-cleanup";

config.autoAddCss = false;

export default function Providers({ children }) {
  return (
    <AuthProvider>
      <GlobalToastHost />
      <ClientBodyCleanup />
      <AppLayout>{children}</AppLayout>
    </AuthProvider>
  );
}
