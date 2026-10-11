'use client';
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { 
  FiLock, FiUnlock, FiKey, FiCopy, FiCheck, 
  FiAlertTriangle, FiCpu, FiClock, FiActivity,
  FiSettings, FiSave, FiX, FiGlobe
} from 'react-icons/fi';

declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      getMachineId: () => Promise<string>;
      licenseCheck: () => Promise<{
        status: 'VALID' | 'EXPIRED' | 'NONE';
        type?: 'LICENSE' | 'TRIAL';
        expiryDate?: string;
        trialStartDate?: string;
        daysRemaining?: number;
        error?: string;
      }>;
      licenseActivate: (key: string) => Promise<{ success: boolean; expiryDate?: string; error?: string }>;
      licenseRequestTrial: () => Promise<{ success: boolean; daysRemaining?: number; error?: string }>;
      licenseWipe: () => Promise<{ success: boolean; error?: string }>;
      getDashboardUrl: () => Promise<string>;
      saveDashboardUrl: (url: string) => Promise<{ success: boolean; error?: string }>;
      isDashboardConfigured: () => Promise<{ configured: boolean }>;
      recordSync: () => Promise<{ success: boolean; error?: string }>;
    };
  }
}

interface LicenseContextType {
  licenseState: {
    isValid: boolean;
    isLoading: boolean;
    type: 'LICENSE' | 'TRIAL' | 'NONE';
    status: 'VALID' | 'EXPIRED' | 'NONE';
    machineId: string;
    expiryDate?: string;
    daysRemaining?: number;
    error?: string;
  };
  remoteStatus: 'ACTIVE' | 'PAUSED' | 'STOPPED' | 'DELETED' | 'NONE';
  checkStatus: () => Promise<void>;
  activateKey: (key: string) => Promise<boolean>;
  requestTrial: () => Promise<boolean>;
  /** Running in a plain browser (no Electron licensing). */
  isWebDemo: boolean;
  /** Admin-dashboard sync state, shown as a status chip in the app header. */
  connection: { status: 'connected' | 'disconnected' | 'checking' | 'unconfigured'; lastSyncTime: string | null };
  openLicenseSettings: () => void;
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const [machineId, setMachineId] = useState<string>('Detecting hardware ID...');
  const [licenseState, setLicenseState] = useState({
    isValid: false,
    isLoading: true,
    type: 'NONE' as 'LICENSE' | 'TRIAL' | 'NONE',
    status: 'NONE' as 'VALID' | 'EXPIRED' | 'NONE',
    expiryDate: undefined as string | undefined,
    daysRemaining: undefined as number | undefined,
    error: undefined as string | undefined,
  });
  
  const [remoteStatus, setRemoteStatus] = useState<'ACTIVE' | 'PAUSED' | 'STOPPED' | 'DELETED' | 'NONE'>('NONE');
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activationSuccess, setActivationSuccess] = useState<string | null>(null);
  const [licenseKeyInput, setLicenseKeyInput] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isActivating, setIsActivating] = useState<boolean>(false);
  const [isRequestingTrial, setIsRequestingTrial] = useState<boolean>(false);
  const [isWebDemo, setIsWebDemo] = useState<boolean>(false);

  // Settings configuration states
  const [dashboardUrl, setDashboardUrl] = useState<string>('https://adminphotomanagement.vercel.app');
  const [dashboardUrlInput, setDashboardUrlInput] = useState<string>('https://adminphotomanagement.vercel.app');
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [urlSaveSuccess, setUrlSaveSuccess] = useState<boolean>(false);

  // Connection status tracking
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'checking' | 'unconfigured'>('checking');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const hasAutoShownSettings = useRef(false); // Prevent re-opening settings every poll cycle

  const checkStatus = async () => {
    // 1. Check if running in browser (non-Electron environment)
    if (typeof window === 'undefined' || !window.electronAPI) {
      setIsWebDemo(true);
      setConnectionStatus('disconnected');
      setLicenseState({
        isValid: true,
        isLoading: false,
        type: 'LICENSE',
        status: 'VALID',
        expiryDate: 'Developer Web Session Expiry: Unlimited',
        daysRemaining: 365,
        error: undefined,
      });
      return;
    }

    try {
      // 2. Fetch machineId
      const uuid = await window.electronAPI.getMachineId();
      setMachineId(uuid);

      // Load active dashboardUrl
      let activeUrl = 'http://localhost:3001';
      if (window.electronAPI.getDashboardUrl) {
        activeUrl = await window.electronAPI.getDashboardUrl();
      }
      setDashboardUrl(activeUrl);

      // Check if dashboard URL has been explicitly configured by the user
      let isDashConfigured = false;
      if (window.electronAPI.isDashboardConfigured) {
        const configResult = await window.electronAPI.isDashboardConfigured();
        isDashConfigured = configResult.configured;
      }

      const isDefaultUrl = activeUrl === 'https://adminphotomanagement.vercel.app' || activeUrl === 'http://localhost:3001';
      const shouldCheckOnline = isDashConfigured || !isDefaultUrl;

      // 3. Online Check-in with Remote Dashboard / Supabase API
      let serverStatus: 'ACTIVE' | 'PAUSED' | 'STOPPED' | 'DELETED' | 'NONE' = 'NONE';
      let serverKey: string | null = null;
      let connectionSucceeded = false;
      
      if (shouldCheckOnline) {
        setConnectionStatus('checking');
        try {
          const checkUrl = `${activeUrl}/api/license/status?machineId=${encodeURIComponent(uuid)}`;
          
          // Increased timeout to 8s for deployed dashboards (Vercel cold start can be slow)
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          
          const response = await fetch(checkUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          connectionSucceeded = true;
          
          let resData: any = null;
          try {
            resData = await response.json();
          } catch (e) {}

          if (response.ok && resData && resData.success) {
            serverStatus = resData.status || 'ACTIVE';
            setRemoteStatus(serverStatus);
            serverKey = resData.licenseKey || null;

            // Auto-update / Auto-renew: save updated key locally if active and changed
            if (serverStatus === 'ACTIVE' && serverKey) {
              await window.electronAPI.licenseActivate(serverKey);
            }
          } else if (resData && resData.status === 'DELETED') {
            serverStatus = 'DELETED';
            setRemoteStatus('DELETED');
          } else if (response.status === 404) {
            // Record deleted from dashboard — this machine is no longer registered
            serverStatus = 'DELETED';
            setRemoteStatus('DELETED');
          } else {
            // Unexpected response but connection worked
            setRemoteStatus('ACTIVE');
          }

          setConnectionStatus('connected');
          setLastSyncTime(new Date().toLocaleTimeString());
          
          // Record successful sync timestamp locally to refresh offline grace window
          if (window.electronAPI && window.electronAPI.recordSync) {
            await window.electronAPI.recordSync();
          }
        } catch (err) {
          console.warn('Dashboard connection failed:', err);
          setConnectionStatus('disconnected');
        }
      } else {
        setConnectionStatus('unconfigured');
      }

      // 4. If remote status blocks client, lock the dashboard
      if (serverStatus === 'PAUSED' || serverStatus === 'STOPPED' || serverStatus === 'DELETED') {
        if (serverStatus === 'DELETED') {
          // Clear all local registry license keys to prevent offline bypass
          await window.electronAPI.licenseWipe();
        }

        setLicenseState({
          isValid: false,
          isLoading: false,
          type: 'LICENSE',
          status: 'EXPIRED',
          expiryDate: undefined,
          daysRemaining: 0,
          error: serverStatus === 'DELETED'
            ? 'This Machine ID is not registered or has been deleted from the database.'
            : `Access blocked by administrator. License status is currently ${serverStatus}.`,
        });
        return;
      }

      // 5. Query local decrypted configuration verification
      const localResult = await window.electronAPI.licenseCheck();
      
      setLicenseState({
        isValid: localResult.status === 'VALID',
        isLoading: false,
        type: localResult.type || 'NONE',
        status: localResult.status,
        expiryDate: localResult.expiryDate,
        daysRemaining: localResult.daysRemaining,
        error: localResult.error,
      });
    } catch (err: any) {
      console.error('Fatal licensing licensing validation check failure:', err);
      setLicenseState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Critical hardware license system initialization failure.'
      }));
    }
  };

  const handleSaveDashboardUrl = async () => {
    if (!window.electronAPI || !window.electronAPI.saveDashboardUrl) return;
    try {
      const result = await window.electronAPI.saveDashboardUrl(dashboardUrlInput.trim());
      if (result.success) {
        setUrlSaveSuccess(true);
        setDashboardUrl(dashboardUrlInput.trim());
        setTimeout(() => setUrlSaveSuccess(false), 2000);
        await checkStatus();
      } else {
        alert(result.error || 'Failed to save dashboard URL.');
      }
    } catch (e) {
      console.error(e);
      alert('Error saving dashboard URL.');
    }
  };

  const activateKey = async (key: string) => {
    if (!window.electronAPI) return false;
    setIsActivating(true);
    setActivationError(null);
    setActivationSuccess(null);

    try {
      const result = await window.electronAPI.licenseActivate(key);
      if (result.success) {
        setActivationSuccess(`Activation successful! License expires: ${new Date(result.expiryDate!).toLocaleDateString()}`);
        setLicenseKeyInput('');
        await checkStatus();
        setIsActivating(false);
        return true;
      } else {
        setActivationError(result.error || 'Failed to activate license.');
        setIsActivating(false);
        return false;
      }
    } catch (err: any) {
      setActivationError('Activation verification failed.');
      setIsActivating(false);
      return false;
    }
  };

  const requestTrial = async () => {
    if (!window.electronAPI) return false;
    setIsRequestingTrial(true);
    setActivationError(null);
    setActivationSuccess(null);

    try {
      const result = await window.electronAPI.licenseRequestTrial();
      if (result.success) {
        setActivationSuccess('7-Day Trial activated successfully!');
        await checkStatus();
        setIsRequestingTrial(false);
        return true;
      } else {
        setActivationError(result.error || 'Trial activation rejected.');
        setIsRequestingTrial(false);
        return false;
      }
    } catch (err: any) {
      setActivationError('Failed to initialize local trial registry.');
      setIsRequestingTrial(false);
      return false;
    }
  };

  useEffect(() => {
    checkStatus();

    // Check status when browser/desktop app goes online
    const handleOnline = () => {
      console.log('App came online, verifying status with remote registry...');
      checkStatus();
    };

    window.addEventListener('online', handleOnline);

    // Setup polling every 30 seconds for faster sync response
    const interval = setInterval(() => {
      checkStatus();
    }, 30000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  useEffect(() => {
    setDashboardUrlInput(dashboardUrl);
  }, [dashboardUrl]);

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
          Decrypting secure biometric console...
        </p>
      </div>
    );
  }

  // If valid, render normal application
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
          connection: { status: connectionStatus, lastSyncTime },
          openLicenseSettings: () => setShowSettings(true),
        }}
      >
        {/* Demo / sync status now lives in the app header (app/page.tsx) so it
            no longer floats over the toolbar and the Start-over button. */}

        {/* Modal Settings Overlay when settings is opened inside the valid app */}
        {showSettings && !isWebDemo && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[10000] flex items-center justify-center p-4 animate-fadeIn">
            <div className="w-full max-w-lg bg-[#161b22] border border-neutral-800 rounded-3xl p-6 md:p-8 shadow-2xl relative space-y-6 text-white font-sans">
              <button
                onClick={() => setShowSettings(false)}
                className="absolute top-6 right-6 w-8 h-8 rounded-lg border border-neutral-800 bg-[#161b22]/50 hover:bg-[#21262d] text-neutral-400 hover:text-white transition-all flex items-center justify-center cursor-pointer"
              >
                <FiX className="w-4 h-4" />
              </button>

              <div className="text-center space-y-2">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/10">
                  <FiGlobe className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-[22px] font-extrabold tracking-tight text-white mt-4">
                  Dashboard Connection
                </h2>
                <p className="text-[10px] tracking-widest text-indigo-400 font-black uppercase">
                  Configure Sync Endpoint URL
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-0.5">
                    Admin Dashboard URL
                  </label>
                  <input
                    type="text"
                    value={dashboardUrlInput}
                    onChange={(e) => setDashboardUrlInput(e.target.value)}
                    placeholder="http://localhost:3001 or https://..."
                    className="w-full bg-[#0d1117] border border-neutral-800 focus:border-indigo-500 text-neutral-200 text-xs font-mono rounded-xl px-4 py-3 outline-none transition-colors placeholder:text-neutral-600"
                  />
                  <p className="text-[10px] text-neutral-500 font-semibold pl-0.5 mt-1 leading-relaxed">
                    The desktop app will sync subscription blocks (Pause, Stop, Delete) from this URL.
                  </p>
                </div>

                {/* Live connection status indicator */}
                <div className={`p-2.5 rounded-xl text-[11px] font-bold flex items-center gap-2 ${
                  connectionStatus === 'connected'
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    : connectionStatus === 'unconfigured'
                    ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
                    : connectionStatus === 'checking'
                    ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
                    : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                }`}>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    connectionStatus === 'connected' ? 'bg-emerald-400'
                    : connectionStatus === 'unconfigured' ? 'bg-amber-400'
                    : connectionStatus === 'checking' ? 'bg-blue-400 animate-pulse'
                    : 'bg-rose-400'
                  }`} />
                  <span>
                    {connectionStatus === 'connected' 
                      ? `Connected to dashboard${lastSyncTime ? ` · Last sync: ${lastSyncTime}` : ''}`
                      : connectionStatus === 'unconfigured'
                      ? 'Dashboard URL not configured — enter your deployed admin URL above'
                      : connectionStatus === 'checking'
                      ? 'Checking connection...'
                      : 'Cannot reach dashboard — verify the URL is correct and the dashboard is online'}
                  </span>
                </div>

                {urlSaveSuccess && (
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold flex items-center gap-2">
                    <FiCheck className="w-4 h-4 shrink-0 text-emerald-500" />
                    <span>Dashboard URL saved successfully! Checking status...</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleSaveDashboardUrl}
                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-indigo-500/5 active:scale-98 flex items-center justify-center gap-1.5"
                  >
                    <FiSave className="w-4 h-4" />
                    <span>Save Configuration</span>
                  </button>
                  <button
                    onClick={() => setShowSettings(false)}
                    className="py-3 px-4 rounded-xl border border-neutral-800 hover:border-neutral-700 bg-[#21262d] text-neutral-300 hover:text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>Close</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {children}
      </LicenseContext.Provider>
    );
  }

  // Otherwise, render Premium Lock Screen
  return (
    <div className="h-screen w-screen bg-[#0d1117] text-white flex items-center justify-center p-4 relative font-sans select-none overflow-hidden">
      {/* Settings Gear Button in Top-Right Corner */}
      {window.electronAPI && (
        <button
          onClick={() => setShowSettings(!showSettings)}
          title="Configure Admin Dashboard URL"
          className="absolute top-6 right-6 w-10 h-10 rounded-xl border border-neutral-800 bg-[#161b22]/50 hover:bg-[#21262d] text-neutral-400 hover:text-white transition-all flex items-center justify-center cursor-pointer z-50 animate-fadeIn"
        >
          {showSettings ? <FiX className="w-5 h-5" /> : <FiSettings className="w-5 h-5" />}
        </button>
      )}

      {/* Dynamic Background Glowing Orbs */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-amber-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[450px] h-[450px] rounded-full bg-orange-600/5 blur-[150px] pointer-events-none" />

      {showSettings ? (
        <div className="w-full max-w-lg bg-[#161b22]/70 border border-neutral-800 rounded-3xl p-6 md:p-8 backdrop-blur-xl shadow-2xl relative z-10 space-y-6 animate-fadeIn">
          <div className="text-center space-y-2">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/10">
              <FiGlobe className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-[22px] font-extrabold tracking-tight text-white mt-4">
              Dashboard Connection
            </h2>
            <p className="text-[10px] tracking-widest text-indigo-400 font-black uppercase">
              Configure Sync Endpoint URL
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-0.5">
                Admin Dashboard URL
              </label>
              <input
                type="text"
                value={dashboardUrlInput}
                onChange={(e) => setDashboardUrlInput(e.target.value)}
                placeholder="http://localhost:3001 or https://..."
                className="w-full bg-[#0d1117] border border-neutral-800 focus:border-indigo-500 text-neutral-200 text-xs font-mono rounded-xl px-4 py-3 outline-none transition-colors placeholder:text-neutral-600"
              />
              <p className="text-[10px] text-neutral-500 font-semibold pl-0.5 mt-1 leading-relaxed">
                The desktop app will sync subscription blocks (Pause, Stop, Delete) from this URL.
              </p>
            </div>

            {/* Live connection status indicator */}
            <div className={`p-2.5 rounded-xl text-[11px] font-bold flex items-center gap-2 ${
              connectionStatus === 'connected'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                : connectionStatus === 'unconfigured'
                ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
                : connectionStatus === 'checking'
                ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400'
                : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
            }`}>
              <div className={`w-2 h-2 rounded-full shrink-0 ${
                connectionStatus === 'connected' ? 'bg-emerald-400'
                : connectionStatus === 'unconfigured' ? 'bg-amber-400'
                : connectionStatus === 'checking' ? 'bg-blue-400 animate-pulse'
                : 'bg-rose-400'
              }`} />
              <span>
                {connectionStatus === 'connected' 
                  ? `Connected to dashboard${lastSyncTime ? ` · Last sync: ${lastSyncTime}` : ''}`
                  : connectionStatus === 'unconfigured'
                  ? 'Dashboard URL not configured — enter your deployed admin URL above'
                  : connectionStatus === 'checking'
                  ? 'Checking connection...'
                  : 'Cannot reach dashboard — verify the URL is correct and the dashboard is online'}
              </span>
            </div>

            {urlSaveSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold flex items-center gap-2">
                <FiCheck className="w-4 h-4 shrink-0 text-emerald-500" />
                <span>Dashboard URL saved successfully! Checking status...</span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleSaveDashboardUrl}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-indigo-500/5 active:scale-98 flex items-center justify-center gap-1.5"
              >
                <FiSave className="w-4 h-4" />
                <span>Save Configuration</span>
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="py-3 px-4 rounded-xl border border-neutral-800 hover:border-neutral-700 bg-[#21262d] text-neutral-300 hover:text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Close</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full max-w-lg bg-[#161b22]/70 border border-neutral-800 rounded-3xl p-6 md:p-8 backdrop-blur-xl shadow-2xl relative z-10 space-y-6">
          
          {/* Header Logo */}
          <div className="text-center space-y-2">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/10">
              <FiLock className="w-6 h-6 text-black" />
            </div>
            <h2 className="text-[22px] font-extrabold tracking-tight text-white mt-4">
              Precision ID Studio
            </h2>
            <p className="text-[10px] tracking-widest text-amber-500/80 font-black uppercase">
              Biometric Security Console Lock
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
                 'Enter a valid AES cryptographically-signed license key to activate the offline biometric photo creator console.'}
              </p>
            </div>
          </div>

          {/* Machine ID Box */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-0.5">
              Your Device Machine ID
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
              <label className="text-[10px] font-black text-neutral-400 uppercase tracking-widest pl-0.5">
                Enter License Key
              </label>
              <input
                type="text"
                value={licenseKeyInput}
                onChange={(e) => setLicenseKeyInput(e.target.value)}
                disabled={isActivating || remoteStatus === 'PAUSED' || remoteStatus === 'STOPPED'}
                placeholder="PASTE 256-BIT CRYPTO KEY..."
                className="w-full bg-[#0d1117] border border-neutral-800 focus:border-amber-500 text-neutral-200 text-xs font-mono rounded-xl px-4 py-3 outline-none transition-colors placeholder:text-neutral-600 disabled:opacity-50"
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
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-40 text-black text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-amber-500/5 active:scale-98 flex items-center justify-center gap-1.5"
              >
                {isActivating ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    <span>Verifying key...</span>
                  </>
                ) : (
                  <>
                    <FiUnlock className="w-4 h-4" />
                    <span>Activate Software</span>
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
      )}
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
