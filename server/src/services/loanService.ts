import { getDbClient } from './dbClient';
import { createHash } from 'crypto';
import { FeePolicyService } from './feePolicyService';
import { FinancePersistenceService } from './financePersistenceService';
import { TransactionGuardService } from './transactionGuardService';
import { UserDataService } from './userDataService';
import { supabase } from '../config/supabase';

export type LoanRecord = {
    id: string;
    borrower_id: string;
    lender_id: string;
    amount_usd: string;
    interest_rate: string;
    status: string;
    due_date?: string | null;
    platform_fee?: string | null;
    fee_breakdown_hash?: string | null;
    created_at: string;
    updated_at: string;
};

export type RepaymentRecord = {
    id: string;
    loan_id: string;
    amount: string;
    is_late: boolean;
    tx_hash: string;
    created_at: string;
};

const isMissingSchemaField = (message: string, field: string) => {
    const normalized = (message || '').toLowerCase();
    return normalized.includes(`column`) && normalized.includes(field.toLowerCase()) && normalized.includes('does not exist');
};

const runDefaultDetection = async (accessToken?: string) => {
    const client = getDbClient(accessToken);
    const nowIso = new Date().toISOString();
    const { data, error } = await client
        .from('loan_activity')
        .select('id, borrower_id, due_date, status')
        .lt('due_date', nowIso)
        .neq('status', 'repaid')
        .neq('status', 'defaulted')
        .limit(200);

    if (error) {
        if (isMissingSchemaField(error.message, 'due_date')) {
            return;
        }
        throw new Error(`Failed to evaluate loan defaults: ${error.message}`);
    }

    for (const row of data || []) {
        await client.from('loan_activity').update({ status: 'defaulted' }).eq('id', row.id);

        try {
            await UserDataService.updateProfile(row.borrower_id, (existing) => ({
                ...existing,
                defaultFlag: true,
                accountStatus: 'DEFAULTED',
            }));
        } catch {
            // Best effort flagging for mixed-schema deployments.
        }
    }
};

export const LoanService = {
    listLoansForUser: async (userId: string, accessToken?: string, status?: string): Promise<LoanRecord[]> => {
        const client = getDbClient(accessToken);
        await runDefaultDetection(accessToken);

        let query = client
            .from('loan_activity')
            .select('id, borrower_id, lender_id, amount_usd, interest_rate, platform_fee, fee_breakdown_hash, due_date, status, created_at, updated_at')
            .or(`borrower_id.eq.${userId},lender_id.eq.${userId}`)
            .order('created_at', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) {
            throw new Error(`Failed to list loans: ${error.message}`);
        }

        return data || [];
    },

    createLoanRequest: async (
        payload: {
            borrowerId: string;
            lenderId?: string;
            amountUsd: number;
            interestRate: number;
            status: string;
            dueDate?: string | null;
        },
        accessToken?: string
    ): Promise<LoanRecord> => {
        const client = getDbClient(accessToken);
        const estimatedAccruedInterest = payload.amountUsd * (Math.max(0, payload.interestRate) / 100);
        const feeBaseAmount = payload.amountUsd + estimatedAccruedInterest;
        const fee = FeePolicyService.calculate('loan_request', feeBaseAmount);
        const feeBreakdownHash = createHash('sha256')
            .update(
                JSON.stringify({
                    borrowerId: payload.borrowerId,
                    amountUsd: payload.amountUsd,
                    interestRate: payload.interestRate,
                    estimatedAccruedInterest,
                    feeTotalUsd: fee.feeTotalUsd,
                    generatedAt: new Date().toISOString(),
                })
            )
            .digest('hex');
        const profile = await UserDataService.getProfile(payload.borrowerId);
        TransactionGuardService.validateUserStatus(profile);
        TransactionGuardService.validateBalance(profile, fee.feeTotalUsd);

        const { data, error } = await client
            .from('loan_activity')
            .insert({
                borrower_id: payload.borrowerId,
                // Legacy schema requires lender_id. Fallback to borrower for pending requests.
                lender_id: payload.lenderId || payload.borrowerId,
                amount_usd: payload.amountUsd,
                interest_rate: payload.interestRate,
                platform_fee: fee.feeTotalUsd,
                fee_breakdown_hash: feeBreakdownHash,
                due_date: payload.dueDate || null,
                status: payload.status,
            })
            .select('id, borrower_id, lender_id, amount_usd, interest_rate, platform_fee, fee_breakdown_hash, due_date, status, created_at, updated_at')
            .single();

        if (error) {
            throw new Error(`Failed to create loan request: ${error.message}`);
        }

        try {
            await UserDataService.updateProfile(payload.borrowerId, (existing) => ({
                ...existing,
                balance: Math.round((Number(existing.balance || 0) - fee.feeTotalUsd) * 100) / 100,
            }));
        } catch (balanceError: any) {
            await client.from('loan_activity').delete().eq('id', data.id);
            throw new Error(`Failed to collect loan request fee: ${balanceError.message}`);
        }

        const ledgerId = await FinancePersistenceService.insertLedgerTransaction({
            userId: payload.borrowerId,
            type: 'loan_request',
            amountUsd: fee.grossAmountUsd,
            feeUsd: fee.feeTotalUsd,
            netAmountUsd: fee.netAmountUsd,
            status: 'completed',
            provider: 'INTERNAL_LEDGER',
            referenceId: data.id,
            metadata: {
                interest_rate: payload.interestRate,
            },
        });

        await FinancePersistenceService.insertFeeAccrual({
            userId: payload.borrowerId,
            action: 'loan_request',
            feeUsd: fee.feeTotalUsd,
            ledgerTransactionId: ledgerId,
            referenceId: data.id,
            settlementStatus: 'pending',
            metadata: {
                provider: 'stripe',
            },
        });

        await supabase.from('audit_log').insert({
            actor_id: payload.borrowerId,
            action: 'loan_fee_hash_anchor_pending',
            resource_type: 'loan_activity',
            resource_id: data.id,
            metadata: {
                fee_breakdown_hash: feeBreakdownHash,
                estimated_accrued_interest: Math.round(estimatedAccruedInterest * 100) / 100,
                anchor_status: 'pending_onchain_anchor',
            },
        });

        return data;
    },

    repayLoan: async (
        payload: {
            userId: string;
            loanId: string;
            amount: number;
            txHash: string;
            isLate?: boolean;
        },
        accessToken?: string
    ): Promise<{ loan: LoanRecord; repayment: RepaymentRecord }> => {
        const client = getDbClient(accessToken);
        const fee = FeePolicyService.calculate('loan_repayment', payload.amount);
        const profile = await UserDataService.getProfile(payload.userId);
        TransactionGuardService.validateUserStatus(profile);
        TransactionGuardService.validateBalance(profile, fee.feeTotalUsd);

        const { data: loan, error: loanError } = await client
            .from('loan_activity')
            .select('id, borrower_id, lender_id, amount_usd, interest_rate, platform_fee, fee_breakdown_hash, due_date, status, created_at, updated_at')
            .eq('id', payload.loanId)
            .maybeSingle();

        if (loanError) {
            throw new Error(`Failed to fetch loan for repayment: ${loanError.message}`);
        }

        if (!loan) {
            throw new Error('Loan not found.');
        }

        // Ownership: only the borrower or lender for this loan may record a repayment.
        if (loan.borrower_id !== payload.userId && loan.lender_id !== payload.userId) {
            throw new Error('You are not authorized to repay this loan.');
        }

        await UserDataService.updateProfile(payload.userId, (existing) => ({
            ...existing,
            balance: Math.round((Number(existing.balance || 0) - fee.feeTotalUsd) * 100) / 100,
        }));

        try {
            const { data: repayment, error: repaymentError } = await client
                .from('repayment_history')
                .insert({
                    loan_id: payload.loanId,
                    amount: payload.amount,
                    tx_hash: payload.txHash,
                    is_late: payload.isLate || false,
                })
                .select('id, loan_id, amount, is_late, tx_hash, created_at')
                .single();

            if (repaymentError) {
                throw new Error(`Failed to record repayment: ${repaymentError.message}`);
            }

            const { data: updatedLoan, error: updateError } = await client
                .from('loan_activity')
                .update({ status: 'repaid' })
                .eq('id', payload.loanId)
                .select('id, borrower_id, lender_id, amount_usd, interest_rate, platform_fee, fee_breakdown_hash, due_date, status, created_at, updated_at')
                .single();

            if (updateError) {
                throw new Error(`Failed to update loan status: ${updateError.message}`);
            }

            const ledgerId = await FinancePersistenceService.insertLedgerTransaction({
                userId: payload.userId,
                type: 'loan_repayment',
                amountUsd: fee.grossAmountUsd,
                feeUsd: fee.feeTotalUsd,
                netAmountUsd: fee.netAmountUsd,
                status: 'completed',
                provider: 'INTERNAL_LEDGER',
                referenceId: repayment.id,
                metadata: {
                    loan_id: payload.loanId,
                    tx_hash: payload.txHash,
                    is_late: Boolean(payload.isLate),
                },
            });

            await FinancePersistenceService.insertFeeAccrual({
                userId: payload.userId,
                action: 'loan_repayment',
                feeUsd: fee.feeTotalUsd,
                ledgerTransactionId: ledgerId,
                referenceId: repayment.id,
                settlementStatus: 'pending',
                metadata: {
                    provider: 'stripe',
                },
            });

            return {
                loan: updatedLoan,
                repayment,
            };
        } catch (error: any) {
            await UserDataService.updateProfile(payload.userId, (existing) => ({
                ...existing,
                balance: Math.round((Number(existing.balance || 0) + fee.feeTotalUsd) * 100) / 100,
            }));
            throw error;
        }
    },
};
