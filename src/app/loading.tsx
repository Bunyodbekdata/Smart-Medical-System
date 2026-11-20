export default function RootLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAFC] px-4">
      <div className="flex flex-col items-center gap-4">
        <div className="h-11 w-11 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
        <p className="text-sm font-semibold text-slate-500">Yuklanmoqda...</p>
      </div>
    </div>
  );
}
