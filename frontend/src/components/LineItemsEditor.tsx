import { inputBaseClass } from "../lib/inputStyles";
import type { FieldErrors, LineItem } from "../types/contract";

function emptyItem(): LineItem {
  return { description: "", quantity: 1, unit_price: 0 };
}

const cellInputClass = `w-full ${inputBaseClass} px-2 py-1 disabled:border-transparent disabled:bg-transparent dark:disabled:bg-transparent`;

export function LineItemsEditor({
  items,
  editing,
  fieldErrors,
  onChange,
}: {
  items: LineItem[];
  editing: boolean;
  fieldErrors: FieldErrors | null;
  onChange: (items: LineItem[]) => void;
}) {
  const updateItem = (index: number, patch: Partial<LineItem>) => {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const addItem = () => {
    onChange([...items, emptyItem()]);
  };

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Items</p>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="grid grid-cols-12 gap-2 rounded-md bg-gray-50 p-2 dark:bg-gray-800/60">
            <div className="col-span-5">
              <input
                disabled={!editing}
                value={item.description}
                onChange={(e) => updateItem(index, { description: e.target.value })}
                placeholder="Description"
                className={cellInputClass}
              />
              {fieldErrors?.[`items[${index}].description`] && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {fieldErrors[`items[${index}].description`]}
                </p>
              )}
            </div>
            <div className="col-span-2">
              <input
                disabled={!editing}
                type="number"
                value={item.quantity}
                onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                placeholder="Qty"
                className={cellInputClass}
              />
              {fieldErrors?.[`items[${index}].quantity`] && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {fieldErrors[`items[${index}].quantity`]}
                </p>
              )}
            </div>
            <div className="col-span-2">
              <input
                disabled={!editing}
                value={item.quantity_unit ?? ""}
                onChange={(e) => updateItem(index, { quantity_unit: e.target.value })}
                placeholder="Unit"
                className={cellInputClass}
              />
            </div>
            <div className="col-span-2">
              <input
                disabled={!editing}
                type="number"
                value={item.unit_price}
                onChange={(e) => updateItem(index, { unit_price: Number(e.target.value) })}
                placeholder="Unit price"
                className={cellInputClass}
              />
              {fieldErrors?.[`items[${index}].unit_price`] && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {fieldErrors[`items[${index}].unit_price`]}
                </p>
              )}
            </div>
            <div className="col-span-1 flex items-start justify-end">
              {editing && (
                <button
                  onClick={() => removeItem(index)}
                  className="text-xs text-red-600 transition-colors hover:text-red-700 dark:text-red-400"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <button
          onClick={addItem}
          className="mt-2 text-xs font-medium text-indigo-500 transition-colors hover:text-indigo-600 dark:text-indigo-400"
        >
          + Add item
        </button>
      )}
    </div>
  );
}
