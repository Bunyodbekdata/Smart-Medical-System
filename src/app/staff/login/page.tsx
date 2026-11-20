import { redirect } from "next/navigation";
import { StaffLoginForm } from "@/components/auth/StaffLoginForm";
import { getCurrentStaffSession } from "@/lib/auth/guards";
import { getClinicBranding } from "@/lib/data/public-clinic";
import { getSafeRedirectPath } from "@/lib/formatters";
import { isSupabaseConfigured, isSupabaseServiceConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const configured = isSupabaseConfigured() && isSupabaseServiceConfigured();

  if (configured) {
    const session = await getCurrentStaffSession();
    if (session) {
      redirect(getSafeRedirectPath(params.next, session.profile.role));
    }
  }

  const branding = await getClinicBranding();

  return (
    <StaffLoginForm
      clinicName={branding.clinicName}
      clinicLogoUrl={branding.logoUrl}
      configured={configured}
      nextPath={params.next ?? null}
      initialErrorCode={params.error ?? null}
    />
  );
}
