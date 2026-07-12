export function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="skeleton h-7 w-48 rounded-md" />
        <div className="skeleton h-5 w-20 rounded-full" />
      </div>
      <div className="mb-6 flex gap-2">
        <div className="skeleton h-8 w-16 rounded-md" />
        <div className="skeleton h-8 w-20 rounded-md" />
      </div>
      <div className="mb-8 space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="skeleton h-3 w-24 rounded" />
            <div className="skeleton h-4 w-full max-w-sm rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="space-y-0">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-t border-gray-100 px-4 py-3 first:border-t-0 dark:border-gray-800">
            <div className="skeleton h-4 w-32 rounded" />
            <div className="skeleton h-4 w-20 rounded" />
            <div className="skeleton h-4 w-24 rounded" />
            <div className="skeleton ml-auto h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
