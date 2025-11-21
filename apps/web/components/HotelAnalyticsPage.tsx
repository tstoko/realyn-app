import React, { useMemo } from 'react';
import type { Dispute, Hotel } from '../types';
import { Spinner } from './Spinner';
import { CollectionIcon } from './icons/CollectionIcon';
import { CashIcon } from './icons/CashIcon';
import { TrendingUpIcon } from './icons/TrendingUpIcon';
import { StatCard } from './StatCard';
import { ExclamationTriangleIcon } from './icons/ExclamationTriangleIcon';

interface HotelAnalyticsPageProps {
    hotel: Hotel;
    disputes: Dispute[];
    isLoading: boolean;
}

export const HotelAnalyticsPage: React.FC<HotelAnalyticsPageProps> = ({ hotel, disputes, isLoading }) => {

    const analytics = useMemo(() => {
        if (disputes.length === 0) {
            return {
                totalDisputes: 0,
                totalAtRisk: 0,
                totalRecovered: 0,
                winRate: 0,
                byReason: []
            };
        }

        const totalDisputes = disputes.length;
        const totalAtRisk = disputes.reduce((sum, d) => (d.lifecycleStatus !== 'won' && d.lifecycleStatus !== 'lost') ? sum + d.amount : sum, 0);
        const totalRecovered = disputes.reduce((sum, d) => d.lifecycleStatus === 'won' ? sum + d.amount : sum, 0);
        const concludedDisputes = disputes.filter(d => d.lifecycleStatus === 'won' || d.lifecycleStatus === 'lost').length;
        const wonDisputes = disputes.filter(d => d.lifecycleStatus === 'won').length;
        const winRate = concludedDisputes > 0 ? (wonDisputes / concludedDisputes) * 100 : 0;
        
        const byReason = disputes.reduce((acc, dispute) => {
            const reason = dispute.reason || 'unknown';
            if (!acc[reason]) {
                acc[reason] = {
                    reason: reason.replace(/_/g, ' '),
                    count: 0,
                    totalAmount: 0,
                };
            }
            acc[reason].count++;
            acc[reason].totalAmount += dispute.amount;
            return acc;
        }, {} as any);
        
        const reasonArray = Object.values(byReason);

        return { totalDisputes, totalAtRisk, totalRecovered, winRate, byReason: reasonArray };
    }, [disputes]);
    
    const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);

    return (
        <>
            <h2 className="text-2xl font-bold leading-7 text-slate-100 sm:text-3xl sm:truncate font-heading">
                Analytics for <span className="text-cyan-500">{hotel.name}</span>
            </h2>
            
            {isLoading && <div className="flex justify-center mt-16"><Spinner /></div>}
            
            {!isLoading && (
                <>
                    <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                        <StatCard title="Total Disputes" value={analytics.totalDisputes.toString()} description="For this property" icon={<CollectionIcon />} />
                        <StatCard title="Amount at Risk" value={formatCurrency(analytics.totalAtRisk)} description="In open disputes" icon={<ExclamationTriangleIcon />} />
                        <StatCard title="Total Recovered" value={formatCurrency(analytics.totalRecovered)} description="From won disputes" icon={<CashIcon />} />
                        <StatCard title="Win Rate" value={`${analytics.winRate.toFixed(1)}%`} description="For concluded disputes" icon={<TrendingUpIcon />} />
                    </div>

                    <div className="mt-8 bg-slate-900 shadow-md rounded-xl overflow-hidden border border-slate-800">
                        <h3 className="text-lg font-medium text-slate-200 p-6 border-b border-slate-800 font-heading">Disputes by Reason</h3>
                        <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="border-b border-slate-800 bg-slate-900/50">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Reason</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Count</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Amount</th>
                                </tr>
                            </thead>
                            <tbody className="bg-slate-900">
                                {analytics.byReason.map((item: any) => (
                                    <tr key={item.reason} className={`border-b border-slate-800 last:border-b-0 hover:bg-slate-800/50 transition-colors`}>
                                        <td className="px-6 py-5 text-sm font-medium text-slate-200 capitalize">{item.reason}</td>
                                        <td className="px-6 py-5 text-sm text-slate-400">{item.count}</td>
                                        <td className="px-6 py-5 text-sm font-semibold text-slate-200">{formatCurrency(item.totalAmount)}</td>
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