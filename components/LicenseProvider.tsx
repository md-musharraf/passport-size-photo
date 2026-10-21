'use client';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  FiLock, FiUnlock, FiKey, FiCopy, FiCheck,
  FiAlertTriangle, FiClock, FiActivity,
} from 'react-icons/fi';

type LicenseStatus = 'VALID' | 'EXPIRED' | 'NONE';
type LicenseType = 'LICENSE' | 'TRIAL' | 'NONE';
type RemoteStatus = 'ACTIVE' | 'PAUSED' | 'STOPPED' | 'DELETED' | 'NONE';

interface LicenseCheckResult {
  machineId: string;
  status: LicenseStatus;
  type?: LicenseType;
  expiryDate?: string;
  daysRemaining?: number;
  error?: string;
  remote: RemoteStatus;
  online: boolean;
  lastSyncTime: string | null;
}

declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      licenseCheck: (opts?: { remote?: boolean }) => Promise<LicenseCheckResult>;
      licenseActivate: (key: string) => Promise<{ success: boolean; expiryDate?: string; error?: string }>;
      licenseRequestTrial: () => Promise<{ success: boolean; daysRemaining?: number; error?: string }>;
    };
  }
}

interface LicenseState {
  isValid: boolean;
  isLoading: boolean;
  type: LicenseType;
  status: LicenseStatus;
  expiryDate?: string;
  daysRemaining?: number;
  error?: string;
}

interface LicenseContextType {
  licenseState: LicenseState & { machineId: string };
  remoteStatus: RemoteStatus;
  checkStatus: () => Promise<void>;
  activateKey: (key: string) => Promise<boolean>;
  requestTrial: () => Promise<boolean>;
  /** Running in a plain browser (no Electron licensing). */
  isWebDemo: boolean;
  /** Admin-dashboard sync state, shown as a status chip in the app header. */
  connection: { status: 'connected' | 'disconnected' | 'checking'; lastSyncTime: string | null };
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

// The dashboard can pause/stop a licence; poll often enough for that to land
// within minutes without hammering a free-tier backend.
const POLL_MS = 10 * 60 * 1000;

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const [machineId, setMachineId] = useState('Detecting hardware ID...');
  const [licenseState, setLicenseState] = useState<LicenseState>({
    isValid: false, isLoading: true, type: 'NONE', status: 'NONE',
  });
  const [remoteStatus, setRemoteStatus] = useState<RemoteStatus>('NONE');
  const [connection, setConnection] = useState<LicenseContextType['connection']>({ status: 'checking', lastSyncTime: null });
  const [isWebDemo, setIsWebDemo] = useState(false);

  const [activationError, setActivationError] = useState<string | null>(null);
  const [activationSuccess, setActivationSuccess] = useState<string | null>(null);
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [isRequestingTrial, setIsRequestingTrial] = useState(false);

  // remote=false is a local-only check (instant) used to paint the app at
  // startup; the dashboard sync then runs in the background.
  const runCheck = useCallback(async (remote: boolean) => {
    const api = window.electronAPI;
    if (!api) {
      setIsWebDemo(true);
      setConnection({ status: 'disconnected', lastSyncTime: null });
      setLicenseState({
        isValid: true, isLoading: false, type: 'LICENSE', status: 'VALID',
        expiryDate: 'Developer Web Session Expiry: Unlimited', daysRemaining: 365,
      });
      return;
    }
    try {
      const r = await api.licenseCheck({ remote });
      setMachineId(r.machineId);
      setRemoteStatus(r.remote);
      if (remote) {
        setConnection({
          status: r.online ? 'connected' : 'disconnected',
          lastSyncTime: r.lastSyncTime ? new Date(r.lastSyncTime).toLocaleTimeString() : null,
        });
      }
      setLicenseState({
        isValid: r.status === 'VALID', isLoading: false, type: r.type || 'NONE', status: r.status,
        expiryDate: r.expiryDate, daysRemaining: r.daysRemaining, error: r.error,
      });
    } catch (err) {
      console.error('License check failed:', err);
      setLicenseState((prev) => ({ ...prev, isLoading: false, error: 'Critical hardware license system initialization failure.' }));
    }
  }, []);

  const checkStatus = useCallback(() => runCheck(true), [runCheck]);

  // Shared by activate + trial: run the IPC, show the outcome, re-check on success.
  const submit = async <R extends { success: boolean; error?: string }>(
    setBusy: (b: boolean) => void,
    action: () => Promise<R>,
    successMsg: (r: R) => string,
    failMsg: string,
  ) => {
    setBusy(true);
    setActivationError(null);
    setActivationSuccess(null);
    try {
      const r = await action();
      if (!r.success) {
        setActivationError(r.error || failMsg);
        return false;
      }
      setActivationSuccess(successMsg(r));
      await checkStatus();
      return true;
    } catch {
      setActivationError(failMsg);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const activateKey = async (key: string) => {
    const api = window.electronAPI;
    if (!api) return false;
    const ok = await submit(
      setIsActivating,
      () => api.licenseActivate(key),
      (r) => `Activation successful! License expires: ${new Date(r.expiryDate!).toLocaleDateString()}`,
      'Activation verification failed.',
    );
    if (ok) setLicenseKeyInput('');
    return ok;
  };

  const requestTrial = async () => {
    const api = window.electronAPI;
    if (!api) return false;
    return submit(setIsRequestingTrial, () => api.licenseRequestTrial(), () => '7-Day Trial activated successfully!', 'Trial activation rejected.');
  };

  useEffect(() => {
    runCheck(false).then(() => runCheck(true));
    const onOnline = () => runCheck(true);
    window.addEventListener('online', onOnline);
    const interval = setInterval(() => runCheck(true), POLL_MS);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
    };
  }, [runCheck]);

  const handleCopyMachineId = () => {
    navigator.clipboard.writeText(machineId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (licenseState.isLoading) {
    return (
      <div className="h-screen w-screen bg-[#0d1117] text-white flex flex-col items-center justify-center gap-4 select-none">
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
          <FiLock className="absolute w-6 h-6 text-amber-500 animate-pulse" />
        </div>
        <p className="text-sm font-semibold tracking-wider text-neutral-400">
          Checking license...
        </p>
      </div>
    );
  }

  if (licenseState.isValid) {
    return (
      <LicenseContext.Provider
        value={{
          licenseState: { ...licenseState, machineId },
          remoteStatus,
          checkStatus,
          activateKey,
          requestTrial,
          isWebDemo,
          connection,
        }}
      >
        {children}
      </LicenseContext.Provider>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#0d1117] text-white flex items-center justify-center p-4 relative font-sans select-none overflow-hidden">
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-amber-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[450px] h-[450px] rounded-full bg-orange-600/5 blur-[150px] pointer-events-none" />

      <div className="w-full max-w-lg card-chai rounded-2xl p-6 md:p-8 backdrop-blur-xl relative z-10 space-y-6">
        
        {/* Header Logo */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-foreground">
            <FiLock className="w-6 h-6 text-foreground" />
          </div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground mt-4">
            Precision ID Studio
          </h2>
          <p className="text-xs text-neutral-400 font-medium">
            Biometric security console lock
          </p>
        </div>

        {/* Status Notification Box */}
        <div className="p-4 rounded-2xl bg-[#21262d]/50 border border-neutral-800 flex gap-3.5 items-start">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 shrink-0">
            {remoteStatus === 'PAUSED' || remoteStatus === 'STOPPED' ? (
              <FiActivity className="w-5 h-5 text-rose-500" />
            ) : remoteStatus === 'DELETED' ? (
              <FiAlertTriangle className="w-5 h-5 text-rose-500" />
            ) : licenseState.status === 'EXPIRED' ? (
              <FiClock className="w-5 h-5" />
            ) : (
              <FiKey className="w-5 h-5" />
            )}
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-neutral-200">
              {remoteStatus === 'PAUSED' ? 'License Paused' :
               remoteStatus === 'STOPPED' ? 'License Suspended' :
               remoteStatus === 'DELETED' ? 'Device Not Registered' :
               licenseState.status === 'EXPIRED' ? 'Subscription/Trial Expired' :
               'License Required'}
            </h4>
            <p className="text-[11px] text-neutral-400 font-semibold leading-relaxed">
              {remoteStatus === 'PAUSED' ? 'Your subscription was paused by the admin. Check back later or contact billing.' :
               remoteStatus === 'STOPPED' ? 'Your subscription has been terminated. Please purchase a new license key.' :
               remoteStatus === 'DELETED' ? 'This Machine ID has been deleted or is not registered in the database. Enter a valid key to activate.' :
               licenseState.status === 'EXPIRED' ? (licenseState.type === 'TRIAL' ? 'Your 7-day free trial has expired. Paste an activation key to continue.' : 'Your software key validity has expired. Please renew your key.') :
               'Enter your signed license key to activate the app.'}
            </p>
          </div>
        </div>

        {/* Machine ID Box */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-neutral-400 pl-0.5">
            Your device machine ID
          </label>
          <div className="flex gap-2">
            <div className="flex-1 px-4 py-2.5 bg-[#0d1117] border border-neutral-800 rounded-xl font-mono text-[12px] text-neutral-300 select-all truncate flex items-center">
              {machineId}
            </div>
            <button
              onClick={handleCopyMachineId}
              title="Copy Machine ID"
              className="px-4 py-2.5 rounded-xl border border-neutral-800 hover:border-neutral-700 bg-[#21262d] text-neutral-300 hover:text-white transition-all cursor-pointer flex items-center justify-center shrink-0"
            >
              {copied ? <FiCheck className="w-4 h-4 text-emerald-400" /> : <FiCopy className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[10px] text-neutral-500 font-semibold pl-0.5">
            Share this ID with the administrator to generate your activation key.
          </p>
        </div>

        {/* Divider */}
        <div className="h-[1px] bg-neutral-800 w-full" />

        {/* Key Paste Form */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-400 pl-0.5">
              Enter license key
            </label>
            <input
              type="text"
              value={licenseKeyInput}
              onChange={(e) => setLicenseKeyInput(e.target.value)}
              disabled={isActivating || remoteStatus === 'PAUSED' || remoteStatus === 'STOPPED'}
              placeholder="Paste license key..."
              className="w-full bg-[#0d1117] border border-neutral-800 focus:border-amber-500/50 text-neutral-200 text-xs font-mono rounded-xl px-4 py-3 outline-none transition-colors placeholder:text-neutral-600 disabled:opacity-50"
            />
          </div>

          {activationError && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] font-bold flex items-center gap-2">
              <FiAlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{activationError}</span>
            </div>
          )}

          {activationSuccess && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold flex items-center gap-2">
              <FiCheck className="w-4 h-4 shrink-0 text-emerald-500" />
              <span>{activationSuccess}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => activateKey(licenseKeyInput)}
              disabled={isActivating || !licenseKeyInput.trim() || remoteStatus === 'PAUSED' || remoteStatus === 'STOPPED'}
              className="btn-asym flex-1 py-3 bg-white text-black hover:bg-neutral-200 disabled:opacity-40 text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              {isActivating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  <span>Verifying key...</span>
                </>
              ) : (
                <>
                  <FiUnlock className="w-4 h-4" />
                  <span>Activate software</span>
                </>
              )}
            </button>

            {/* Trial Request Button (Only shown if trial never used) */}
            {licenseState.type !== 'TRIAL' && licenseState.status !== 'EXPIRED' && (
              <button
                onClick={requestTrial}
                disabled={isRequestingTrial || isActivating || remoteStatus === 'PAUSED' || remoteStatus === 'STOPPED'}
                className="py-3 px-4 rounded-xl border border-neutral-800 hover:border-neutral-700 bg-[#21262d] text-neutral-300 hover:text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
              >
                {isRequestingTrial ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-neutral-400/30 border-t-neutral-400 rounded-full animate-spin" />
                    <span>Activating...</span>
                  </>
                ) : (
                  <>
                    <FiClock className="w-4 h-4" />
                    <span>7-Day Free Trial</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-[10px] text-neutral-600 font-semibold leading-relaxed border-t border-neutral-900 pt-4">
          Precision ID Studio • Fully Offline Decryption Console<br />
          Hardware validation bounds license registry directly to this motherboard device.
        </div>

      </div>

    </div>
  );
}

export function useLicense() {
  const context = useContext(LicenseContext);
  if (!context) {
    throw new Error('useLicense must be used within a LicenseProvider');
  }
  return context;
}
