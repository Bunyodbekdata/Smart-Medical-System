import React from "react";

export function TableSkeleton({ rows = 5, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-3 p-5" aria-busy="true" aria-label="Yuklanmoqda">
      <div className="flex items-center gap-3 pb-2">
        {Array.from({ length: columns }).map((_, idx) => (
          <div
            key={`head-${idx}`}
            className="h-3.5 flex-1 animate-pulse rounded-md bg-slate-200/80"
          />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={`row-${rowIdx}`}
          className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/40 px-3 py-3.5"
        >
          {Array.from({ length: columns }).map((__, colIdx) => (
            <div
              key={`cell-${rowIdx}-${colIdx}`}
              className="h-4 flex-1 animate-pulse rounded-md bg-slate-200/70"
              style={{ animationDelay: `${(rowIdx * 60 + colIdx * 30) % 400}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
