import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { ConsentService } from '../services/consentService';
import type { ConsentState } from '../types';

const POLICY_VERSION = '1.0';

interface Props {
  onConsentChange?: (state: ConsentState) => void;
}

export const ConsentBanner: React.FC<Props> = ({ onConsentChange }) => {
  const [visible, setVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [state, setState] = useState<ConsentState>(() => ConsentService.get());

  useEffect(() => {
    setVisible(!ConsentService.hasDecided());
  }, []);

  const update = (next: ConsentState) => {
    setState(next);
    onConsentChange?.(next);
  };

  const handleAcceptAll = () => {
    const next = ConsentService.acceptAll(POLICY_VERSION);
    update(next);
    setVisible(false);
  };

  const handleRejectAll = () => {
    const next = ConsentService.rejectAll(POLICY_VERSION);
    update(next);
    setVisible(false);
  };

  const handleSaveSettings = (analytics: boolean, personalization: boolean) => {
    const next = ConsentService.set({ analytics, personalization }, POLICY_VERSION);
    update(next);
    setShowSettings(false);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[200] p-4 bg-zinc-900/95 border-t border-zinc-700 shadow-lg animate-fade-in">
      <div className="max-w-4xl mx-auto">
        {!showSettings ? (
          <>
            <p className="text-sm text-zinc-300 mb-3">
              We use first-party storage for session and preferences only. You can allow optional analytics and personalization, or reject non-essential use.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={handleAcceptAll}>
                Accept all
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setShowSettings(true)}>
                Customize
              </Button>
              <Button size="sm" variant="ghost" onClick={handleRejectAll}>
                Reject non-essential
              </Button>
            </div>
          </>
        ) : (
          <ConsentSettingsInner
            initialState={state}
            onSave={handleSaveSettings}
            onCancel={() => setShowSettings(false)}
          />
        )}
      </div>
    </div>
  );
};

interface ConsentSettingsInnerProps {
  initialState: ConsentState;
  onSave: (analytics: boolean, personalization: boolean) => void;
  onCancel: () => void;
}

const ConsentSettingsInner: React.FC<ConsentSettingsInnerProps> = ({
  initialState,
  onSave,
  onCancel,
}) => {
  const [analytics, setAnalytics] = useState(initialState.analytics);
  const [personalization, setPersonalization] = useState(initialState.personalization);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-white uppercase tracking-wide">Consent settings</h3>
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={analytics}
            onChange={(e) => setAnalytics(e.target.checked)}
            className="rounded border-zinc-600 bg-black text-[#00e599] focus:ring-[#00e599]"
          />
          <span className="text-sm text-zinc-300">Analytics (usage and events)</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={personalization}
            onChange={(e) => setPersonalization(e.target.checked)}
            className="rounded border-zinc-600 bg-black text-[#00e599] focus:ring-[#00e599]"
          />
          <span className="text-sm text-zinc-300">Personalization (recommendations)</span>
        </label>
      </div>
      <p className="text-xs text-zinc-500">Policy version: {initialState.policyVersion}</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(analytics, personalization)}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
};

/** Standalone consent settings panel (e.g. for privacy/cookie page or app settings). */
export const ConsentSettings: React.FC<{
  onConsentChange?: (state: ConsentState) => void;
}> = ({ onConsentChange }) => {
  const [state, setState] = useState<ConsentState>(() => ConsentService.get());

  const handleSave = (analytics: boolean, personalization: boolean) => {
    const next = ConsentService.set({ analytics, personalization }, state.policyVersion);
    setState(next);
    onConsentChange?.(next);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-white uppercase tracking-wide">Consent &amp; privacy</h3>
      <ConsentSettingsInner
        initialState={state}
        onSave={handleSave}
        onCancel={() => {}}
      />
    </div>
  );
};
