import { useOrg } from "../context/OrgContext";
import { inputBaseClass } from "../lib/inputStyles";

export function OrgSelector() {
  const { organisations, isLoading, selectedOrgId, setSelectedOrgId } = useOrg();

  if (isLoading) {
    return <span className="skeleton inline-block h-8 w-40 rounded-md align-middle" />;
  }

  return (
    <select
      className={`${inputBaseClass} px-3 py-1.5 hover:border-gray-400 dark:hover:border-gray-600`}
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
