"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Card, Col, Container, Row } from "react-bootstrap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faPhone } from "@fortawesome/free-solid-svg-icons";
import AppIcon from "@/shared/components/ui/AppIcon";
import { useAuth } from "@/core/auth/useAuth";
import { hasAppAccess } from "@/core/auth/access";
import psbLogo from "@/styles/psb_logo_notitle.png";

const DEFAULT_CARD_ICON = "table-cells-large";
const DEFAULT_GROUP_ICON = "layer-group";
const ORG_BANNER = {
  name: "",
  tagline: "Premium Steel Buildings Inc.",
  email: "Sales.pgd@premiumsteelgroup.com",
  phone: "817-502-2520",
};

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function resolveCardTarget(path) {
  const href = String(path || "").trim();

  if (!href) {
    return { href: "#", external: false };
  }

  if (href.startsWith("http://") || href.startsWith("https://")) {
    return { href, external: true };
  }

  return { href, external: false };
}

export default function DashboardModules({ modules }) {
  const { roles, loading } = useAuth();
  const router = useRouter();
  const hasMountedRef = useRef(false);

  // Re-fetch server data when the tab regains focus (e.g. after editing cards in admin).
  // Only refreshes if the tab was actually hidden long enough to be stale — not on quick tab switches.
  useEffect(() => {
    let hiddenAt = null;
    const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }

      if (document.visibilityState === "visible" && hasMountedRef.current) {
        if (hiddenAt == null) return;
        const hiddenDuration = Date.now() - hiddenAt;
        hiddenAt = null;
        if (hiddenDuration < STALE_THRESHOLD_MS) return;
        router.refresh();
      }
    }

    // Skip the first paint — only refresh on subsequent focus events.
    hasMountedRef.current = true;

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [router]);

  const safeModules = useMemo(() => (Array.isArray(modules) ? modules : []), [modules]);

  const visibleModules = useMemo(
    () =>
      safeModules.filter(
        (moduleDefinition) =>
          moduleDefinition?.key && moduleDefinition?.appId && hasAppAccess(roles, moduleDefinition.appId),
      ),
    [roles, safeModules],
  );

  const groupedModules = useMemo(() => {
    const groups = new Map();

    visibleModules.forEach((moduleDefinition) => {
      const groupName = String(moduleDefinition.groupName || "Applications").trim() || "Applications";
      const groupKey = groupName.toLowerCase();

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          group_id: groupKey,
          group_name: groupName,
          group_desc: String(moduleDefinition.groupDescription || "").trim(),
          group_icon: String(moduleDefinition.groupIcon || DEFAULT_GROUP_ICON).trim(),
          cards: [],
        });
      }

      groups.get(groupKey).cards.push({
        card_id: moduleDefinition.key,
        card_name: moduleDefinition.name,
        card_desc: moduleDefinition.description || "Open module.",
        route_path: moduleDefinition.path,
        icon: moduleDefinition.icon || DEFAULT_CARD_ICON,
      });
    });

    return Array.from(groups.values());
  }, [visibleModules]);

  const hasActiveRoleMappings = Array.isArray(roles) && roles.length > 0;

  if (loading) {
    return (
      <Container className="py-4" style={{ maxWidth: 1200 }}>
        <div className="my-apps-skeleton-stack">
          {[1, 2].map((sectionIndex) => (
            <div key={`skeleton-group-${sectionIndex}`} className="mb-4">
              <div className="my-apps-skeleton-line my-apps-skeleton-line-header" />
              <Row className="g-3">
                {[1, 2, 3].map((cardIndex) => (
                  <Col key={`skeleton-card-${sectionIndex}-${cardIndex}`} md={4}>
                    <div className="tile-card bg-white my-apps-skeleton-card">
                      <div className="my-apps-skeleton-line my-apps-skeleton-line-icon" />
                      <div className="my-apps-skeleton-line my-apps-skeleton-line-title" />
                      <div className="my-apps-skeleton-line my-apps-skeleton-line-copy" />
                      <div className="my-apps-skeleton-line my-apps-skeleton-line-copy short" />
                    </div>
                  </Col>
                ))}
              </Row>
            </div>
          ))}
        </div>
      </Container>
    );
  }

  if (visibleModules.length === 0) {
    return (
      <Container className="py-4" style={{ maxWidth: 1200 }}>
        <div className="notice-banner notice-banner-warning mb-0">
          {hasActiveRoleMappings ? (
            <>
              <strong className="d-block">No modules assigned.</strong>
              <span>Your access is active, but no modules are currently configured.</span>
            </>
          ) : (
            <>
              <strong className="d-block">No applications assigned yet.</strong>
              <span>Please contact your administrator to get access.</span>
            </>
          )}
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-4" style={{ maxWidth: 1200 }}>
      <div className="my-apps-portal-hero mb-4 rounded-3">
        <Row className="align-items-center g-3">
          <Col md={7}>
            <div className="my-apps-portal-title-row">
              <Image src={psbLogo} alt="PSBUniverse logo" className="my-apps-portal-logo" />
              <h1 className="my-apps-portal-title mb-0">PSBUniverse Portal</h1>
            </div>
            <p className="my-apps-portal-subtitle mb-1">All Applications Workspace</p>
            <p className="my-apps-portal-copy mb-0">
              Access and manage all your assigned applications in one place.
            </p>
          </Col>
          <Col md={5}>
            <Card className="my-apps-org-card">
              <Card.Body>
                <p className="my-apps-org-name mb-1">{ORG_BANNER.name}</p>
                <p className="my-apps-org-tagline mb-2">{ORG_BANNER.tagline}</p>
                <p className="my-apps-org-contact-row mb-1">
                  <FontAwesomeIcon icon={faEnvelope} aria-hidden="true" />
                  <span>{ORG_BANNER.email}</span>
                </p>
                <p className="my-apps-org-contact-row mb-0">
                  <FontAwesomeIcon icon={faPhone} aria-hidden="true" />
                  <span>{ORG_BANNER.phone}</span>
                </p>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </div>

      {groupedModules.map((group) => (
        <div key={`group-${group.group_id || group.group_name}`} className="mb-4">
          <div className="my-apps-group-heading">
            <AppIcon icon={group.group_icon || DEFAULT_GROUP_ICON} aria-hidden="true" />
            <div>
              <p className="text-uppercase fw-bold mb-0 tile-badge">{group.group_name}</p>
              {hasValue(group.group_desc) ? (
                <p className="text-muted mb-0 my-apps-group-desc">{group.group_desc}</p>
              ) : null}
            </div>
          </div>

          <Row className="g-3 mt-1">
            {group.cards.map((card) => {
              const target = resolveCardTarget(card.route_path);
              const href = target.href || "#";

              const cardContent = (
                <>
                  <div className="my-app-card-icon">
                    <AppIcon icon={card.icon || DEFAULT_CARD_ICON} aria-hidden="true" />
                  </div>
                  <h5 className="mt-2 mb-2">{card.card_name}</h5>
                  <p className="text-muted my-app-card-copy">{card.card_desc || "Open module."}</p>
                  <span className="tile-cta">Open Module</span>
                </>
              );

              return (
                <Col key={`card-${card.card_id || card.route_path}`} md={4}>
                  {href === "#" ? (
                    <div className="tile-card bg-white my-app-card">{cardContent}</div>
                  ) : target.external ? (
                    <a href={href} className="tile-card bg-white my-app-card" rel="noreferrer">
                      {cardContent}
                    </a>
                  ) : (
                    <Link href={href} className="tile-card bg-white my-app-card">
                      {cardContent}
                    </Link>
                  )}
                </Col>
              );
            })}
          </Row>
        </div>
      ))}
    </Container>
  );
}
