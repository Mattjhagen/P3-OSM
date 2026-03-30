import axios from 'axios';
import { config } from '../config/config';
import logger from '../utils/logger';

const IDSWYFT_BASE_URL = 'https://api.idswyft.app';

export interface IdswyftAddons {
  aml?: boolean;
  kyc?: boolean;
}

export interface IdswyftStatusResponse {
  id: string;
  status: 'pending' | 'processing' | 'verified' | 'failed' | 'manual_review';
  ocr_data?: Record<string, any>;
  cross_validation_results?: {
    is_valid: boolean;
    reason?: string;
  };
  liveness_results?: Record<string, any>;
  final_result?: 'verified' | 'manual_review' | 'failed';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const IdswyftService = {
  async initializeVerification(userId: string, addons?: IdswyftAddons) {
    const response = await axios.post(
      `${IDSWYFT_BASE_URL}/api/v2/verify/initialize`,
      {
        user_id: userId,
        sandbox: config.idswyft.sandbox,
        addons,
      },
      {
        headers: {
          'X-API-Key': config.idswyft.apiKey,
        },
      }
    );

    return response.data; // Should return verification_id
  },

  async uploadFrontDocument(verificationId: string, documentType: string, file: Buffer | Blob) {
    const formData = new FormData();
    formData.append('document_type', documentType);
    formData.append('file', file as any);

    await axios.post(
      `${IDSWYFT_BASE_URL}/api/v2/verify/${verificationId}/front-document`,
      formData,
      {
        headers: {
          'X-API-Key': config.idswyft.apiKey,
        },
      }
    );

    return this.pollUntilReady(verificationId, (status) => !!status.ocr_data);
  },

  async uploadBackDocument(verificationId: string, documentType: string, file: Buffer | Blob) {
    const formData = new FormData();
    formData.append('document_type', documentType);
    formData.append('file', file as any);

    await axios.post(
      `${IDSWYFT_BASE_URL}/api/v2/verify/${verificationId}/back-document`,
      formData,
      {
        headers: {
          'X-API-Key': config.idswyft.apiKey,
        },
      }
    );

    return this.pollUntilReady(verificationId, (status) => !!status.cross_validation_results);
  },

  async uploadLiveCapture(verificationId: string, selfie: Buffer | Blob, livenessMetadata?: any) {
    const formData = new FormData();
    formData.append('selfie', selfie as any);
    if (livenessMetadata) {
      formData.append('metadata', JSON.stringify(livenessMetadata));
    }

    await axios.post(
      `${IDSWYFT_BASE_URL}/api/v2/verify/${verificationId}/live-capture`,
      formData,
      {
        headers: {
          'X-API-Key': config.idswyft.apiKey,
        },
      }
    );

    return this.pollUntilReady(verificationId, (status) => !!status.final_result);
  },

  async getStatus(verificationId: string): Promise<IdswyftStatusResponse> {
    const response = await axios.get(
      `${IDSWYFT_BASE_URL}/api/v2/verify/${verificationId}/status`,
      {
        headers: {
          'X-API-Key': config.idswyft.apiKey,
        },
      }
    );

    return response.data;
  },

  async pollUntilReady(
    verificationId: string,
    condition: (status: IdswyftStatusResponse) => boolean,
    maxRetries = 10
  ): Promise<IdswyftStatusResponse> {
    let delay = 2000;
    for (let i = 0; i < maxRetries; i++) {
      const status = await this.getStatus(verificationId);
      if (condition(status)) {
        if (status.cross_validation_results && !status.cross_validation_results.is_valid) {
          throw new Error(`Cross-validation failed: ${status.cross_validation_results.reason}`);
        }
        return status;
      }
      await sleep(delay);
      delay *= 2; // Exponential backoff
    }
    throw new Error('Polling timed out.');
  },
};
