import { PortalShell, type NavItem } from "@/components/shared/PortalShell";
import { requirePageRole } from "@/lib/auth/guards";
import { getClinicBranding } from "@/lib/data/public-clinic";

export const dynamic = "force-dynamic";

const SUPER_ADMIN_NAV_ITEMS: NavItem[] = [
  { href: "/super-admin", label: "Asosiy sahifa", icon: "home" },
  { href: "/super-admin/doctors", label: "Shifokorlar", icon: "doctors" },
  { href: "/super-admin/employees", label: "Xodimlar", icon: "employees" },
  { href: "/super-admin/services", label: "Xizmatlar", icon: "services" },
  { href: "/super-admin/patients", label: "Bemorlar", icon: "patients" },
  { href: "/super-admin/finance", label: "Moliyaviy hisobot", icon: "finance" },
  { href: "/super-admin/promotions", label: "Chegirmalar", icon: "promotions" },
  { href: "/super-admin/audit-logs", label: "Audit jurnali", icon: "audit" },
  { href: "/super-admin/settings", label: "Sozlamalar", icon: "settings" },
];

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requirePageRole(["super_admin"]);
  const branding = await getClinicBranding(session.profile.clinic_id);

  return (
    <PortalShell
      clinicName={branding.clinicName}
      clinicLogoUrl={branding.logoUrl}
      portalSubtitle="Super admin panel"
      userName={session.profile.full_name}
      userRole={session.profile.role}
      userSubtext="Klinika rahbari"
      navItems={SUPER_ADMIN_NAV_ITEMS}
    >
      {children}
    </PortalShell>
  );
}
