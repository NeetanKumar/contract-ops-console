import { z } from "zod";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const poDateSchema = z
  .string({ error: "po_date is required" })
  .regex(isoDatePattern, "po_date must be in YYYY-MM-DD format")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, "po_date must be a real calendar date");

const lineItemSchema = z.object({
  description: z.string({ error: "description is required" }).min(1, "description is required"),
  quantity: z
    .number({ error: "quantity is required" })
    .gt(0, "quantity must be greater than 0"),
  quantity_unit: z.string().optional(),
  unit_price: z
    .number({ error: "unit_price is required" })
    .gte(0, "unit_price must be >= 0"),
  pricing_unit: z.string().optional(),
  total: z.number().optional(),
});

export const contractSchema = z.object({
  client_name: z.string({ error: "client_name is required" }).min(1, "client_name is required"),
  po_ref_no: z.string({ error: "po_ref_no is required" }).min(1, "po_ref_no is required"),
  po_date: poDateSchema,
  payment_terms: z.string().optional(),
  delivery_terms: z.string().optional(),
  items: z
    .array(lineItemSchema, { error: "items is required" })
    .min(1, "at least one item is required"),
});

export type ContractInput = z.infer<typeof contractSchema>;

export type FieldErrors = Record<string, string>;

/** Formats Zod issues into a flat map of dotted/indexed field path -> message, for inline UI feedback. */
export function formatFieldErrors(error: z.ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path
      .map((segment, index) =>
        typeof segment === "number" ? `[${segment}]` : index === 0 ? String(segment) : `.${String(segment)}`,
      )
      .join("");
    if (!fieldErrors[path]) {
      fieldErrors[path] = issue.message;
    }
  }
  return fieldErrors;
}
