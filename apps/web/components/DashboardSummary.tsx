import React, { useMemo } from 'react';
import type { Dispute, DashboardStats } from '../types';
import { RobotIcon } from './icons/RobotIcon';
import { BellIcon } from './icons/BellIcon';
import { CollectionIcon } from './icons/CollectionIcon';
import { StatCard } from './StatCard';
import { ExclamationTriangleIcon } from './icons/ExclamationTriangleIcon';

interface DashboardSummaryProps {
    allDisputes: Dispute[];
}

export const DashboardSummary: React.FC<DashboardSummaryProps> = ({ allDisputes }) => {

    const stats = useMemo(() => {
        const awaitingActionCount = allDisputes.filter(d => d.automationStatus === 'awaiting_info' || d.automationStatus === 'manual_review').length;
        const inProgressByAI = allDisputes.filter(d => ['auditing', 'responding'].includes(d.automationStatus)).length;

        const amountAtRisk = allDisputes.reduce((sum, dispute) => {
            if (dispute.stripeStatus === 'needs_response' || dispute.stripeStatus === 'under_review') {
                return sum + dispute.amount;
            }
            return sum;
        }, 0);

        return {
            totalCount: allDisputes.length,
            inProgressByAI,
            awaitingActionCount,
            amountAtRisk,
        };
    }, [allDisputes]);
    
    const formatCurrency = (amount: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);

    return (
        <div className="summary-cards">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard 
                    title="Total Amount at Risk" 
                    value={formatCurrency(stats.amountAtRisk)}
                    description="In open disputes"
                    icon={<ExclamationTriangleIcon className="h-6 w-6" />} 
                />
                <StatCard 
                    title="Awaiting Your Action" 
                    value={stats.awaitingActionCount} 
                    icon={<BellIcon className="h-6 w-6" />} 
                    description="Disputes needing info"
                />
                <StatCard 
                    title="In Progress by AI" 
                    value={stats.inProgressByAI} 
                    icon={<RobotIcon className="h-6 w-6" />}
                    description="Handled automatically"
                />
                <StatCard 
                    title="Total Open Disputes" 
                    value={stats.totalCount}
                    icon={<CollectionIcon />}
                    description="All open disputes"
                />
            </div>
        </div>
    );
}