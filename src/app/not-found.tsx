import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#EEF4FF] via-[#F8FAFC] to-[#EEF2FF] px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200/80 bg-white p-8 text-center shadow-lg">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <SearchX className="h-7 w-7" />
        </div>
        <p className="mt-4 text-xs font-extrabold uppercase tracking-widest text-blue-600">
          404 • Sahifa topilmadi
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900">
          Siz qidirayotgan sahifa mavjud emas
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Havola noto&apos;g&apos;ri kiritilgan yoki sahifa boshqa manzilga ko&apos;chirilgan
          bo&apos;lishi mumkin.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          <Button asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Bosh sahifaga qaytish
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/staff/login">Xodimlar portali</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
