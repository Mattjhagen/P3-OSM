import { MutableUserFinanceProfile } from './userDataService';

const roundUsd = (value: number) => Math.round(value * 100) / 100;

const createError = (status: number, message: string, code: string) => {
  const error = new Error(message) as Error & { status?: number; code?: string };
  error.status = status;
  error.code = code;
  return error;
};

const normalizeStatus = (value: unknown) => String(value || 'ACTIVE').toUpperCase();

export const TransactionGuardService = {
  validateUserStatus(profile: MutableUserFinanceProfile) {
    const status = normalizeStatus(profile.accountStatus);
    const isDefaulted = Boolean(profile.defaultFlag) || status === 'DEFAULTED';
    const isSuspended = status === 'SUSPENDED';

    if (isDefaulted || isSuspended) {
      throw createError(
        403,
        'Your account is restricted due to default. Please contact support with explanation.',
        'ACCOUNT_RESTRICTED_DEFAULT'
      );
    }
  },

  validateBalance(profile: MutableUserFinanceProfile, requiredAmountUsd: number) {
    const availableBalance = roundUsd(Number(profile.balance || 0));
    const required = roundUsd(Number(requiredAmountUsd || 0));

    if (!Number.isFinite(required) || required <= 0) {
      throw createError(400, 'Required amount must be a positive number.', 'INVALID_REQUIRED_AMOUNT');
    }

    if (availableBalance < required) {
      throw createError(
        402,
        `Insufficient available balance. Required $${required.toFixed(2)}, available $${availableBalance.toFixed(2)}.`,
        'DECLINED_INSUFFICIENT_FUNDS'
      );
    }
  },
};
