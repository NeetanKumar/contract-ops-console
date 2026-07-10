import { useOrg } from "../context/OrgContext";

export function OrgSelector() {
  const { organisations, isLoading, selectedOrgId, setSelectedOrgId } = useOrg();

  if (isLoading) {
    return <span className="text-sm text-gray-500">Loading organisations…</span>;
  }

  return (
    <select
      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm"
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
