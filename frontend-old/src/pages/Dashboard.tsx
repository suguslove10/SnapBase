import { useState, useEffect } from 'react';
import api from '../api';

interface Stats {
  total_backups: number;
  storage_used: number;
  active_schedules: number;
  last_backup_status: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function statusColor(status: string): string {
  switch (status) {
    case 'success': return 'text-green-600 bg-green-50';
    case 'failed': return 'text-red-600 bg-red-50';
    case 'running': return 'text-blue-600 bg-blue-50';
    case 'pending': return 'text-yellow-600 bg-yellow-50';
    default: return 'text-gray-600 bg-gray-50';
  }
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api.get('/backups/stats').then((res) => setStats(res.data));
  }, []);

  if (!stats) {
    return <div className="text-center py-12 text-gray-500">Loading...</div>;
  }

  const cards = [
    { label: 'Total Backups', value: stats.total_backups.toString() },
    { label: 'Storage Used', value: formatBytes(stats.storage_used) },
    { label: 'Active Schedules', value: stats.active_schedules.toString() },
    { label: 'Last Backup', value: stats.last_backup_status, isStatus: true },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => (
          <div key={card.label} className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">{card.label}</dt>
              <dd className="mt-1 text-3xl font-semibold">
                {card.isStatus ? (
                  <span className={`inline-flex px-2 py-1 text-sm rounded-full ${statusColor(card.value)}`}>
                    {card.value}
                  </span>
                ) : (
                  <span className="text-gray-900">{card.value}</span>
                )}
              </dd>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
