import { config } from '../config/config';

export type BillableAction =
  | 'loan_request'
  | 'loan_repayment'
  | 'buy_crypto'
  | 'sell_crypto'
  | 'withdraw_btc'
  | 'withdraw_stripe'
  | 'withdraw_bank'
  | 'loan_funding'
  | 'microloan_funding'
  | 'borrow_collateral';

const roundUsd = (value: number) => Math.round(value * 100) / 100;

const toPositiveNumber = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Amount must be a positive number.');
  }

  return value;
};

export interface FeeBreakdown {
  action: BillableAction;
  grossAmountUsd: number;
  feePercent: number;
  feePercentAmountUsd: number;
  feeFixedAmountUsd: number;
  feeTotalUsd: number;
  netAmountUsd: number;
}

export const FeePolicyService = {
  calculate(action: BillableAction, grossAmountUsd: number): FeeBreakdown {
    const gross = toPositiveNumber(grossAmountUsd);
    const feeDefaults: Record<BillableAction, { percent: number; fixedUsd: number }> = {
      buy_crypto: { percent: 0, fixedUsd: 0 },
      sell_crypto: { percent: config.fees.percent, fixedUsd: config.fees.fixedUsd },
      loan_request: { percent: config.fees.percent, fixedUsd: config.fees.fixedUsd },
      loan_repayment: { percent: config.fees.percent, fixedUsd: config.fees.fixedUsd },
      loan_funding: { percent: config.fees.percent, fixedUsd: config.fees.fixedUsd },
      microloan_funding: { percent: config.fees.percent, fixedUsd: config.fees.fixedUsd },
      borrow_collateral: { percent: config.fees.percent, fixedUsd: config.fees.fixedUsd },
      withdraw_btc: { percent: config.fees.percent, fixedUsd: config.fees.fixedUsd },
      withdraw_stripe: { percent: config.fees.percent, fixedUsd: config.fees.fixedUsd },
      withdraw_bank: { percent: config.fees.percent, fixedUsd: config.fees.fixedUsd },
    };
    const feePercent = Math.max(0, feeDefaults[action].percent);
    const feeFixed = Math.max(0, feeDefaults[action].fixedUsd);

    const feePercentAmount = roundUsd(gross * feePercent);
    const feeTotal = roundUsd(feePercentAmount + feeFixed);
    const net = roundUsd(gross - feeTotal);

    return {
      action,
      grossAmountUsd: roundUsd(gross),
      feePercent,
      feePercentAmountUsd: feePercentAmount,
      feeFixedAmountUsd: roundUsd(feeFixed),
      feeTotalUsd: feeTotal,
      netAmountUsd: net,
    };
  },
};
