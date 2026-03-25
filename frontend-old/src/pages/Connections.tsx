import { useState, useEffect } from 'react';
import api from '../api';

interface Connection {
  id: number;
  name: string;
  type: string;
  host: string;
  port: number;
  database: string;
  username: string;
  created_at: string;
}

const defaultPorts: Record<string, number> = {
  postgres: 5432,
  mysql: 3306,
  mongodb: 27017,
  sqlite: 0,
};

export default function Connections() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ id: number; success: boolean; message: string } | null>(null);
  const [form, setForm] = useState({
    name: '', type: 'postgres', host: 'localhost', port: 5432, database: '', username: '', password: '',
  });

  const fetchConnections = () => {
    api.get('/connections').then((res) => setConnections(res.data));
  };

  useEffect(() => { fetchConnections(); }, []);

  const handleTypeChange = (type: string) => {
    setForm({ ...form, type, port: defaultPorts[type] || 0 });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/connections', form);
    setShowForm(false);
    setForm({ name: '', type: 'postgres', host: 'localhost', port: 5432, database: '', username: '', password: '' });
    fetchConnections();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this connection?')) return;
    await api.delete(`/connections/${id}`);
    fetchConnections();
  };

  const handleTest = async (id: number) => {
    setTesting(id);
    setTestResult(null);
    try {
      const res = await api.post(`/connections/${id}/test`);
      setTestResult({ id, success: res.data.success, message: res.data.message || res.data.error });
    } catch {
      setTestResult({ id, success: false, message: 'Test failed' });
    } finally {
      setTesting(null);
    }
  };

  const handleBackupNow = async (id: number) => {
    await api.post(`/backups/trigger/${id}`);
    alert('Backup triggered!');
  };

  const isSqlite = form.type === 'sqlite';

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Database Connections</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium"
        >
          {showForm ? 'Cancel' : 'Add Connection'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <input
                required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Type</label>
              <select
                value={form.type} onChange={(e) => handleTypeChange(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="postgres">PostgreSQL</option>
                <option value="mysql">MySQL</option>
                <option value="mongodb">MongoDB</option>
                <option value="sqlite">SQLite</option>
              </select>
            </div>
            {!isSqlite && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Host</label>
                  <input
                    value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Port</label>
                  <input
                    type="number" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {isSqlite ? 'File Path' : 'Database'}
              </label>
              <input
                required value={form.database} onChange={(e) => setForm({ ...form, database: e.target.value })}
                placeholder={isSqlite ? '/path/to/database.db' : ''}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            {!isSqlite && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Username</label>
                  <input
                    value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Password</label>
                  <input
                    type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end">
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium">
              Save Connection
            </button>
          </div>
        </form>
      )}

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Host</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Database</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {connections.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No connections yet. Add one to get started.
                </td>
              </tr>
            ) : (
              connections.map((conn) => (
                <tr key={conn.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{conn.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                      {conn.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {conn.type === 'sqlite' ? '-' : `${conn.host}:${conn.port}`}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{conn.database}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-2">
                    <button
                      onClick={() => handleTest(conn.id)}
                      disabled={testing === conn.id}
                      className="text-indigo-600 hover:text-indigo-900 disabled:opacity-50"
                    >
                      {testing === conn.id ? 'Testing...' : 'Test'}
                    </button>
                    <button
                      onClick={() => handleBackupNow(conn.id)}
                      className="text-green-600 hover:text-green-900"
                    >
                      Backup Now
                    </button>
                    <button
                      onClick={() => handleDelete(conn.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Delete
                    </button>
                    {testResult && testResult.id === conn.id && (
                      <span className={testResult.success ? 'text-green-600' : 'text-red-600'}>
                        {testResult.message}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
