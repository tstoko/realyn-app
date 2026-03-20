import React, { useMemo } from 'react';
import { Spinner, CollectionIcon, CashIcon, TrendingUpIcon, ExclamationTriangleIcon } from '@realyn/shared';
import { useDisputes } from '../../hooks/useDisputes';
import { StatCard } from './StatCard';

export const PortfolioAnalyticsPage: React.FC = () => {
    const { disputes, loading, error } = useDisputes(null); // Fetch all disputes

    const analytics = useMemo(() => {
        if (disputes.length === 0) {
            return {
                totalDisputes: 0,
                totalAtRisk: 0,
                totalRecovered: 0,
                winRate: 0,
                byProperty: []
            };
        }

        const totalDisputes = disputes.length;
        const totalAtRisk = disputes.reduce((sum, d) => (d.lifecycleStatus !== 'won' && d.lifecycleStatus !== 'lost') ? sum + d.amount : sum, 0);
        const totalRecovered = disputes.reduce((sum, d) => d.lifecycleStatus === 'won' ? sum + d.amount : sum, 0);
        const concludedDisputes = disputes.filter(d => d.lifecycleStatus === 'won' || d.lifecycleStatus === 'lost').length;
        const wonDisputes = disputes.filter(d => d.lifecycleStatus === 'won').length;
        const winRate = concludedDisputes > 0 ? (wonDisputes / concludedDisputes) * 100 : 0;
        
        const byProperty = disputes.reduce((acc, dispute) => {
            const orgId = dispute.organizationId ?? "unknown";
            if (!acc[orgId]) {
                acc[orgId] = {
                    propertyName: `Property ${orgId.split('_')[1] ?? orgId}`,
                    disputeCount: 0,
                    wonCount: 0,
                    concludedCount: 0,
                    recoveredAmount: 0,
                };
            }
            const prop = acc[orgId];
            prop.disputeCount++;
            if (dispute.lifecycleStatus === 'won') {
                prop.wonCount++;
                prop.concludedCount++;
                prop.recoveredAmount += dispute.amount;
            } else if (dispute.lifecycleStatus === 'lost') {
                prop.concludedCount++;
            }
            return acc;
        }, {} as any);

        const propertyArray = Object.values(byProperty).map((p: any) => ({
            ...p,
            winRate: p.concludedCount > 0 ? (p.wonCount / p.concludedCount) * 100 : 0,
        }));

        return { totalDisputes, totalAtRisk, totalRecovered, winRate, byProperty: propertyArray };
    }, [disputes]);
    
    const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);

    return (
        <>
            <h2 className="text-2xl font-bold leading-7 text-slate-100 sm:text-3xl sm:truncate font-heading">Portfolio Analytics</h2>
            {loading && <div className="flex justify-center mt-16"><Spinner /></div>}
            {error && <div className="text-center text-red-500 mt-16">{error}</div>}
            {!loading && !error && (
                <>
                    <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                        <StatCard title="Total Disputes" value={analytics.totalDisputes.toString()} description="Across all properties" icon={<CollectionIcon />} />
                        <StatCard title="Total Amount at Risk" value={formatCurrency(analytics.totalAtRisk)} description="In open disputes" icon={<ExclamationTriangleIcon />} />
                        <StatCard title="Total Recovered" value={formatCurrency(analytics.totalRecovered)} description="From won disputes" icon={<CashIcon />} />
                        <StatCard title="Overall Win Rate" value={`${analytics.winRate.toFixed(1)}%`} description="For concluded disputes" icon={<TrendingUpIcon />} />
                    </div>

                    <div className="mt-8 bg-slate-900 shadow-md rounded-xl overflow-hidden border border-slate-800">
                        <h3 className="text-lg font-medium text-slate-200 p-6 border-b border-slate-800 font-heading">Performance by Property</h3>
                        <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="border-b border-slate-800 bg-slate-900/50">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Property Name</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Disputes</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Win Rate</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Amount Recovered</th>
                                </tr>
                            </thead>
                            <tbody className="bg-slate-900">
                                {analytics.byProperty.map((prop: any) => (
                                    <tr key={prop.propertyName} className={`border-b border-slate-800 last:border-b-0 hover:bg-slate-800/50 transition-colors`}>
                                        <td className="px-6 py-5 text-sm font-medium text-slate-200">{prop.propertyName}</td>
                                        <td className="px-6 py-5 text-sm text-slate-400">{prop.disputeCount}</td>
                                        <td className="px-6 py-5 text-sm text-slate-400">{prop.winRate.toFixed(1)}%</td>
                                        <td className="px-6 py-5 text-sm font-semibold text-slate-200">{formatCurrency(prop.recoveredAmount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>
                    </div>
                </>
            )}
        </>
    );
};
