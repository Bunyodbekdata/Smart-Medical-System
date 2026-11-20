import { PublicClinicWebsite } from "@/components/public/PublicClinicWebsite";
import { getPublicClinicBundle } from "@/lib/data/public-clinic";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const bundle = await getPublicClinicBundle();
  return <PublicClinicWebsite bundle={bundle} />;
}
