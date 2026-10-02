import { notFound, redirect } from "next/navigation";
import { loadModules } from "@/modules/loadModules";
import { isLoginPath } from "@/core/auth/redirect-validator";

export default async function HomePage() {
  const moduleKey = (process.env.NEXT_PUBLIC_MODULE_KEY || "").trim();
  if (moduleKey && moduleKey !== "psbuniverse") {
    const modules = await loadModules({ resolveAccess: false });
    const moduleDefinition = modules.find((entry) => entry.module_key === moduleKey);
    const homeRoute = moduleDefinition?.routes?.find((route) =>
      typeof route.path === "string" && route.path.startsWith("/") &&
      !route.path.startsWith("//") && route.path !== "/" && !isLoginPath(route.path),
    );
    if (!homeRoute) notFound();
    redirect(homeRoute.path);
  }
  redirect("/dashboard");
}
