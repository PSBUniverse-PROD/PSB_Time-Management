"use client";

import { usePathname } from "next/navigation";
import { config } from "@fortawesome/fontawesome-svg-core";
import AuthProvider from "@/core/auth/AuthProvider";
import AppLayout from "@/shared/components/layout/AppLayout";
import { GlobalToastHost } from "@/shared/components/ui";
import ClientBodyCleanup from "@/app/client-body-cleanup";

config.autoAddCss = false;

// Dealer pages have their own sign-in and layout, so they are not wrapped in
// the internal AuthProvider / AppLayout (which would redirect them to /login).
function isDealerPath(pathname) {
  const path = String(pathname || "");
  return path === "/dealer" || path.startsWith("/dealer/");
}

export default function Providers({ children }) {
  const pathname = usePathname();

  if (isDealerPath(pathname)) {
    return (
      <>
        <GlobalToastHost />
        <ClientBodyCleanup />
        {children}
      </>
    );
  }

  return (
    <AuthProvider>
      <GlobalToastHost />
      <ClientBodyCleanup />
      <AppLayout>{children}</AppLayout>
    </AuthProvider>
  );
}
