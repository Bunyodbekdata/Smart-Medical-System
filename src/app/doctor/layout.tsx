import { PortalShell, type NavItem } from "@/components/shared/PortalShell";
import { requirePageRole } from "@/lib/auth/guards";
import { getClinicBranding } from "@/lib/data/public-clinic";

export const dynamic = "force-dynamic";

const DOCTOR_NAV_ITEMS: NavItem[] = [
  { href: "/doctor", label: "Asosiy sahifa", icon: "home" },
  { href: "/doctor/patients", label: "Mening bemorlarim", icon: "patients" },
  { href: "/doctor/earnings", label: "Daromad", icon: "earnings" },
  { href: "/doctor/reports", label: "Hisobotlar", icon: "reports" },
  { href: "/doctor/settings", label: "Sozlamalar", icon: "settings" },
];

export default async function DoctorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requirePageRole(["doctor"]);
  const branding = await getClinicBranding(session.profile.clinic_id);

  return (
    <PortalShell
      clinicName={branding.clinicName}
      clinicLogoUrl={branding.logoUrl}
      portalSubtitle="Shifokor paneli"
      userName={session.doctor?.full_name || session.profile.full_name}
      userRole={session.profile.role}
      userSubtext={session.doctor?.specialization || "Shifokor"}
      navItems={DOCTOR_NAV_ITEMS}
    >
      {children}
    </PortalShell>
  );
}
