export {};

declare global {
  namespace Express {
    interface Request {
      orgId?: string;
    }
  }
}
