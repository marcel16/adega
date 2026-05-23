import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import toast from 'react-hot-toast';
import { ExternalLink } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || '';

export default function Admin() {
  const router = useRouter();
  const [admin, setAdmin] = useState<any>(null);
  const [tab, setTab] = useState('dashboard');
  const [dashboard, setDashboard] = useState<any>({});
  const [clientes, setClientes] = useState<any[]>([]);
  const [planos, setPlanos] = useState<any[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) { router.push('/admin/login'); return; }
    loadDashboard(token);
    loadClientes(token);
    loadPlanos(token);
  }, []);

  const loadDashboard = async (token: string) => {
    const { data } = await axios.get(`${API}/api/admin/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setDashboard(data);
  };

  const loadClientes = async (token: string) => {
    const { data } = await axios.get(`${API}/api/admin/clientes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setClientes(data.data || []);
  };

  const loadPlanos = async (token: string) => {
    const { data } = await axios.get(`${API}/api/admin/planos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setPlanos(data || []);
  };

  const tabs = [
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'clientes', label: '👥 Clientes' },
    { id: 'planos', label: '💎 Planos' },
  ];

  const navLinks = [
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'clientes', label: '👥 Clientes' },
    { id: 'planos', label: '💎 Planos' },
    { href: '/admin/campanhas', label: '📢 Campanhas' },
    { href: '/admin/faturas', label: '💰 Faturas' },
    { href: '/admin/notificar', label: '🔔 Notificar' },
  ];

  if (!dashboard) return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">Carregando...</div>;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 p-4 flex flex-col">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-amber-400">🍷 Adega Admin</h1>
          <p className="text-xs text-gray-500 mt-1">Painel de Administração</p>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {navLinks.map(item => (
            <button
              key={item.id || item.href}
              onClick={() => item.href ? router.push(item.href) : setTab(item.id!)}
              className={`text-left px-3 py-2 rounded-lg text-sm transition flex items-center justify-between ${
                (item.id && tab === item.id) || (item.href && router.pathname === item.href)
                  ? 'bg-amber-600/20 text-amber-400'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <span>{item.label}</span>
              {item.href && <ExternalLink size={12} className="opacity-40" />}
            </button>
          ))}
        </nav>
        <button
          onClick={() => { localStorage.clear(); router.push('/admin/login'); }}
          className="text-gray-500 hover:text-red-400 text-sm text-left px-3 py-2"
        >
          ← Sair
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 p-6 overflow-auto">
        {tab === 'dashboard' && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Dashboard</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Total Clientes', value: dashboard.totalClientes, color: 'text-blue-400', bg: 'bg-blue-900/20' },
                { label: 'Clientes Ativos', value: dashboard.clientesAtivos, color: 'text-green-400', bg: 'bg-green-900/20' },
                { label: 'TVs Conectadas', value: dashboard.totalTVs, color: 'text-purple-400', bg: 'bg-purple-900/20' },
                { label: 'Receita (Mês)', value: `R$ ${Number(dashboard.receitaMes || 0).toFixed(2)}`, color: 'text-amber-400', bg: 'bg-amber-900/20' },
              ].map(card => (
                <div key={card.label} className={`${card.bg} rounded-xl p-5 border border-gray-800`}>
                  <p className="text-sm text-gray-400">{card.label}</p>
                  <p className={`text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'clientes' && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Clientes ({clientes.length})</h2>
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Adega</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Dono</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Plano</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">TVs</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.map(c => (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/admin/clientes/${c.id}`)}
                      className="border-t border-gray-800 hover:bg-gray-800/50 cursor-pointer"
                    >
                      <td className="px-4 py-3 font-medium">{c.nomeAdega}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">{c.nome}</td>
                      <td className="px-4 py-3 text-sm">{c.plano?.nome || '—'}</td>
                      <td className="px-4 py-3 text-sm">{c._count?.tvs || 0}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${c.ativo ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
                          {c.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'planos' && (
          <div>
            <h2 className="text-2xl font-bold mb-4">Planos</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {planos.map(p => (
                <div key={p.id} className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                  <h3 className="text-lg font-bold">{p.nome}</h3>
                  <p className="text-sm text-gray-400 mt-1">{p.descricao}</p>
                  <div className="mt-4 space-y-1">
                    <p className="text-2xl font-bold text-amber-400">R$ {Number(p.valorMensal).toFixed(2)}<span className="text-sm text-gray-500">/mês</span></p>
                    <p className="text-sm text-gray-500">R$ {Number(p.valorAnual).toFixed(2)}/ano</p>
                  </div>
                  <div className="mt-4 space-y-1">
                    <p className="text-xs text-gray-500">📺 Até {p.maxTVs} TVs</p>
                    <p className="text-xs text-gray-500">📢 Até {p.maxPromocoes} promoções</p>
                    <p className="text-xs text-gray-500">🎬 Até {p.maxMidias} mídias</p>
                    <p className="text-xs text-gray-500">🔧 Módulos: {(p.modulos || []).join(', ')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
