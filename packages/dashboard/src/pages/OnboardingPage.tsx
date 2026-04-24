import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo, useAuthContext } from '@realyn/shared';
import { FUNCTIONS_BASE_URL } from '../config/environment';
import { getCloudFunctionJsonHeaders } from '../services/cloudFunctionAuth';

type Step = 'welcome' | 'psp' | 'done';

export const OnboardingPage: React.FC = () => {
  const { user } = useAuthContext();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [pspProvider, setPspProvider] = useState<'stripe' | 'adyen' | 'skip'>('skip');
  const [stripeKey, setStripeKey] = useState('');
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState('');
  const [adyenApiKey, setAdyenApiKey] = useState('');
  const [adyenMerchantAccount, setAdyenMerchantAccount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps: { key: Step; label: string }[] = [
    { key: 'welcome', label: 'Welcome' },
    { key: 'psp', label: 'Payment Provider' },
    { key: 'done', label: 'Ready' },
  ];

  const currentIndex = steps.findIndex((s) => s.key === currentStep);

  const savePspConfig = async () => {
    if (pspProvider === 'skip') return;

    setSaving(true);
    setError(null);

    try {
      const authResult = await getCloudFunctionJsonHeaders();
      if (!authResult.ok) throw new Error(authResult.error);

      const pspIntegrations: Record<string, unknown> = {};
      const credentials: Record<string, unknown> = {};

      if (pspProvider === 'stripe') {
        pspIntegrations.stripe = { enabled: true, provider: 'stripe' };
        credentials.stripe = {
          secretKey: stripeKey,
          webhookSecret: stripeWebhookSecret,
        };
      } else if (pspProvider === 'adyen') {
        pspIntegrations.adyen = { enabled: true, provider: 'adyen' };
        credentials.adyen = {
          apiKey: adyenApiKey,
          merchantAccounts: [adyenMerchantAccount],
        };
      }

      const response = await fetch(`${FUNCTIONS_BASE_URL}/organizationWriteHandler`, {
        method: 'POST',
        headers: authResult.headers,
        body: JSON.stringify({
          action: 'updateOrganizationIntegrations',
          organizationId: user?.organizationId,
          pspIntegrations,
          credentials,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save PSP configuration');
      }
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
      return;
    }

    setSaving(false);
  };

  const handleNext = async () => {
    if (currentStep === 'welcome') {
      setCurrentStep('psp');
    } else if (currentStep === 'psp') {
      if (pspProvider !== 'skip') {
        await savePspConfig();
        if (error) return;
      }
      setCurrentStep('done');
    } else if (currentStep === 'done') {
      navigate('/', { replace: true });
    }
  };

  const inputStyle =
    'appearance-none block w-full px-4 py-2.5 border border-slate-700 rounded-lg shadow-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-cyan-500 sm:text-sm bg-slate-800 transition-all duration-200 text-slate-100';

  const providerButtonStyle = (selected: boolean) =>
    `flex-1 p-4 rounded-lg border-2 transition-all cursor-pointer text-center ${
      selected
        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
        : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
    }`;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <Logo className="h-16 w-auto mx-auto" />
        </div>

        {/* Progress bar */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((step, i) => (
            <React.Fragment key={step.key}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  i <= currentIndex
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                {i + 1}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`h-0.5 w-12 transition-colors ${
                    i < currentIndex ? 'bg-cyan-600' : 'bg-slate-700'
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="bg-slate-900/80 backdrop-blur-xl p-8 rounded-xl shadow-2xl border border-slate-800/50">
          {/* Step: Welcome */}
          {currentStep === 'welcome' && (
            <div className="text-center space-y-4">
              <h2 className="text-2xl font-bold text-slate-50">
                Welcome to Realyn{user?.name ? `, ${user.name.split(' ')[0]}` : ''}!
              </h2>
              <p className="text-slate-400">
                Let's get your account set up. We'll walk you through connecting your payment provider
                so you can start managing chargebacks right away.
              </p>
              <p className="text-sm text-slate-500">
                This takes about 2 minutes. You can skip any step and configure it later.
              </p>
            </div>
          )}

          {/* Step: PSP */}
          {currentStep === 'psp' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-slate-50 mb-1">Connect your payment provider</h2>
                <p className="text-sm text-slate-400">
                  This lets Realyn receive dispute notifications and submit evidence automatically.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  className={providerButtonStyle(pspProvider === 'stripe')}
                  onClick={() => setPspProvider('stripe')}
                >
                  <div className="font-semibold text-lg">Stripe</div>
                </button>
                <button
                  type="button"
                  className={providerButtonStyle(pspProvider === 'adyen')}
                  onClick={() => setPspProvider('adyen')}
                >
                  <div className="font-semibold text-lg">Adyen</div>
                </button>
                <button
                  type="button"
                  className={providerButtonStyle(pspProvider === 'skip')}
                  onClick={() => setPspProvider('skip')}
                >
                  <div className="font-semibold text-lg">Skip</div>
                  <div className="text-xs mt-1">Set up later</div>
                </button>
              </div>

              {pspProvider === 'stripe' && (
                <div className="space-y-4 pt-2">
                  <div>
                    <label htmlFor="stripeKey" className="block text-sm font-medium text-slate-400 mb-1">
                      Stripe Secret Key
                    </label>
                    <input
                      id="stripeKey"
                      type="password"
                      value={stripeKey}
                      onChange={(e) => setStripeKey(e.target.value)}
                      placeholder="sk_live_..."
                      className={inputStyle}
                    />
                  </div>
                  <div>
                    <label htmlFor="stripeWebhook" className="block text-sm font-medium text-slate-400 mb-1">
                      Webhook Signing Secret
                    </label>
                    <input
                      id="stripeWebhook"
                      type="password"
                      value={stripeWebhookSecret}
                      onChange={(e) => setStripeWebhookSecret(e.target.value)}
                      placeholder="whsec_..."
                      className={inputStyle}
                    />
                  </div>
                </div>
              )}

              {pspProvider === 'adyen' && (
                <div className="space-y-4 pt-2">
                  <div>
                    <label htmlFor="adyenKey" className="block text-sm font-medium text-slate-400 mb-1">
                      Adyen API Key
                    </label>
                    <input
                      id="adyenKey"
                      type="password"
                      value={adyenApiKey}
                      onChange={(e) => setAdyenApiKey(e.target.value)}
                      placeholder="Your Adyen API key"
                      className={inputStyle}
                    />
                  </div>
                  <div>
                    <label htmlFor="adyenMerchant" className="block text-sm font-medium text-slate-400 mb-1">
                      Merchant Account
                    </label>
                    <input
                      id="adyenMerchant"
                      type="text"
                      value={adyenMerchantAccount}
                      onChange={(e) => setAdyenMerchantAccount(e.target.value)}
                      placeholder="YourMerchantAccount"
                      className={inputStyle}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step: Done */}
          {currentStep === 'done' && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-50">You're all set!</h2>
              <p className="text-slate-400">
                Your account is ready. You can configure additional settings like PMS connections
                and automation rules from your dashboard at any time.
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 text-center mt-4">{error}</p>
          )}

          <button
            onClick={handleNext}
            disabled={saving}
            className="w-full mt-6 flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-lg text-sm font-medium text-white bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {saving
              ? 'Saving...'
              : currentStep === 'done'
              ? 'Go to Dashboard'
              : 'Continue'}
          </button>

          {currentStep === 'psp' && (
            <button
              onClick={() => {
                setPspProvider('skip');
                setCurrentStep('done');
              }}
              className="w-full mt-3 py-2 text-sm text-slate-400 hover:text-slate-300 transition-colors"
            >
              Skip for now
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
