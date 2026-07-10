import type { FieldErrors } from "../validation/contractSchema.js";

export class AppError extends Error {
  statusCode: number;
  fieldErrors?: FieldErrors;

  constructor(statusCode: number, message: string, fieldErrors?: FieldErrors) {
    super(message);
    this.statusCode = statusCode;
    this.fieldErrors = fieldErrors;
  }
}
