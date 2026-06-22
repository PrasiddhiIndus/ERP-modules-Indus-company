/** Shared route-level loading UI (code-split pages). */
export default function PageLoader({ fullScreen = false, label = "Loading module…" }) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-gray-600 ${
        fullScreen ? "min-h-screen bg-gray-50" : "min-h-[12rem] py-12"
      }`}
      role="status"
      aria-live="polite"
    >
      <div
        className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-red-600 animate-spin mb-3"
        aria-hidden
      />
      <p className="text-sm">{label}</p>
    </div>
  );
}
