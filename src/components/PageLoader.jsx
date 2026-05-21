/** Shared route-level loading UI (code-split pages). */
export default function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[12rem] py-12 text-gray-600">
      <div
        className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-red-600 animate-spin mb-3"
        aria-hidden
      />
      <p className="text-sm">Loading module…</p>
    </div>
  );
}
