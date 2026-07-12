/** Shared base classes for text inputs/selects, so the same light/dark palette doesn't
 * get hand-copied (and risk drifting) across every form control in the app. Compose with
 * extra classes via template strings where a control needs something more specific. */
export const inputBaseClass =
  "rounded-md border border-gray-300 bg-white text-sm transition-colors dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";
