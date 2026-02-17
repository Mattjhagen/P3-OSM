import { NextFunction, Request, Response } from 'express';
import { FinancePersistenceService } from '../services/financePersistenceService';
import { PlaidService } from '../services/plaidService';

const attachStatus = (error: any) => {
  if (typeof error?.status === 'number') {
    return error;
  }

  const message = String(error?.message || '').toLowerCase();
  if (message.includes('not configured')) {
    error.status = 503;
    return error;
  }
  if (message.includes('required') || message.includes('invalid') || message.includes('no bank accounts')) {
    error.status = 400;
  }
  return error;
};

export const PlaidController = {
  createLinkToken: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, email, redirectUri, androidPackageName } = req.body || {};
      const normalizedUserId = String(userId || '').trim();

      if (!normalizedUserId) {
        return res.status(400).json({
          success: false,
          error: 'userId is required.',
        });
      }

      const token = await PlaidService.createLinkToken({
        userId: normalizedUserId,
        email: typeof email === 'string' ? email : undefined,
        redirectUri: typeof redirectUri === 'string' ? redirectUri.trim() : undefined,
        androidPackageName:
          typeof androidPackageName === 'string' ? androidPackageName.trim() : undefined,
      });

      return res.status(200).json({
        success: true,
        data: token,
      });
    } catch (error) {
      next(attachStatus(error));
    }
  },

  exchangePublicToken: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, publicToken, public_token, accountId } = req.body || {};
      const normalizedUserId = String(userId || '').trim();
      const normalizedPublicToken = String(publicToken || public_token || '').trim();

      if (!normalizedUserId) {
        return res.status(400).json({
          success: false,
          error: 'userId is required.',
        });
      }

      if (!normalizedPublicToken) {
        return res.status(400).json({
          success: false,
          error: 'publicToken is required.',
        });
      }

      const exchange = await PlaidService.exchangePublicToken(normalizedPublicToken);
      const accounts = await PlaidService.getAccounts(exchange.access_token);
      const selectedAccount = accounts.accounts.find(
        (account) => account.account_id === String(accountId || '').trim()
      ) || accounts.accounts[0];

      if (!selectedAccount) {
        return res.status(400).json({
          success: false,
          error: 'No bank accounts returned by Plaid item.',
        });
      }

      const institutionName = await PlaidService.getInstitutionName(accounts.item?.institution_id || null);
      const processor = await PlaidService.createStripeProcessorToken(
        exchange.access_token,
        selectedAccount.account_id
      );

      const bankLinkId = await FinancePersistenceService.createPlaidBankLink({
        userId: normalizedUserId,
        plaidItemId: exchange.item_id,
        plaidAccountId: selectedAccount.account_id,
        mask: selectedAccount.mask || '****',
        institutionName,
        processorToken: processor.processor_token,
        metadata: {
          account_name: selectedAccount.name,
          subtype: selectedAccount.subtype,
          type: selectedAccount.type,
        },
      });

      return res.status(200).json({
        success: true,
        data: {
          bankLinkId,
          plaidItemId: exchange.item_id,
          plaidAccountId: selectedAccount.account_id,
          processorToken: processor.processor_token,
          institutionName,
          mask: selectedAccount.mask || '****',
        },
      });
    } catch (error) {
      next(attachStatus(error));
    }
  },

  identityCheck: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { publicToken, accessToken } = req.body || {};
      let resolvedAccessToken = String(accessToken || '').trim();

      if (!resolvedAccessToken) {
        const normalizedPublicToken = String(publicToken || '').trim();
        if (!normalizedPublicToken) {
          return res.status(400).json({
            success: false,
            error: 'publicToken or accessToken is required for identity check.',
          });
        }

        const exchange = await PlaidService.exchangePublicToken(normalizedPublicToken);
        resolvedAccessToken = exchange.access_token;
      }

      const identity = await PlaidService.identityCheck(resolvedAccessToken);

      return res.status(200).json({
        success: true,
        data: {
          accounts: identity.accounts,
          requestId: identity.request_id,
        },
      });
    } catch (error) {
      next(attachStatus(error));
    }
  },
};
