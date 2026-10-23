import { hasRole } from '../../common/guards/roles.guard';

/**
 * Single source of truth for who can do what on invoices. Reuses the existing RBAC
 * hierarchy (owner > admin > agent) via `hasRole`, so we don't introduce a parallel
 * permission system. The HTTP layer still enforces this with `@Roles(...)` + RolesGuard.
 */
export type InvoiceAction =
  | 'view' | 'create' | 'edit' | 'issue' | 'send' | 'record_payment'
  | 'void' | 'credit_note' | 'refund' | 'settings';

// Minimum role required for each action (approved decisions):
// - create/edit/issue/send/record_payment → admin + agent (min 'agent')
// - void / credit_note / refund / settings → admin only (min 'admin')
// - view → any tenant member (min 'agent', the lowest role)
export const INVOICE_ACTION_MIN_ROLE: Record<InvoiceAction, string> = {
  view:           'agent',
  create:         'agent',
  edit:           'agent',
  issue:          'agent',
  send:           'agent',
  record_payment: 'agent',
  void:           'admin',
  credit_note:    'admin',
  refund:         'admin',
  settings:       'admin',
};

export function canInvoiceAction(role: string, action: InvoiceAction): boolean {
  return hasRole(role, INVOICE_ACTION_MIN_ROLE[action]);
}
