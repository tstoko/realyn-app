
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Hotel, PSPIntegration, PMSIntegration, OperaCloudIntegration } from '@realyn/shared';
import { Spinner } from '@realyn/shared';
import { testStripeConnection, testAdyenConnection } from '../../services/pspService';
import { testOperaCloudConnection } from '../../services/operaCloudService';
import { uploadCSVForImport, getImportHistory, type ImportResult, type ImportRecord } from '../../services/pmsImportService';

export interface PspCredentials {
  stripe?: { secretKey: string; webhookSecret: string; merchantAccountId?: string };
  adyen?: { apiKey?: string; merchantAccounts: string[]; webhookUsername?: string; webhookPassword?: string; liveEndpointPrefix?: string };
}

export interface OperaCloudCredentials {
  oauthClientSecret: string;
  appKey: string;
  integrationPassword?: string;
}

const inputBaseStyle = "block w-full text-sm rounded-lg bg-slate-800 border-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-600";
const darkTextInputStyle = `${inputBaseStyle} px-3 py-2`;
const darkSelectStyle = `${inputBaseStyle} pl-3 pr-10 py-2`;

export interface IntegrationsTabProps {
  formData: Hotel;
  setFormData: React.Dispatch<React.SetStateAction<Hotel>>;
  onPspCredentialsChange?: (credentials: PspCredentials | null) => void;
  onGetPspCredentialsRef?: (getter: () => PspCredentials | null) => void;
  onOperaCloudCredentialsChange?: (credentials: OperaCloudCredentials | null) => void;
  onGetOperaCloudCredentialsRef?: (getter: () => OperaCloudCredentials | null) => void;
  isAdmin?: boolean;
}

export const IntegrationsTab: React.FC<IntegrationsTabProps> = ({ formData, setFormData, onPspCredentialsChange, onGetPspCredentialsRef, onOperaCloudCredentialsChange, onGetOperaCloudCredentialsRef, isAdmin = false }) => {
    const [stripeSecretKey, setStripeSecretKey] = useState('');
    const [stripeWebhookSecret, setStripeWebhookSecret] = useState('');
    const [stripeMerchantAccountId, setStripeMerchantAccountId] = useState('');
    const [adyenApiKey, setAdyenApiKey] = useState('');
    const [adyenMerchantAccounts, setAdyenMerchantAccounts] = useState<string[]>([]);
    const [newMerchantAccount, setNewMerchantAccount] = useState('');
    const [adyenWebhookUsername, setAdyenWebhookUsername] = useState('');
    const [adyenWebhookPassword, setAdyenWebhookPassword] = useState('');
    const [adyenLiveEndpointPrefix, setAdyenLiveEndpointPrefix] = useState('');
    const [isTestingPspConnection, setIsTestingPspConnection] = useState(false);
    const [pspConnectionTestMessage, setPspConnectionTestMessage] = useState<string | null>(null);
    
    const detectAdyenEnvironment = (apiKey: string): "TEST" | "LIVE" | "UNKNOWN" => {
        if (!apiKey || apiKey.trim() === '') return "UNKNOWN";
        if (apiKey.startsWith("test_")) return "TEST";
        if (apiKey.startsWith("live_")) return "LIVE";
        
        const isLikelyLiveKey = apiKey.length > 100 && 
                                apiKey.includes("==") && 
                                apiKey.includes("-");
        
        return isLikelyLiveKey ? "LIVE" : "UNKNOWN";
    };
    
    const detectedEnvironment = detectAdyenEnvironment(adyenApiKey);
    
    const handlePspChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const type = e.target.value as PSPIntegration['type'];
        setFormData(prev => ({...prev, integrations: {...prev.integrations, psp: {...prev.integrations.psp, type}}}));
    };

    useEffect(() => {
        if (formData.stripeSecretKey || formData.stripeWebhookSecret) {
            setStripeSecretKey('');
            setStripeWebhookSecret('');
            setStripeMerchantAccountId(formData.stripeMerchantAccountId || '');
        } else {
            setStripeSecretKey('');
            setStripeWebhookSecret('');
            setStripeMerchantAccountId('');
        }
        
        if (formData.adyenApiKey || formData.adyenMerchantAccount || (formData.adyenMerchantAccounts && formData.adyenMerchantAccounts.length > 0)) {
            setAdyenApiKey('');
            setAdyenWebhookUsername('');
            setAdyenWebhookPassword('');
            setAdyenLiveEndpointPrefix(formData.adyenLiveEndpointPrefix || '');
            if (formData.adyenMerchantAccounts && formData.adyenMerchantAccounts.length > 0) {
                setAdyenMerchantAccounts([...formData.adyenMerchantAccounts]);
            } else if (formData.adyenMerchantAccount) {
                setAdyenMerchantAccounts([formData.adyenMerchantAccount]);
            } else {
                setAdyenMerchantAccounts([]);
            }
        } else {
            setAdyenApiKey('');
            setAdyenMerchantAccounts([]);
            setAdyenWebhookUsername('');
            setAdyenWebhookPassword('');
            setAdyenLiveEndpointPrefix('');
        }
        
    }, [formData.id]); // eslint-disable-line react-hooks/exhaustive-deps
    
    useEffect(() => {
        if (formData.integrations.psp.type === 'stripe') {
            if (stripeSecretKey && stripeWebhookSecret && 
                stripeSecretKey.trim() !== '' && stripeWebhookSecret.trim() !== '') {
                onPspCredentialsChange?.({
                    stripe: {
                        secretKey: stripeSecretKey,
                        webhookSecret: stripeWebhookSecret,
                        merchantAccountId: stripeMerchantAccountId || undefined,
                    }
                });
            }
            } else if (formData.integrations.psp.type === 'adyen') {
                if (adyenMerchantAccounts.length > 0) {
                    if ((adyenApiKey && adyenApiKey.trim() !== '') || 
                        (adyenWebhookUsername && adyenWebhookUsername.trim() !== '') || 
                        (adyenWebhookPassword && adyenWebhookPassword.trim() !== '')) {
                        onPspCredentialsChange?.({
                            adyen: {
                                apiKey: adyenApiKey || undefined,
                                merchantAccounts: adyenMerchantAccounts,
                                webhookUsername: adyenWebhookUsername || undefined,
                                webhookPassword: adyenWebhookPassword || undefined,
                                liveEndpointPrefix: adyenLiveEndpointPrefix || undefined,
                            }
                        });
                    } else {
                        onPspCredentialsChange?.({
                            adyen: {
                                apiKey: undefined,
                                merchantAccounts: adyenMerchantAccounts,
                                webhookUsername: undefined,
                                webhookPassword: undefined,
                                liveEndpointPrefix: adyenLiveEndpointPrefix || undefined,
                            }
                        });
                    }
                } else if (adyenApiKey && adyenMerchantAccounts.length > 0 && adyenWebhookUsername && adyenWebhookPassword &&
                    adyenApiKey.trim() !== '' && adyenWebhookUsername.trim() !== '' && adyenWebhookPassword.trim() !== '') {
                    onPspCredentialsChange?.({
                        adyen: {
                            apiKey: adyenApiKey,
                            merchantAccounts: adyenMerchantAccounts,
                            webhookUsername: adyenWebhookUsername,
                            webhookPassword: adyenWebhookPassword,
                            liveEndpointPrefix: adyenLiveEndpointPrefix || undefined,
                        }
                    });
                }
        } else if (formData.integrations.psp.type === 'none') {
            onPspCredentialsChange?.(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stripeSecretKey, stripeWebhookSecret, stripeMerchantAccountId, adyenApiKey, adyenMerchantAccounts, adyenWebhookUsername, adyenWebhookPassword, adyenLiveEndpointPrefix, formData.integrations.psp.type]);

    useEffect(() => {
        const getCurrentPspCredentials = (): PspCredentials | null => {
            if (formData.integrations.psp.type === 'stripe') {
                if (stripeSecretKey && stripeWebhookSecret && 
                    stripeSecretKey.trim() !== '' && stripeWebhookSecret.trim() !== '') {
                    return {
                        stripe: {
                            secretKey: stripeSecretKey,
                            webhookSecret: stripeWebhookSecret,
                            merchantAccountId: stripeMerchantAccountId || undefined,
                        }
                    };
                }
            } else if (formData.integrations.psp.type === 'adyen') {
                if (adyenMerchantAccounts.length > 0) {
                    return {
                        adyen: {
                            apiKey: (adyenApiKey && adyenApiKey.trim() !== '') ? adyenApiKey : undefined,
                            merchantAccounts: adyenMerchantAccounts,
                            webhookUsername: (adyenWebhookUsername && adyenWebhookUsername.trim() !== '') ? adyenWebhookUsername : undefined,
                            webhookPassword: (adyenWebhookPassword && adyenWebhookPassword.trim() !== '') ? adyenWebhookPassword : undefined,
                            liveEndpointPrefix: adyenLiveEndpointPrefix || undefined,
                        }
                    };
                }
            }
            return null;
        };
        
        onGetPspCredentialsRef?.(getCurrentPspCredentials);
    }, [stripeSecretKey, stripeWebhookSecret, stripeMerchantAccountId, adyenApiKey, adyenMerchantAccounts, adyenWebhookUsername, adyenWebhookPassword, adyenLiveEndpointPrefix, formData.integrations.psp.type, onGetPspCredentialsRef]);

    const testPspConnection = async () => {
        if (formData.integrations.psp.type === 'none') {
            return;
        }
        
        setIsTestingPspConnection(true);
        setPspConnectionTestMessage(null);
        
        try {
            if (formData.integrations.psp.type === 'stripe') {
                if (!stripeSecretKey || !stripeWebhookSecret || stripeSecretKey.trim() === '' || stripeWebhookSecret.trim() === '') {
                    setPspConnectionTestMessage('Please enter credentials to test. Existing credentials cannot be tested.');
                    setIsTestingPspConnection(false);
                    return;
                }
            } else if (formData.integrations.psp.type === 'adyen') {
                if (!adyenApiKey || adyenMerchantAccounts.length === 0 || !adyenWebhookUsername || !adyenWebhookPassword || 
                    adyenApiKey.trim() === '' || adyenWebhookUsername.trim() === '' || adyenWebhookPassword.trim() === '') {
                    setPspConnectionTestMessage('Please enter credentials to test. Existing credentials cannot be tested.');
                    setIsTestingPspConnection(false);
                    return;
                }
            }
            
            let result;
            
            if (formData.integrations.psp.type === 'stripe') {
                result = await testStripeConnection({
                    secretKey: stripeSecretKey,
                    webhookSecret: stripeWebhookSecret,
                    merchantAccountId: stripeMerchantAccountId,
                });
            } else if (formData.integrations.psp.type === 'adyen') {
                result = await testAdyenConnection({
                    apiKey: adyenApiKey,
                    merchantAccounts: adyenMerchantAccounts,
                    webhookUsername: adyenWebhookUsername,
                    webhookPassword: adyenWebhookPassword,
                    liveEndpointPrefix: adyenLiveEndpointPrefix || undefined,
                });
            } else {
                return;
            }
            
            if (result.success) {
                setFormData(prev => ({ 
                    ...prev, 
                    integrations: { 
                        ...prev.integrations, 
                        psp: {
                            ...prev.integrations.psp, 
                            status: 'connected'
                        }
                    }
                }));
                setPspConnectionTestMessage(result.message);
            } else {
                setFormData(prev => ({ 
                    ...prev, 
                    integrations: { 
                        ...prev.integrations, 
                        psp: {
                            ...prev.integrations.psp, 
                            status: 'error'
                        }
                    }
                }));
                setPspConnectionTestMessage(result.message);
            }
        } catch (error: any) {
            setFormData(prev => ({ 
                ...prev, 
                integrations: { 
                    ...prev.integrations, 
                    psp: {
                        ...prev.integrations.psp, 
                        status: 'error'
                    }
                }
            }));
            setPspConnectionTestMessage(`Connection test failed: ${error.message}`);
        } finally {
            setIsTestingPspConnection(false);
        }
    };

    const StatusPill: React.FC<{ status: 'connected' | 'not_connected' | 'error' }> = ({ status }) => {
        const styles = {
            connected: 'bg-green-900/50 text-green-300',
            not_connected: 'bg-slate-700 text-slate-300',
            error: 'bg-red-900/50 text-red-300'
        };
        return <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${styles[status]}`}>{status.replace('_', ' ')}</span>;
    };

    return (
        <div className="space-y-6">
            <div className="p-4 border border-slate-800 rounded-lg">
                <h4 className="font-semibold text-slate-50 font-heading">Payment Provider (PSP)</h4>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    <div>
                        <label htmlFor="psp-type" className="block text-sm font-medium text-slate-400">Provider</label>
                        <select id="psp-type" value={formData.integrations.psp.type} onChange={handlePspChange} className={`mt-1 ${darkSelectStyle} capitalize`}>
                            <option value="none">None</option>
                            <option value="stripe">Stripe</option>
                            <option value="adyen">Adyen</option>
                        </select>
                    </div>
                    <div className="flex items-center space-x-4 mt-2">
                        <span className="text-sm font-medium text-slate-400">Status:</span>
                        <StatusPill status={formData.integrations.psp.status} />
                        {isAdmin && (
                            <button 
                                onClick={testPspConnection} 
                                disabled={isTestingPspConnection || formData.integrations.psp.type === 'none'}
                                className="text-sm font-medium text-cyan-500 hover:underline disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isTestingPspConnection && <Spinner />}
                                Test Connection
                            </button>
                        )}
                    </div>
                </div>
                
                {formData.integrations.psp.type === 'stripe' && (
                    <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
                        <div className="p-3 bg-blue-900/20 border border-blue-800 rounded-md mb-3">
                            <p className="text-sm text-blue-300 font-medium mb-2">
                                Setup Instructions:
                            </p>
                            <ol className="text-xs text-blue-200 space-y-1 list-decimal list-inside">
                                <li>Create a <strong>Restricted API Key</strong> in <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer" className="underline">Stripe Dashboard &rarr; API Keys</a></li>
                                <li>Permissions needed: <code className="bg-slate-800 px-1 rounded">disputes:read</code>, <code className="bg-slate-800 px-1 rounded">payment_intents:read</code></li>
                                <li>Copy the <strong>Restricted key</strong> (starts with <code className="bg-slate-800 px-1 rounded">rk_</code>)</li>
                                <li>Go to <a href="https://dashboard.stripe.com/webhooks" target="_blank" rel="noopener noreferrer" className="underline">Stripe Dashboard &rarr; Webhooks</a></li>
                                <li>Click "Add endpoint"</li>
                                <li>Set URL: <code className="bg-slate-800 px-1 rounded">https://stripewebhook-cltbxmmndq-uc.a.run.app</code></li>
                                <li>Select events: <code className="bg-slate-800 px-1 rounded">charge.dispute.created</code>, <code className="bg-slate-800 px-1 rounded">charge.dispute.updated</code>, <code className="bg-slate-800 px-1 rounded">charge.dispute.closed</code></li>
                                <li>Copy the <strong>Signing secret</strong> (starts with <code className="bg-slate-800 px-1 rounded">whsec_</code>)</li>
                            </ol>
                        </div>
                        
                        <div>
                            <label htmlFor="stripe-secret-key" className="block text-sm font-medium text-slate-400">
                                Restricted API Key (Secret Key)
                            </label>
                            <input
                                type="password"
                                id="stripe-secret-key"
                                value={stripeSecretKey}
                                onChange={(e) => setStripeSecretKey(e.target.value)}
                                placeholder="rk_live_... or rk_test_..."
                                className={`mt-1 ${darkTextInputStyle}`}
                            />
                            <p className="mt-1 text-xs text-slate-500">
                                {formData.stripeSecretKey ? (
                                    <>Existing key is saved. Leave empty to keep it, or enter a new key to update.</>
                                ) : (
                                    <>Create a restricted key with <code className="bg-slate-800 px-1 rounded">disputes:read</code> and <code className="bg-slate-800 px-1 rounded">payment_intents:read</code> permissions</>
                                )}
                            </p>
                        </div>
                        
                        <div>
                            <label htmlFor="stripe-webhook-secret" className="block text-sm font-medium text-slate-400">
                                Webhook Signing Secret
                            </label>
                            <input
                                type="password"
                                id="stripe-webhook-secret"
                                value={stripeWebhookSecret}
                                onChange={(e) => setStripeWebhookSecret(e.target.value)}
                                placeholder="whsec_..."
                                className={`mt-1 ${darkTextInputStyle}`}
                            />
                            <p className="mt-1 text-xs text-slate-500">
                                {formData.stripeWebhookSecret ? (
                                    <>Existing secret is saved. Leave empty to keep it, or enter a new secret to update.</>
                                ) : (
                                    <>Get this from the webhook endpoint you created in Stripe Dashboard</>
                                )}
                            </p>
                        </div>
                        
                        <div>
                            <label htmlFor="stripe-merchant-account-id" className="block text-sm font-medium text-slate-400">
                                Merchant Account ID (Optional)
                            </label>
                            <input
                                type="text"
                                id="stripe-merchant-account-id"
                                value={stripeMerchantAccountId}
                                onChange={(e) => setStripeMerchantAccountId(e.target.value)}
                                placeholder="acct_..."
                                className={`mt-1 ${darkTextInputStyle}`}
                            />
                        </div>
                        
                        {pspConnectionTestMessage && (
                            <div className={`text-sm ${formData.integrations.psp.status === 'connected' ? 'text-green-400' : 'text-red-400'}`}>
                                {pspConnectionTestMessage}
                            </div>
                        )}
                    </div>
                )}
                
                {formData.integrations.psp.type === 'adyen' && (
                    <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
                        <div className="p-3 bg-cyan-900/20 border border-cyan-800 rounded-md mb-3">
                            <p className="text-sm text-cyan-300 font-medium mb-2">
                                Adyen TEST Environment Setup:
                            </p>
                            <ol className="text-xs text-cyan-200 space-y-1 list-decimal list-inside ml-2">
                                <li>Go to <a href="https://ca-test.adyen.com" target="_blank" rel="noopener noreferrer" className="underline text-cyan-400">Adyen TEST Customer Area</a></li>
                                <li>Navigate to <strong>Developers &rarr; API credentials</strong></li>
                                <li>Create/select API credential and enable <strong>ONLY</strong> <code className="bg-slate-800 px-1 rounded">API dispute management</code> permission</li>
                                <li>Copy the <strong>TEST API key</strong> (must start with <code className="bg-slate-800 px-1 rounded">test_</code>) - copy the ENTIRE key!</li>
                                <li>Go to <strong>Account &rarr; Merchant accounts</strong> and copy your merchant account codes exactly (case-sensitive)</li>
                                <li>Go to <strong>Developers &rarr; Webhooks</strong> and create webhook with URL: <code className="bg-slate-800 px-1 rounded">https://us-central1-realyn-app.cloudfunctions.net/adyenWebhook</code></li>
                                <li>Set webhook username and password for authentication</li>
                            </ol>
                            <p className="text-xs text-cyan-300 mt-2 font-medium">
                                Tip: Only "API dispute management" permission is needed - no other permissions required!
                            </p>
                        </div>
                        <div>
                            <label htmlFor="adyen-api-key" className="block text-sm font-medium text-slate-400">
                                API Key
                                {detectedEnvironment !== "UNKNOWN" && (
                                    <span className={`ml-2 px-2 py-0.5 text-xs font-semibold rounded-full ${
                                        detectedEnvironment === "TEST" 
                                            ? "bg-green-900/50 text-green-300" 
                                            : "bg-yellow-900/50 text-yellow-300"
                                    }`}>
                                        {detectedEnvironment} Environment
                                    </span>
                                )}
                            </label>
                            <input
                                type="password"
                                id="adyen-api-key"
                                value={adyenApiKey}
                                onChange={(e) => setAdyenApiKey(e.target.value)}
                                placeholder="Enter Adyen API Key (test_... for TEST, or long key for LIVE)"
                                className={`mt-1 ${darkTextInputStyle}`}
                            />
                            {detectedEnvironment === "LIVE" && (
                                <div className="mt-1.5 p-2 bg-yellow-900/20 border border-yellow-800 rounded">
                                    <p className="text-xs text-yellow-300">
                                        <strong>LIVE API Key Detected:</strong> This appears to be a LIVE environment key. Make sure you're using the correct environment. For TEST mode, use a key that starts with <code className="bg-slate-800 px-1 rounded">test_</code>.
                                    </p>
                                </div>
                            )}
                            {detectedEnvironment === "TEST" && (
                                <p className="mt-1 text-xs text-green-400">
                                    TEST environment detected. Perfect for testing!
                                </p>
                            )}
                            {detectedEnvironment === "UNKNOWN" && adyenApiKey && (
                                <p className="mt-1 text-xs text-slate-500">
                                    Enter a TEST key (starts with <code className="bg-slate-800 px-1 rounded">test_</code>) or a LIVE key (long format with == and -).
                                </p>
                            )}
                            {formData.adyenApiKey && !adyenApiKey && (
                                <p className="mt-1 text-xs text-slate-500">
                                    Existing key is saved. Leave empty to keep it, or enter a new key to update.
                                </p>
                            )}
                        </div>
                        <div>
                            <label htmlFor="adyen-merchant-accounts" className="block text-sm font-medium text-slate-400">
                                Merchant Accounts
                            </label>
                            <div className="mt-1 space-y-2">
                                {adyenMerchantAccounts.map((account, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={account}
                                            onChange={(e) => {
                                                const updated = [...adyenMerchantAccounts];
                                                updated[index] = e.target.value;
                                                setAdyenMerchantAccounts(updated);
                                            }}
                                            placeholder="Merchant Account"
                                            className={`flex-1 ${darkTextInputStyle}`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setAdyenMerchantAccounts(adyenMerchantAccounts.filter((_, i) => i !== index));
                                            }}
                                            className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 border border-red-800 rounded hover:bg-red-900/20"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={newMerchantAccount}
                                        onChange={(e) => setNewMerchantAccount(e.target.value)}
                                        placeholder="Add Merchant Account"
                                        className={`flex-1 ${darkTextInputStyle}`}
                                        onKeyPress={(e) => {
                                            if (e.key === 'Enter' && newMerchantAccount.trim()) {
                                                e.preventDefault();
                                                setAdyenMerchantAccounts([...adyenMerchantAccounts, newMerchantAccount.trim()]);
                                                setNewMerchantAccount('');
                                            }
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (newMerchantAccount.trim()) {
                                                setAdyenMerchantAccounts([...adyenMerchantAccounts, newMerchantAccount.trim()]);
                                                setNewMerchantAccount('');
                                            }
                                        }}
                                        className="px-3 py-1.5 text-sm text-cyan-400 hover:text-cyan-300 border border-cyan-800 rounded hover:bg-cyan-900/20"
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                                You can add multiple merchant accounts for this account. All will be associated with this organization.
                            </p>
                        </div>
                        <div>
                            <label htmlFor="adyen-webhook-username" className="block text-sm font-medium text-slate-400">Webhook Username</label>
                            <input
                                type="text"
                                id="adyen-webhook-username"
                                value={adyenWebhookUsername}
                                onChange={(e) => setAdyenWebhookUsername(e.target.value)}
                                placeholder="Enter Webhook Username"
                                className={`mt-1 ${darkTextInputStyle}`}
                            />
                            {formData.adyenWebhookUsername && (
                                <p className="mt-1 text-xs text-slate-500">
                                    Existing username is saved. Leave empty to keep it, or enter a new username to update.
                                </p>
                            )}
                        </div>
                        <div>
                            <label htmlFor="adyen-webhook-password" className="block text-sm font-medium text-slate-400">Webhook Password</label>
                            <input
                                type="password"
                                id="adyen-webhook-password"
                                value={adyenWebhookPassword}
                                onChange={(e) => setAdyenWebhookPassword(e.target.value)}
                                placeholder="Enter Webhook Password"
                                className={`mt-1 ${darkTextInputStyle}`}
                            />
                            {formData.adyenWebhookPassword && (
                                <p className="mt-1 text-xs text-slate-500">
                                    Existing password is saved. Leave empty to keep it, or enter a new password to update.
                                </p>
                            )}
                        </div>
                        {detectedEnvironment === "LIVE" && (
                            <div>
                                <label htmlFor="adyen-live-endpoint-prefix" className="block text-sm font-medium text-slate-400">
                                    Live Endpoint Prefix
                                    <span className="ml-2 text-xs font-normal text-slate-500">(Optional - Required after go-live)</span>
                                </label>
                                <input
                                    type="text"
                                    id="adyen-live-endpoint-prefix"
                                    value={adyenLiveEndpointPrefix}
                                    onChange={(e) => setAdyenLiveEndpointPrefix(e.target.value)}
                                    placeholder="e.g., yourcompany-live"
                                    className={`mt-1 ${darkTextInputStyle}`}
                                />
                                <div className="mt-1.5 flex items-start gap-2">
                                    <svg className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                    </svg>
                                    <p className="text-xs text-slate-500 flex-1">
                                        Optional for now. Required after your account goes live with Adyen. Find this in your Adyen Customer Area &rarr; <span className="text-cyan-400">Developers &rarr; API URLs</span> once you've completed go-live. Leave empty for TEST environment or before go-live.
                                    </p>
                                </div>
                                {formData.adyenLiveEndpointPrefix && (
                                    <p className="mt-1 text-xs text-slate-500">
                                        Existing prefix is saved. Leave empty to keep it, or enter a new prefix to update.
                                    </p>
                                )}
                            </div>
                        )}
                        {pspConnectionTestMessage && (
                            <div className={`text-sm ${formData.integrations.psp.status === 'connected' ? 'text-green-400' : 'text-red-400'}`}>
                                {pspConnectionTestMessage}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <PMSIntegrationSection
                formData={formData}
                setFormData={setFormData}
                onOperaCloudCredentialsChange={onOperaCloudCredentialsChange}
                onGetOperaCloudCredentialsRef={onGetOperaCloudCredentialsRef}
                isAdmin={isAdmin}
            />
        </div>
    );
};

// =============================================================================
// Opera Cloud API (OHIP) — rendered inline inside PMSIntegrationSection
// =============================================================================

const DEFAULT_OPERA_CLOUD: OperaCloudIntegration = {
  gatewayUrl: '',
  authMode: 'ocim',
  oauthClientId: '',
  hotelCodes: [],
  status: 'not_connected',
};

const OperaCloudStatusPill: React.FC<{ status: 'connected' | 'not_connected' | 'error' }> = ({ status }) => {
  const styles = {
    connected: 'bg-green-900/50 text-green-300',
    not_connected: 'bg-slate-700 text-slate-300',
    error: 'bg-red-900/50 text-red-300',
  };
  return <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${styles[status]}`}>{status.replace('_', ' ')}</span>;
};

interface OperaCloudFieldsProps {
  formData: Hotel;
  setFormData: React.Dispatch<React.SetStateAction<Hotel>>;
  onOperaCloudCredentialsChange?: (credentials: OperaCloudCredentials | null) => void;
  onGetOperaCloudCredentialsRef?: (getter: () => OperaCloudCredentials | null) => void;
  isAdmin?: boolean;
}

const OperaCloudFields: React.FC<OperaCloudFieldsProps> = ({
  formData,
  setFormData,
  onOperaCloudCredentialsChange,
  onGetOperaCloudCredentialsRef,
  isAdmin = false,
}) => {
  const opera = formData.operaCloudIntegration ?? DEFAULT_OPERA_CLOUD;

  const [oauthClientSecret, setOauthClientSecret] = useState('');
  const [appKey, setAppKey] = useState('');
  const [integrationPassword, setIntegrationPassword] = useState('');

  const [newHotelCode, setNewHotelCode] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestMessage, setConnectionTestMessage] = useState<string | null>(null);

  const updateOpera = (patch: Partial<OperaCloudIntegration>) => {
    setFormData(prev => ({
      ...prev,
      operaCloudIntegration: { ...(prev.operaCloudIntegration ?? DEFAULT_OPERA_CLOUD), ...patch },
    }));
  };

  useEffect(() => {
    if (oauthClientSecret || appKey || integrationPassword) {
      onOperaCloudCredentialsChange?.({
        oauthClientSecret,
        appKey,
        integrationPassword: integrationPassword || undefined,
      });
    } else {
      onOperaCloudCredentialsChange?.(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oauthClientSecret, appKey, integrationPassword]);

  useEffect(() => {
    const getCredentials = (): OperaCloudCredentials | null => {
      if (oauthClientSecret || appKey) {
        return {
          oauthClientSecret,
          appKey,
          integrationPassword: integrationPassword || undefined,
        };
      }
      return null;
    };
    onGetOperaCloudCredentialsRef?.(getCredentials);
  }, [oauthClientSecret, appKey, integrationPassword, onGetOperaCloudCredentialsRef]);

  const addHotelCode = () => {
    const code = newHotelCode.trim();
    if (code && !opera.hotelCodes.includes(code)) {
      updateOpera({ hotelCodes: [...opera.hotelCodes, code] });
      setNewHotelCode('');
    }
  };

  const removeHotelCode = (code: string) => {
    updateOpera({ hotelCodes: opera.hotelCodes.filter(c => c !== code) });
  };

  const handleTestConnection = async () => {
    if (!oauthClientSecret || !appKey) {
      setConnectionTestMessage('Please enter Client Secret and App Key to test.');
      return;
    }
    if (!opera.gatewayUrl || !opera.oauthClientId) {
      setConnectionTestMessage('Please fill in Gateway URL and OAuth Client ID.');
      return;
    }
    if (opera.hotelCodes.length === 0) {
      setConnectionTestMessage('At least one property code is required.');
      return;
    }

    setIsTestingConnection(true);
    setConnectionTestMessage(null);

    const result = await testOperaCloudConnection({
      gatewayUrl: opera.gatewayUrl,
      authMode: opera.authMode,
      oauthClientId: opera.oauthClientId,
      oauthClientSecret,
      appKey,
      enterpriseId: opera.enterpriseId,
      hotelCodes: opera.hotelCodes,
      integrationUsername: opera.integrationUsername,
      integrationPassword: opera.authMode === 'ssd' ? integrationPassword : undefined,
    });

    updateOpera({
      status: result.success ? 'connected' : 'error',
      lastTestedAt: new Date(),
    });
    setConnectionTestMessage(result.message);
    setIsTestingConnection(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-400 mb-2">Authentication Mode</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input
              type="radio"
              name="opera-auth-mode"
              value="ocim"
              checked={opera.authMode === 'ocim'}
              onChange={() => updateOpera({ authMode: 'ocim' })}
              className="accent-cyan-500"
            />
            Client Credentials (OCIM)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input
              type="radio"
              name="opera-auth-mode"
              value="ssd"
              checked={opera.authMode === 'ssd'}
              onChange={() => updateOpera({ authMode: 'ssd' })}
              className="accent-cyan-500"
            />
            Integration User (SSD)
          </label>
        </div>
      </div>

      <div>
        <label htmlFor="opera-gateway-url" className="block text-sm font-medium text-slate-400">Gateway URL</label>
        <input
          type="text"
          id="opera-gateway-url"
          value={opera.gatewayUrl}
          onChange={(e) => updateOpera({ gatewayUrl: e.target.value })}
          placeholder="https://your-gateway.oraclecloud.com"
          className={`mt-1 ${darkTextInputStyle}`}
        />
      </div>

      <div>
        <label htmlFor="opera-enterprise-id" className="block text-sm font-medium text-slate-400">
          Enterprise / Tenant ID
          <span className="ml-2 text-xs font-normal text-slate-500">(Optional)</span>
        </label>
        <input
          type="text"
          id="opera-enterprise-id"
          value={opera.enterpriseId || ''}
          onChange={(e) => updateOpera({ enterpriseId: e.target.value })}
          placeholder="e.g. YOURTENANT"
          className={`mt-1 ${darkTextInputStyle}`}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-400">Property Codes</label>
        <div className="mt-1 space-y-2">
          {opera.hotelCodes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {opera.hotelCodes.map((code) => (
                <span key={code} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-slate-700 text-slate-200">
                  {code}
                  <button
                    type="button"
                    onClick={() => removeHotelCode(code)}
                    className="text-slate-400 hover:text-red-400"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newHotelCode}
              onChange={(e) => setNewHotelCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); addHotelCode(); }
              }}
              placeholder="Add resort code (e.g. HOTEL1)"
              className={`flex-1 ${darkTextInputStyle}`}
            />
            <button
              type="button"
              onClick={addHotelCode}
              className="px-3 py-1.5 text-sm text-cyan-400 hover:text-cyan-300 border border-cyan-800 rounded hover:bg-cyan-900/20"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="opera-client-id" className="block text-sm font-medium text-slate-400">OAuth Client ID</label>
        <input
          type="text"
          id="opera-client-id"
          value={opera.oauthClientId}
          onChange={(e) => updateOpera({ oauthClientId: e.target.value })}
          placeholder="Enter OAuth Client ID"
          className={`mt-1 ${darkTextInputStyle}`}
        />
      </div>

      <div>
        <label htmlFor="opera-client-secret" className="block text-sm font-medium text-slate-400">OAuth Client Secret</label>
        <input
          type="password"
          id="opera-client-secret"
          value={oauthClientSecret}
          onChange={(e) => setOauthClientSecret(e.target.value)}
          placeholder="Enter OAuth Client Secret"
          className={`mt-1 ${darkTextInputStyle}`}
        />
        {opera.status === 'connected' && !oauthClientSecret && (
          <p className="mt-1 text-xs text-slate-500">Existing secret is saved server-side. Enter a new value to update.</p>
        )}
      </div>

      <div>
        <label htmlFor="opera-app-key" className="block text-sm font-medium text-slate-400">App Key (x-app-key)</label>
        <input
          type="password"
          id="opera-app-key"
          value={appKey}
          onChange={(e) => setAppKey(e.target.value)}
          placeholder="Enter App Key"
          className={`mt-1 ${darkTextInputStyle}`}
        />
        {opera.status === 'connected' && !appKey && (
          <p className="mt-1 text-xs text-slate-500">Existing key is saved server-side. Enter a new value to update.</p>
        )}
      </div>

      {opera.authMode === 'ssd' && (
        <>
          <div>
            <label htmlFor="opera-int-username" className="block text-sm font-medium text-slate-400">Integration Username</label>
            <input
              type="text"
              id="opera-int-username"
              value={opera.integrationUsername || ''}
              onChange={(e) => updateOpera({ integrationUsername: e.target.value })}
              placeholder="Enter Integration Username"
              className={`mt-1 ${darkTextInputStyle}`}
            />
          </div>
          <div>
            <label htmlFor="opera-int-password" className="block text-sm font-medium text-slate-400">Integration Password</label>
            <input
              type="password"
              id="opera-int-password"
              value={integrationPassword}
              onChange={(e) => setIntegrationPassword(e.target.value)}
              placeholder="Enter Integration Password"
              className={`mt-1 ${darkTextInputStyle}`}
            />
          </div>
        </>
      )}

      {isAdmin && (
        <div className="flex items-center space-x-4 pt-2">
          <button
            onClick={handleTestConnection}
            disabled={isTestingConnection}
            className="text-sm font-medium text-cyan-500 hover:underline disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isTestingConnection && <Spinner />}
            Test Connection
          </button>
        </div>
      )}

      {connectionTestMessage && (
        <div className={`text-sm ${opera.status === 'connected' ? 'text-green-400' : 'text-red-400'}`}>
          {connectionTestMessage}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// PMS Integration Section
// =============================================================================

const pmsSelectStyle = `block w-full text-sm rounded-lg bg-slate-800 border-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-600 pl-3 pr-10 py-2`;

const FORMAT_LABELS: Record<string, string> = {
  opera_cloud_api: 'OHIP',
  opera_csv: 'CSV',
  opera_xml: 'XML',
  opera_delimited: 'Delimited',
  mews_api: 'Mews',
};

const FormatBadge: React.FC<{ format: string }> = ({ format }) => {
  const label = FORMAT_LABELS[format] || format;
  return (
    <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-indigo-900/50 text-indigo-300 uppercase">
      {label}
    </span>
  );
};

interface PMSSectionProps {
  formData: Hotel;
  setFormData: React.Dispatch<React.SetStateAction<Hotel>>;
  onOperaCloudCredentialsChange?: (credentials: OperaCloudCredentials | null) => void;
  onGetOperaCloudCredentialsRef?: (getter: () => OperaCloudCredentials | null) => void;
  isAdmin?: boolean;
}

const PMSIntegrationSection: React.FC<PMSSectionProps> = ({ formData, setFormData, onOperaCloudCredentialsChange, onGetOperaCloudCredentialsRef, isAdmin }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<ImportResult | null>(null);
  const [importHistory, setImportHistory] = useState<ImportRecord[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pmsType = formData.pmsIntegration?.type || 'none';

  const handlePmsTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const type = e.target.value as PMSIntegration['type'];
    setFormData(prev => ({
      ...prev,
      pmsIntegration: { ...prev.pmsIntegration, type },
    }));
    setUploadResult(null);
  };

  // Load import history when component mounts or formData.id changes
  useEffect(() => {
    if (formData.id && pmsType !== 'none') {
      getImportHistory(formData.id).then(setImportHistory).catch(console.error);
    }
  }, [formData.id, pmsType]);

  const handleFileUpload = useCallback(async (file: File) => {
    if (!/\.(csv|xml|txt)$/i.test(file.name)) {
      setUploadResult({ success: false, error: 'Please select a CSV, XML, or TXT file.' });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadResult({ success: false, error: 'File too large. Maximum size is 10MB.' });
      return;
    }

    setIsUploading(true);
    setUploadResult(null);

    try {
      const result = await uploadCSVForImport(formData.id, file);
      setUploadResult(result);

      if (result.success) {
        // Refresh import history
        const history = await getImportHistory(formData.id);
        setImportHistory(history);
      }
    } catch (err) {
      setUploadResult({ success: false, error: (err as Error).message });
    } finally {
      setIsUploading(false);
    }
  }, [formData.id]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  }, []);

  return (
    <div className="p-4 border border-slate-800 rounded-lg">
      <h4 className="font-semibold text-slate-50 font-heading">Property Management System (PMS)</h4>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
        <div>
          <label className="block text-sm font-medium text-slate-400">Provider</label>
          <select
            value={pmsType}
            onChange={handlePmsTypeChange}
            className={`mt-1 ${pmsSelectStyle} capitalize`}
          >
            <option value="none">None</option>
            <option value="opera_cloud_api">Oracle Opera Cloud (OHIP API)</option>
            <option value="opera_csv">Oracle Opera (CSV Export)</option>
            <option value="opera_xml">Oracle Opera (XML Export)</option>
            <option value="opera_delimited">Oracle Opera (Delimited Text)</option>
            <option value="mews_api">Mews (API)</option>
          </select>
        </div>
        <div className="flex items-center space-x-4 mt-2">
          <span className="text-sm font-medium text-slate-400">Status:</span>
          {pmsType === 'none' ? (
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-700 text-slate-300">not connected</span>
          ) : pmsType === 'opera_cloud_api' ? (
            <OperaCloudStatusPill status={(formData.operaCloudIntegration ?? DEFAULT_OPERA_CLOUD).status} />
          ) : formData.pmsIntegration?.reservationCount ? (
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-900/50 text-green-300">
              {formData.pmsIntegration.reservationCount} reservations imported
            </span>
          ) : (
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-900/50 text-amber-300">awaiting import</span>
          )}
        </div>
      </div>

      {(pmsType === 'opera_csv' || pmsType === 'opera_xml' || pmsType === 'opera_delimited') && (
        <div className="mt-4 pt-4 border-t border-slate-800 space-y-4">
          <div className="p-3 bg-indigo-900/20 border border-indigo-800 rounded-md">
            <p className="text-sm text-indigo-300 font-medium mb-2">How to Export from Opera</p>
            <ol className="text-xs text-indigo-200 space-y-1 list-decimal list-inside">
              <li>In Opera, go to <strong>Reports &rarr; Reservations</strong></li>
              <li>Select the date range covering your disputed transactions</li>
              <li>Export as CSV, XML, or delimited text (include folio details if available)</li>
              <li>Upload the exported file below</li>
            </ol>
            <p className="text-xs text-indigo-200 mt-2">
              The format is auto-detected on upload. The AI will match reservations to open disputes.
              Card numbers are stripped on upload (PCI compliance).
            </p>
          </div>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`relative flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
              isDragActive
                ? 'border-cyan-500 bg-cyan-900/20'
                : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xml,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                e.target.value = '';
              }}
            />
            {isUploading ? (
              <div className="flex items-center gap-3">
                <Spinner />
                <span className="text-sm text-slate-300">Processing file...</span>
              </div>
            ) : (
              <>
                <svg className="w-8 h-8 text-slate-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm text-slate-400">
                  {isDragActive ? 'Drop file here' : 'Click or drag a PMS export file to upload'}
                </p>
                <p className="text-xs text-slate-500 mt-1">Opera CSV, XML, or delimited text exports, max 10MB</p>
              </>
            )}
          </div>

          {/* Upload result */}
          {uploadResult && (
            <div className={`p-3 rounded-md border ${
              uploadResult.success
                ? 'bg-green-900/20 border-green-800'
                : 'bg-red-900/20 border-red-800'
            }`}>
              {uploadResult.success ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-green-300 font-medium">Import successful</p>
                    {uploadResult.source?.type && (
                      <FormatBadge format={uploadResult.source.type} />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-green-200">
                    {uploadResult.reservationCount !== undefined && (
                      <span>{uploadResult.reservationCount} reservations</span>
                    )}
                    {uploadResult.folioCount !== undefined && uploadResult.folioCount > 0 && (
                      <span>{uploadResult.folioCount} folios</span>
                    )}
                    {uploadResult.activityLogCount !== undefined && uploadResult.activityLogCount > 0 && (
                      <span>{uploadResult.activityLogCount} activity logs</span>
                    )}
                    {uploadResult.rowsParsed !== undefined && (
                      <span>{uploadResult.rowsParsed} rows parsed</span>
                    )}
                  </div>
                  {uploadResult.warnings && uploadResult.warnings.length > 0 && (
                    <div className="mt-2 text-xs text-amber-300">
                      {uploadResult.warnings.map((w, i) => <p key={i}>{w}</p>)}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-red-300">{uploadResult.error}</p>
              )}
            </div>
          )}

          {/* Import history */}
          {importHistory.length > 0 && (
            <div>
              <h5 className="text-sm font-medium text-slate-400 mb-2">Recent Imports</h5>
              <div className="space-y-2">
                {importHistory.slice(0, 5).map((record) => (
                  <div key={record.id} className="flex items-center justify-between px-3 py-2 bg-slate-800/50 rounded text-xs">
                    <div className="flex items-center gap-2 text-slate-300">
                      <span className="font-medium">{record.source.fileName || 'Import'}</span>
                      <FormatBadge format={record.source.type} />
                      <span className="text-slate-500">
                        {record.reservationCount} reservations
                        {record.folioCount > 0 && `, ${record.folioCount} folios`}
                      </span>
                    </div>
                    <span className="text-slate-500">
                      {record.importedAt.toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {pmsType === 'opera_cloud_api' && (
        <div className="mt-4 pt-4 border-t border-slate-800">
          <OperaCloudFields
            formData={formData}
            setFormData={setFormData}
            onOperaCloudCredentialsChange={onOperaCloudCredentialsChange}
            onGetOperaCloudCredentialsRef={onGetOperaCloudCredentialsRef}
            isAdmin={isAdmin}
          />
        </div>
      )}

      {pmsType === 'mews_api' && (
        <div className="mt-4 pt-4 border-t border-slate-800">
          <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-md">
            <p className="text-sm text-slate-400">
              Mews API integration is coming soon. For now, you can use CSV exports from your PMS.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
