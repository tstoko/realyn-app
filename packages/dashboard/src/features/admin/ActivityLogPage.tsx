
import React from 'react';
import { useActivityLog } from '../../hooks/useActivityLog';
import { Spinner } from '@realyn/shared';

export const ActivityLogPage: React.FC = () => {
  const { activityLog, loading } = useActivityLog();

  const timeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-50 sm:text-3xl font-heading">Global Activity Log</h2>
      <p className="mt-1 text-base text-slate-400">A feed of recent actions across all properties.</p>
      
      <div className="mt-8 bg-slate-900 shadow-md rounded-xl border border-slate-800">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Spinner />
          </div>
        ) : (
          <ul className="divide-y divide-slate-800">
            {activityLog.map((item) => (
              <li key={item.id} className="p-4 sm:p-6 hover:bg-slate-800/50">
                <div className="flex items-center justify-between space-x-4">
                  <p className="text-sm text-slate-300 truncate min-w-0 flex-1">
                    <span className="font-semibold text-white">{item.user.name}</span>{' '}
                    {item.action}{' '}
                    <span className="font-semibold text-cyan-400">{item.target.name}</span>
                  </p>
                  <time className="flex-shrink-0 text-xs text-slate-500">
                    {timeAgo(item.timestamp)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
