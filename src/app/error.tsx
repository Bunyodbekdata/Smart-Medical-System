"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4">
      <div className="w-full max-w-md rounded-3xl border border-rose-200/80 bg-white p-8 text-center shadow-lg">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-xl font-extrabold text-slate-900">
          Kutilmagan texnik xatolik yuz berdi
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Sahifani qayta yuklab ko&apos;ring. Muammo takrorlansa, tizim administratoriga murojaat
          qiling.
        </p>
        {error.digest ? (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-1.5 font-mono text-[11px] text-slate-400">
            Kod: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          <Button onClick={reset}>
            <RefreshCw className="h-4 w-4" />
            Qayta urinish
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">
              <Home className="h-4 w-4" />
              Bosh sahifa
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
