"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { resolveIcon } from "@/shared/utils/icons";

/**
 * Renders a Font Awesome icon from a string icon name.
 * Accepts Font Awesome icon names (e.g. "pen", "trash", "gear").
 *
 * Returns `null` when the icon name is empty or unrecognised.
 *
 * @param {{ icon: string, className?: string, [key: string]: any }} props
 */
export default function AppIcon({ icon, className, ...rest }) {
  const resolved = resolveIcon(icon);
  if (!resolved) return null;
  return <FontAwesomeIcon icon={resolved} className={className} aria-hidden="true" {...rest} />;
}
