import { useOrg } from "../context/OrgContext";

export function OrgSelector() {
  const { organisations, isLoading, selectedOrgId, setSelectedOrgId } = useOrg();

  if (isLoading) {
    return <span className="skeleton inline-block h-8 w-40 rounded-md align-middle" />;
  }

  return (
    <select
      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm transition-colors hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:border-gray-600"
      value={selectedOrgId ?? ""}
      onChange={(e) => setSelectedOrgId(e.target.value)}
      aria-label="Selected organisation"
    >
      {organisations.map((org) => (
        <option key={org.id} value={org.id}>
          {org.name}
        </option>
      ))}
    </select>
  );
}
