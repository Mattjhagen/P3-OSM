import React, { useState, useRef, useEffect } from 'react';
import { Button } from './Button';
import { VerificationServiceClient } from '../services/verificationService';
import logger from '../services/logger';

interface Props {
  userId: string;
  onComplete: (data: any) => void;
  onCancel: () => void;
}

type Step = 'INITIAL' | 'FRONT_DOC' | 'BACK_DOC' | 'LIVE_SELFIE' | 'POLLING' | 'RESULT';

export const VerifyIdentity: React.FC<Props> = ({ userId, onComplete, onCancel }) => {
  const [step, setStep] = useState<Step>('INITIAL');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState('passport');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocrData, setOcrData] = useState<any>(null);
  const [finalResult, setFinalResult] = useState<any>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const startVerification = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await VerificationServiceClient.idswyftInitialize({ userId, addons: { kyc: true, aml: true } });
      setVerificationId(data.verification_id);
      setStep('FRONT_DOC');
    } catch (err: any) {
      setError(err.message || 'Failed to initialize verification.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (file: File, side: 'front' | 'back') => {
    if (!verificationId) return;
    setIsLoading(true);
    setError(null);
    try {
      const method = side === 'front' ? 'idswyftUploadFront' : 'idswyftUploadBack';
      const data = await VerificationServiceClient[method]({
        verificationId,
        documentType,
        file,
      });
      if (side === 'front') {
        setOcrData(data.ocr_data);
        setStep('BACK_DOC');
      } else {
        setStep('LIVE_SELFIE');
      }
    } catch (err: any) {
      setError(err.message || `Failed to upload ${side} document.`);
    } finally {
      setIsLoading(false);
    }
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setError('Could not access camera. Please ensure permissions are granted.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const captureSelfie = async () => {
    if (!videoRef.current || !canvasRef.current || !verificationId) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      stopCamera();
      setIsLoading(true);
      try {
        const data = await VerificationServiceClient.idswyftUploadLive({
          verificationId,
          selfie: blob,
        });
        setFinalResult(data);
        setStep('RESULT');
      } catch (err: any) {
        setError(err.message || 'Liveness check failed.');
        setStep('LIVE_SELFIE'); // Retry
      } finally {
        setIsLoading(false);
      }
    }, 'image/jpeg');
  };

  useEffect(() => {
    if (step === 'LIVE_SELFIE') {
      startCamera();
    }
    return () => stopCamera();
  }, [step]);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl animate-fade-in text-white">
      <h2 className="text-2xl font-bold mb-2">Identity Verification</h2>
      <p className="text-zinc-500 text-sm mb-6">Powered by Idswyft OCR & Liveness</p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl mb-6 text-sm">
          {error}
        </div>
      )}

      {step === 'INITIAL' && (
        <div className="space-y-6">
          <p className="text-zinc-400">Ready to verify your identity? You'll need a government-issued ID and a working camera.</p>
          <Button onClick={startVerification} isLoading={isLoading} className="w-full">
            Start Verification
          </Button>
          <Button variant="ghost" onClick={onCancel} className="w-full text-zinc-500">
            Cancel
          </Button>
        </div>
      )}

      {step === 'FRONT_DOC' && (
        <div className="space-y-6">
          <h3 className="font-semibold text-lg">Upload Front of {documentType}</h3>
          <input 
            type="file" 
            accept="image/*" 
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'front')}
            className="block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-500/10 file:text-emerald-400 hover:file:bg-emerald-500/20 cursor-pointer"
          />
        </div>
      )}

      {step === 'BACK_DOC' && (
        <div className="space-y-6">
          <h3 className="font-semibold text-lg">Upload Back of {documentType}</h3>
          {ocrData && (
            <div className="bg-zinc-800/50 p-3 rounded-lg text-xs text-zinc-400 mb-4">
              Detected: {ocrData.full_name} ({ocrData.document_number})
            </div>
          )}
          <input 
            type="file" 
            accept="image/*" 
            onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'back')}
            className="block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-500/10 file:text-emerald-400 hover:file:bg-emerald-500/20 cursor-pointer"
          />
        </div>
      )}

      {step === 'LIVE_SELFIE' && (
        <div className="space-y-6 flex flex-col items-center">
          <h3 className="font-semibold text-lg w-full">Live Selfie Capture</h3>
          <div className="relative w-full aspect-square bg-black rounded-2xl overflow-hidden border border-zinc-800">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute inset-0 border-4 border-emerald-500/30 rounded-full m-8 pointer-events-none" />
          </div>
          <p className="text-xs text-zinc-500 text-center">Position your face inside the circle and look straight forward.</p>
          <Button onClick={captureSelfie} isLoading={isLoading} className="w-full">
            Capture & Verify
          </Button>
        </div>
      )}

      {step === 'RESULT' && (
        <div className="space-y-6 text-center">
          {finalResult?.final_result === 'verified' ? (
            <>
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
              </div>
              <h3 className="text-xl font-bold">Identity Verified</h3>
              <p className="text-zinc-400 text-sm">Your identity has been successfully verified. GDPR-compliant storage has been cleaned up.</p>
              <Button onClick={() => onComplete(finalResult)} className="w-full">
                Finish
              </Button>
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-zinc-800 text-zinc-400 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              </div>
              <h3 className="text-xl font-bold">Manual Review Required</h3>
              <p className="text-zinc-400 text-sm">Our team will manually review your documents. This usually takes 1-2 hours.</p>
              <Button onClick={() => onComplete(finalResult)} className="w-full">
                Close
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
