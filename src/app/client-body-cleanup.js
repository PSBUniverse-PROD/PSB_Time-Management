"use client";

import { useEffect } from "react";

export default function ClientBodyCleanup() {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const body = document.body;
    if (!body) {
      return;
    }

    if (body.hasAttribute("cz-shortcut-listen")) {
      body.removeAttribute("cz-shortcut-listen");
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.target === document.body) {
          if (document.body.hasAttribute("cz-shortcut-listen")) {
            document.body.removeAttribute("cz-shortcut-listen");
          }
        }
      }
    });

    observer.observe(body, { attributes: true, attributeFilter: ["cz-shortcut-listen"] });

    return () => {
      observer.disconnect();
    };
  }, []);

  return null;
}
