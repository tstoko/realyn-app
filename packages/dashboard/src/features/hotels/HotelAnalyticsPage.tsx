import React, { useMemo, useState } from 'react';
import type { Dispute, Hotel } from '@realyn/shared';
import { StatCardGridSkeleton, CollectionIcon, CashIcon, TrendingUpIcon, ExclamationTriangleIcon, RobotIcon } from '@realyn/shared';
import { NoAnalyticsDataEmptyState } from '../../components/shared/EmptyState';
import { StatCard } from '../analytics/StatCard';

interface HotelAnalyticsPageProps {
    hotel: Hotel;
    disputes: Dispute[];
    isLoading: boolean;
}

type SortKey = 'reason' | 'count' | 'amount';
type SortDirection = 'asc' | 'desc';

interface ReasonItem {
    reason: string;
    count: number;
    totalAmount: number;
}

export const HotelAnalyticsPage: React.FC<HotelAnalyticsPageProps> = ({ hotel, disputes, isLoading }) => {
    const [reasonSortKey, setReasonSortKey] = useState<SortKey>('count');
    const [reasonSortDirection, setReasonSortDirection] = useState<SortDirection>('desc');

    const analytics = useMemo(() => {
        if (disputes.length === 0) {
            return {
                totalDisputes: 0,
                totalAtRisk: 0,
                totalRecovered: 0,
                totalLost: 0,
                amountLost: 0,
                winRate: 0,
                byReason: [] as ReasonItem[],
                awaitingActionCount: 0,
                inProgressByAI: 0,
                revenueProtected: 0,
                timeSaved: 0,
                avgResponseTime: 0,
                disputesWon: 0,
                disputesLost: 0,
                amountAtRisk: 0,
                avgDisputeAmount: 0,
                openDisputes: 0,
                closedDisputes: 0,
            };
        }

        const totalDisputes = disputes.length;
        
        // Open vs Closed
        const openDisputes = disputes.filter(d => d.lifecycleStatus !== 'won' && d.lifecycleStatus !== 'lost').length;
        const closedDisputes = disputes.filter(d => d.lifecycleStatus === 'won' || d.lifecycleStatus === 'lost').length;
        
        // Amount calculations
        const totalAtRisk = disputes.reduce((sum, d) => (d.lifecycleStatus !== 'won' && d.lifecycleStatus !== 'lost') ? sum + d.amount : sum, 0);
        const totalRecovered = disputes.reduce((sum, d) => d.lifecycleStatus === 'won' ? sum + d.amount : sum, 0);
        const lostDisputes = disputes.filter(d => d.lifecycleStatus === 'lost');
        const totalLost = lostDisputes.length;
        const amountLost = lostDisputes.reduce((sum, d) => sum + d.amount, 0);
        
        // Average dispute amount
        const avgDisputeAmount = totalDisputes > 0 
            ? disputes.reduce((sum, d) => sum + d.amount, 0) / totalDisputes 
            : 0;
        
        // Win rate calculations
        const concludedDisputes = disputes.filter(d => d.lifecycleStatus === 'won' || d.lifecycleStatus === 'lost').length;
        const wonDisputes = disputes.filter(d => d.lifecycleStatus === 'won');
        const wonDisputesCount = wonDisputes.length;
        const disputesLost = lostDisputes.length;
        const winRate = concludedDisputes > 0 ? (wonDisputesCount / concludedDisputes) * 100 : 0;
        
        // Operational metrics
        const awaitingActionCount = disputes.filter(d => d.automationStatus === 'awaiting_info' || d.automationStatus === 'manual_review').length;
        const aiHandledDisputes = disputes.filter(d => d.automationStatus && ['auditing', 'responding'].includes(d.automationStatus));
        const inProgressByAI = aiHandledDisputes.length;
        
        // ROI metrics
        const revenueProtected = wonDisputes.reduce((sum, d) => sum + d.amount, 0);
        // Time saved: only count disputes handled by AI (2 hours per dispute)
        const timeSaved = aiHandledDisputes.length * 2;
        
        // Calculate average response time (days from creation to submission)
        const submittedDisputes = disputes.filter(d => 
            d.lifecycleStatus === 'submitted' || 
            d.lifecycleStatus === 'won' || 
            d.lifecycleStatus === 'lost'
        );
        const avgResponseTime = submittedDisputes.length > 0
            ? submittedDisputes.reduce((sum, d) => {
                if (d.createdAt && d.argumentSubmittedAt) {
                    const created = d.createdAt instanceof Date ? d.createdAt : typeof (d.createdAt as any)?.toDate === 'function' ? (d.createdAt as any).toDate() : new Date(d.createdAt as any);
                    const submitted = d.argumentSubmittedAt instanceof Date ? d.argumentSubmittedAt : typeof (d.argumentSubmittedAt as any)?.toDate === 'function' ? (d.argumentSubmittedAt as any).toDate() : new Date(d.argumentSubmittedAt as any);
                    const days = Math.round((submitted.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
                    return sum + days;
                }
                return sum;
            }, 0) / submittedDisputes.length
            : 0;
        
        // Amount at Risk using status (for active disputes that need response)
        const amountAtRisk = disputes.reduce((sum, dispute) => {
            if (dispute.status === 'needs_response' || dispute.status === 'under_review') {
                return sum + dispute.amount;
            }
            return sum;
        }, 0);
        
        // Disputes by reason
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
        }, {} as Record<string, ReasonItem>);
        
        const reasonArray = Object.values(byReason);

        return { 
            totalDisputes, 
            totalAtRisk, 
            totalRecovered,
            totalLost,
            amountLost,
            winRate, 
            byReason: reasonArray,
            awaitingActionCount,
            inProgressByAI,
            revenueProtected,
            timeSaved,
            avgResponseTime,
            disputesWon: wonDisputesCount,
            disputesLost,
            amountAtRisk,
            avgDisputeAmount,
            openDisputes,
            closedDisputes,
        };
    }, [disputes]);
    
    const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);
    const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);

    const handleSort = (key: SortKey) => {
        if (reasonSortKey === key) {
            setReasonSortDirection(reasonSortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setReasonSortKey(key);
            setReasonSortDirection('desc');
        }
    };

    const sortedReasons = useMemo(() => {
        const sorted = [...analytics.byReason];
        sorted.sort((a, b) => {
            let aVal: number | string;
            let bVal: number | string;
            
            if (reasonSortKey === 'reason') {
                aVal = a.reason.toLowerCase();
                bVal = b.reason.toLowerCase();
            } else if (reasonSortKey === 'count') {
                aVal = a.count;
                bVal = b.count;
            } else {
                aVal = a.totalAmount;
                bVal = b.totalAmount;
            }
            
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return reasonSortDirection === 'asc' 
                    ? aVal.localeCompare(bVal)
                    : bVal.localeCompare(aVal);
            }
            
            return reasonSortDirection === 'asc' 
                ? (aVal as number) - (bVal as number)
                : (bVal as number) - (aVal as number);
        });
        return sorted;
    }, [analytics.byReason, reasonSortKey, reasonSortDirection]);

    const SortIcon = ({ column }: { column: SortKey }) => {
        if (reasonSortKey !== column) {
            return <span className="text-slate-600">↕</span>;
        }
        return reasonSortDirection === 'asc' ? <span className="text-cyan-400">↑</span> : <span className="text-cyan-400">↓</span>;
    };

    return (
        <>
            <h2 className="text-2xl font-bold leading-7 text-slate-100 sm:text-3xl sm:truncate font-heading">
                Analytics for <span className="text-cyan-500">{hotel.name}</span>
            </h2>
            
            {isLoading && (
                <div className="mt-8 space-y-8">
                    <div>
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Performance & ROI</h3>
                        <StatCardGridSkeleton cards={4} />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Overview</h3>
                        <StatCardGridSkeleton cards={4} />
                    </div>
                </div>
            )}
            
            {!isLoading && disputes.length === 0 && (
                <div className="mt-8 bg-slate-900/50 rounded-xl border border-slate-800">
                    <NoAnalyticsDataEmptyState />
                </div>
            )}
            
            {!isLoading && disputes.length > 0 && (
                <>
                    {/* ROI Metrics Section */}
                    {(analytics.revenueProtected > 0 || analytics.winRate > 0) && (
                        <div className="mt-8">
                            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Performance & ROI</h3>
                            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                                <StatCard 
                                    title="Revenue Protected" 
                                    value={formatCurrency(analytics.revenueProtected)}
                                    description="From won disputes"
                                    icon={<CollectionIcon />}
                                    className="bg-green-900/20 border-green-500/30"
                                    valueClassName="text-green-400"
                                />
                                <StatCard 
                                    title="Win Rate" 
                                    value={`${Math.round(analytics.winRate)}%`}
                                    description={`${analytics.disputesWon} won, ${analytics.disputesLost} lost`}
                                    icon={<TrendingUpIcon />}
                                    className="bg-cyan-900/20 border-cyan-500/30"
                                    valueClassName="text-cyan-400"
                                />
                                <StatCard 
                                    title="Time Saved" 
                                    value={`${analytics.timeSaved} hours`}
                                    description="From AI automation"
                                    icon={<RobotIcon className="h-6 w-6" />}
                                    className="bg-violet-900/20 border-violet-500/30"
                                    valueClassName="text-violet-400"
                                />
                                {analytics.avgResponseTime > 0 && (
                                    <StatCard 
                                        title="Avg Response Time" 
                                        value={`${Math.round(analytics.avgResponseTime)} days`}
                                        description="vs. 7-14 days industry avg"
                                        icon={<ExclamationTriangleIcon className="h-6 w-6" />}
                                        className="bg-yellow-900/20 border-yellow-500/30"
                                        valueClassName="text-yellow-400"
                                    />
                                )}
                            </div>
                        </div>
                    )}

                    {/* Overview Metrics */}
                    <div className="mt-8">
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Overview</h3>
                        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                            <StatCard 
                                title="Total Disputes" 
                                value={formatNumber(analytics.totalDisputes)} 
                                description={`${analytics.openDisputes} open, ${analytics.closedDisputes} closed`} 
                                icon={<CollectionIcon />} 
                            />
                            <StatCard 
                                title="Amount at Risk" 
                                value={formatCurrency(analytics.amountAtRisk)} 
                                description="In active disputes" 
                                icon={<ExclamationTriangleIcon />} 
                            />
                            <StatCard 
                                title="Total Recovered" 
                                value={formatCurrency(analytics.totalRecovered)} 
                                description="From won disputes" 
                                icon={<CashIcon />} 
                            />
                            <StatCard 
                                title="Average Dispute" 
                                value={formatCurrency(analytics.avgDisputeAmount)} 
                                description="Per dispute amount" 
                                icon={<TrendingUpIcon />} 
                            />
                        </div>
                    </div>

                    <div className="mt-8 bg-slate-900 shadow-md rounded-xl overflow-hidden border border-slate-800">
                        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                            <h3 className="text-lg font-medium text-slate-200 font-heading">Disputes by Reason</h3>
                            {analytics.byReason.length === 0 && (
                                <span className="text-sm text-slate-500">No data available</span>
                            )}
                        </div>
                        {analytics.byReason.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="min-w-full">
                                    <thead className="border-b border-slate-800 bg-slate-900/50">
                                        <tr>
                                            <th 
                                                className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-300 transition-colors"
                                                onClick={() => handleSort('reason')}
                                            >
                                                <div className="flex items-center gap-2">
                                                    Reason
                                                    <SortIcon column="reason" />
                                                </div>
                                            </th>
                                            <th 
                                                className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-300 transition-colors"
                                                onClick={() => handleSort('count')}
                                            >
                                                <div className="flex items-center gap-2">
                                                    Count
                                                    <SortIcon column="count" />
                                                </div>
                                            </th>
                                            <th 
                                                className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-300 transition-colors"
                                                onClick={() => handleSort('amount')}
                                            >
                                                <div className="flex items-center gap-2">
                                                    Total Amount
                                                    <SortIcon column="amount" />
                                                </div>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-slate-900 divide-y divide-slate-800">
                                        {sortedReasons.map((item) => (
                                            <tr key={item.reason} className="hover:bg-slate-800/50 transition-colors">
                                                <td className="px-6 py-5 text-sm font-medium text-slate-200 capitalize">
                                                    {item.reason}
                                                </td>
                                                <td className="px-6 py-5 text-sm text-slate-400">
                                                    {formatNumber(item.count)}
                                                </td>
                                                <td className="px-6 py-5 text-sm font-semibold text-slate-200">
                                                    {formatCurrency(item.totalAmount)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="p-12 text-center">
                                <p className="text-slate-400">No dispute reasons available</p>
                            </div>
                        )}
                    </div>
                </>
            )}
        </>
    );
};