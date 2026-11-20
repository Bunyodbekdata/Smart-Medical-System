import { PortalShell, type NavItem } from "@/components/shared/PortalShell";
import { requirePageRole } from "@/lib/auth/guards";
import { getClinicBranding } from "@/lib/data/public-clinic";

export const dynamic = "force-dynamic";

const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Asosiy sahifa", icon: "home" },
  { href: "/admin/patients", label: "Bemorlar", icon: "patients" },
  { href: "/admin/queue", label: "Navbat", icon: "queue" },
  { href: "/admin/payments", label: "To'lovlar", icon: "payments" },
  { href: "/admin/reports", label: "Hisobotlar", icon: "reports" },
  { href: "/admin/services", label: "Xizmatlar", icon: "services" },
  { href: "/admin/promotions", label: "Chegirmalar", icon: "promotions" },
  { href: "/admin/settings", label: "Sozlamalar", icon: "settings" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requirePageRole(["admin", "super_admin"]);
  const branding = await getClinicBranding(session.profile.clinic_id);

  return (
    <PortalShell
      clinicName={branding.clinicName}
      clinicLogoUrl={branding.logoUrl}
      portalSubtitle="Admin panel"
      userName={session.profile.full_name}
      userRole={session.profile.role}
      userSubtext="Administrator / Kassir"
      navItems={ADMIN_NAV_ITEMS}
    >
      {children}
    </PortalShell>
  );
}
