import type { CommissionRule, DoctorEarningEntry } from "@/types/database";

export function selectBestCommissionRule(
  rules: CommissionRule[],
  doctorId: string,
  serviceId: string,
  serviceDate: string
): CommissionRule | null {
  const eligible = rules.filter(
    (r) =>
      r.is_active &&
      r.effective_from <= serviceDate &&
      (r.doctor_id === doctorId || r.doctor_id === null) &&
      (r.service_id === serviceId || r.service_id === null)
  );

  if (eligible.length === 0) return null;

  const score = (r: CommissionRule): number => {
    if (r.doctor_id !== null && r.service_id !== null) return 4;
    if (r.doctor_id !== null && r.service_id === null) return 3;
    if (r.doctor_id === null && r.service_id !== null) return 2;
    return 1;
  };

  eligible.sort((a, b) => {
    const diff = score(b) - score(a);
    if (diff !== 0) return diff;
    if (b.effective_from !== a.effective_from) {
      return b.effective_from.localeCompare(a.effective_from);
    }
    return b.created_at.localeCompare(a.created_at);
  });

  return eligible[0];
}

export function calculateDoctorCommission(
  netCollected: number,
  totalDue: number,
  rule: Pick<CommissionRule, "commission_type" | "commission_value"> | null
): number {
  if (!rule || netCollected <= 0) return 0;
  if (rule.commission_type === "percentage") {
    return Number(((netCollected * rule.commission_value) / 100).toFixed(2));
  }
  if (totalDue > 0) {
    const ratio = Math.min(1, netCollected / totalDue);
    return Number(Math.min(netCollected, rule.commission_value * ratio).toFixed(2));
  }
  return Number(Math.min(netCollected, rule.commission_value).toFixed(2));
}

export interface FinancialSummary {
  grossPayments: number;
  refundedAmount: number;
  netRevenue: number;
  outstandingBalances: number;
  doctorCommissionsAccrued: number;
  doctorPayoutsPaid: number;
  doctorBalanceOwed: number;
  clinicExpenses: number;
  netFinancialResult: number;
}

export function summarizeClinicFinances(params: {
  payments: Array<{ amount: number; is_confirmed: boolean }>;
  refunds: Array<{ amount: number }>;
  tickets: Array<{ total_due: number; paid_amount: number; status: string }>;
  earnings: Array<Pick<DoctorEarningEntry, "entry_type" | "doctor_amount">>;
  expenses: Array<{ amount: number }>;
}): FinancialSummary {
  const grossPayments = params.payments
    .filter((p) => p.is_confirmed)
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const refundedAmount = params.refunds.reduce((sum, r) => sum + Number(r.amount), 0);
  const netRevenue = Math.max(0, Number((grossPayments - refundedAmount).toFixed(2)));

  const outstandingBalances = params.tickets
    .filter((t) => t.status !== "bekor_qilindi" && t.status !== "kelmagan")
    .reduce((sum, t) => sum + Math.max(0, Number(t.total_due) - Number(t.paid_amount)), 0);

  const doctorCommissionsAccrued = params.earnings
    .filter((e) => e.entry_type !== "payout")
    .reduce((sum, e) => sum + Number(e.doctor_amount), 0);

  const doctorPayoutsPaid = params.earnings
    .filter((e) => e.entry_type === "payout")
    .reduce((sum, e) => sum + Math.abs(Number(e.doctor_amount)), 0);

  const doctorBalanceOwed = Number((doctorCommissionsAccrued - doctorPayoutsPaid).toFixed(2));
  const clinicExpenses = params.expenses.reduce((sum, ex) => sum + Number(ex.amount), 0);
  const netFinancialResult = Number(
    (netRevenue - doctorCommissionsAccrued - clinicExpenses).toFixed(2)
  );

  return {
    grossPayments: Number(grossPayments.toFixed(2)),
    refundedAmount: Number(refundedAmount.toFixed(2)),
    netRevenue,
    outstandingBalances: Number(outstandingBalances.toFixed(2)),
    doctorCommissionsAccrued: Number(doctorCommissionsAccrued.toFixed(2)),
    doctorPayoutsPaid: Number(doctorPayoutsPaid.toFixed(2)),
    doctorBalanceOwed,
    clinicExpenses: Number(clinicExpenses.toFixed(2)),
    netFinancialResult,
  };
}
