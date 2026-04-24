// Utility
export { cn } from './lib/utils';

// Types
export * from './types';

// Config
export { CURRENT_POLICY_VERSION } from './config/legal';

// UI Components
export { Button, buttonVariants } from './components/ui/button';
export type { ButtonProps } from './components/ui/button';
export { Input } from './components/ui/input';
export { Label } from './components/ui/label';
export { Textarea } from './components/ui/textarea';
export { WorldpayIcon, CheckoutDotComIcon, MewsIcon, CloudbedsIcon } from './components/ui/brand-icons';
export { Skeleton, TableRowSkeleton, TableSkeleton, StatCardSkeleton, StatCardGridSkeleton, PropertyCardSkeleton, PropertyCardGridSkeleton } from './components/ui/Skeleton';

// Layout Components
export { Logo } from './components/layout/Logo';
export { Footer } from './components/layout/Footer';

// Shared Components
export { Spinner } from './components/shared/Spinner';
export { ErrorBoundary, withErrorBoundary } from './components/shared/ErrorBoundary';
export { ToastProvider, ToastContext } from './components/shared/Toast';
export { CookieConsent, getConsentState, hasAnalyticsConsent } from './components/shared/CookieConsent';
export { UpdateBanner } from './components/shared/UpdateBanner';

// Icons
export { CheckCircleIcon } from './components/icons/CheckCircleIcon';
export { ExclamationIcon } from './components/icons/ExclamationIcon';
export { ShieldCheckIcon } from './components/icons/ShieldCheckIcon';
export { ChartBarIcon } from './components/icons/ChartBarIcon';
export { UserGroupIcon } from './components/icons/UserGroupIcon';
export { SettingsIcon } from './components/icons/SettingsIcon';
export { HomeIcon } from './components/icons/HomeIcon';
export { UsersIcon } from './components/icons/UsersIcon';
export { TrendingUpIcon } from './components/icons/TrendingUpIcon';
export { CashIcon } from './components/icons/CashIcon';
export { ExclamationTriangleIcon } from './components/icons/ExclamationTriangleIcon';
export { DownloadIcon } from './components/icons/DownloadIcon';
export { RobotIcon } from './components/icons/RobotIcon';
export { CollectionIcon } from './components/icons/CollectionIcon';
export { InformationCircleIcon } from './components/icons/InformationCircleIcon';
export { BellIcon } from './components/icons/BellIcon';

// Contexts
export { AuthProvider, useAuthContext } from './contexts/AuthContext';

// Hooks
export { useAuth } from './hooks/useAuth';
export { useToast } from './hooks/useToast';
export { useVersionCheck } from './hooks/useVersionCheck';

// Services
export { db, auth, storage } from './services/firebase';
export { submitContactSalesForm, getAllContactSalesSubmissions, deleteContactSalesSubmission } from './services/contactSalesService';
export type { ContactSalesSubmission } from './services/contactSalesService';
export { createOrUpdateUser, getUserData, updateUserProfile, getUserPreferences, updateUserPreferences } from './services/userService';
export { DEFAULT_PREFERENCES } from './services/userPreferencesService';

// Billing
export { PLANS, getPlanById, isSubscriptionActive } from './billing';
export type { Plan, PlanFeatures, Subscription, SubscriptionStatus } from './billing';
