import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  DollarSign,
  Search,
  Filter,
  Download,
  Check,
  X,
  Clock,
  ArrowUpDown,
  Store,
  Loader2,
} from 'lucide-react';
import Pagination from '@/components/Pagination';

const API = process.env.NEXT_PUBLIC_API_URL || '';

interface Fatura {
  id: string;
  clienteId: string;
  cliente?: {
    id: string;
    nome: string;
    nomeAdega: string;
  };
  valor: number;
  status: 'pendente' | 'pago' | 'vencido' | 'cancelado';
  referencia: string;
  dataVencimento: string;
  dataPagamento?: string;
  metodoPagamento?: string;
  createdAt: string;
}

export default function AdminFaturas() {
  const router = useRouter();
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [stats, setStats] = useState({ total: 0, pago: 0, pendente: 0, vencido: 0, receita: 0 });

  const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;

  useEffect(() => {
    if (!token) {
      router.push('/admin/login');
      return;
    }
    loadFaturas();
    loadStats();
  }, [page, statusFilter]);

  const loadFaturas = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 15 };
      if (statusFilter !== 'todos') params.status = statusFilter;
      if (search) params.search = search;

      const { data } = await axios.get(`${API}/api/admin/faturas`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      setFaturas(data.data || data);
      setTotalPages(data.totalPages || Math.ceil((data.total || (data.data || data).length) / 15));
      setTotal(data.total || (data.data || data).length);
    } catch {
      toast.error('Erro ao carregar faturas');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const { data } = await axios.get(`${API}/api/admin/faturas/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(data);
    } catch {}
  };

  const handleMarkPaid = async (fatura: Fatura) => {
    try {
      await axios.patch(
        `${API}/api/admin/faturas/${fatura.id}`,
        { status: 'pago' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Fatura marcada como paga!');
      loadFaturas();
      loadStats();
    } catch {
      toast.error('Erro ao alterar fatura');
    }
  };

  const handleCancel = async (fatura: Fatura) => {
    if (!confirm('Cancelar esta fatura?')) return;
    try {
      await axios.patch(
        `${API}/api/admin/faturas/${fatura.id}`,
        { status: 'cancelado' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Fatura cancelada');
      loadFaturas();
      loadStats();
    } catch {
      toast.error('Erro ao cancelar fatura');
    }
  };

  const handleExport = async () => {
    try {
      const { data } = await axios.get(`${API}/api/admin/faturas/export`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'faturas.csv';
      a.click();
      toast.success('Exportando faturas...');
    } catch {
      toast.error('Erro ao exportar');
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatDate = (date?: string) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const statusColors: Record<string, string> = {
    pendente: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/30',
    pago: 'bg-green-900/30 text-green-400 border-green-700/30',
    vencido: 'bg-red-900/30 text-red-400 border-red-700/30',
    cancelado: 'bg-gray-700 text-gray-500 border-gray-600/30',
  };

  const statusLabels: Record<string, string> = {
    pendente: 'Pendente',
    pago: 'Pago',
    vencido: 'Vencido',
    cancelado: 'Cancelado',
  };

  const statusIcons: Record<string, React.ReactNode> = {
    pendente: <Clock size={12} />,
    pago: <Check size={12} />,
    vencido: <X size={12} />,
    cancelado: <X size={12} />,
  };

  const statusFilters = [
    { id: 'todos', label: 'Todas', color: '' },
    { id: 'pendente', label: 'Pendentes', color: 'text-yellow-400' },
    { id: 'pago', label: 'Pagas', color: 'text-green-400' },
    { id: 'vencido', label: 'Vencidas', color: 'text-red-400' },
    { id: 'cancelado', label: 'Canceladas', color: 'text-gray-400' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 p-4 flex flex-col">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-amber-400">🍷 Adega Admin</h1>
          <p className="text-xs text-gray-500 mt-1">Faturas</p>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {[
            { href: '/admin', label: '📊 Dashboard' },
            { href: '/admin/campanhas', label: '📢 Campanhas' },
            { href: '/admin/faturas', label: '💰 Faturas', active: true },
            { href: '/admin/notificar', label: '🔔 Notificar' },
          ].map((item) => (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`text-left px-3 py-2 rounded-lg text-sm transition ${
                item.active
                  ? 'bg-amber-600/20 text-amber-400'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button
          onClick={() => {
            localStorage.clear();
            router.push('/admin/login');
          }}
          className="text-gray-500 hover:text-red-400 text-sm text-left px-3 py-2"
        >
          ← Sair
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 p-6 overflow-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-2xl font-bold">Faturas</h2>
            <p className="text-sm text-gray-400 mt-1">Gerenciamento de pagamentos</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm transition"
            >
              <Download size={16} />
              Exportar CSV
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <p className="text-xs text-gray-500 mb-1">Total</p>
            <p className="text-xl font-bold">{stats.total || total}</p>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <p className="text-xs text-green-400/70 mb-1">Pagas</p>
            <p className="text-xl font-bold text-green-400">{stats.pago || 0}</p>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <p className="text-xs text-yellow-400/70 mb-1">Pendentes</p>
            <p className="text-xl font-bold text-yellow-400">{stats.pendente || 0}</p>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <p className="text-xs text-red-400/70 mb-1">Vencidas</p>
            <p className="text-xl font-bold text-red-400">{stats.vencido || 0}</p>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <p className="text-xs text-amber-400/70 mb-1">Receita Total</p>
            <p className="text-xl font-bold text-amber-400">{formatCurrency(stats.receita || 0)}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
          <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
            {statusFilters.map((sf) => (
              <button
                key={sf.id}
                onClick={() => setStatusFilter(sf.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  statusFilter === sf.id
                    ? 'bg-gray-800 text-white'
                    : `text-gray-500 hover:text-gray-300 ${sf.color}`
                }`}
              >
                {sf.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadFaturas()}
              placeholder="Buscar por cliente ou referência..."
              className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
            />
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-12 text-gray-500">
            <Loader2 size={24} className="animate-spin mx-auto mb-3" />
            Carregando...
          </div>
        )}

        {/* Empty */}
        {!loading && faturas.length === 0 && (
          <div className="text-center py-16 bg-gray-900/50 rounded-2xl border border-dashed border-gray-800">
            <DollarSign size={40} className="mx-auto text-gray-600 mb-3" />
            <h3 className="text-lg font-medium mb-1">Nenhuma fatura encontrada</h3>
            <p className="text-sm text-gray-500">
              {statusFilter !== 'todos'
                ? 'Nenhuma fatura neste status'
                : search
                  ? 'Nenhum resultado para esta busca'
                  : 'As faturas dos clientes aparecerão aqui'}
            </p>
          </div>
        )}

        {/* Table */}
        {!loading && faturas.length > 0 && (
          <>
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-800/50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                      <div className="flex items-center gap-1">
                        Cliente
                        <ArrowUpDown size={12} />
                      </div>
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Referência
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Valor
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Vencimento
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Pagamento
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {faturas.map((f) => (
                    <tr key={f.id} className="hover:bg-gray-800/30 transition">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => router.push(`/admin/clientes/${f.clienteId}`)}
                          className="flex items-center gap-2 text-left hover:text-amber-400 transition"
                        >
                          <Store size={14} className="text-gray-500" />
                          <div>
                            <p className="text-sm font-medium">{f.cliente?.nomeAdega || '—'}</p>
                            <p className="text-xs text-gray-500">{f.cliente?.nome}</p>
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-gray-300">
                        {f.referencia}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono">
                        {formatCurrency(Number(f.valor))}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {formatDate(f.dataVencimento)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDate(f.dataPagamento)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${statusColors[f.status]}`}
                        >
                          {statusIcons[f.status]}
                          {statusLabels[f.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(f.status === 'pendente' || f.status === 'vencido') && (
                            <button
                              onClick={() => handleMarkPaid(f)}
                              className="flex items-center gap-1 text-xs text-green-400 hover:bg-green-900/20 px-2 py-1 rounded-lg transition"
                              title="Marcar como pago"
                            >
                              <Check size={14} />
                              Pagar
                            </button>
                          )}
                          <button
                            onClick={() => handleCancel(f)}
                            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition"
                            title="Cancelar"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
              total={total}
              perPage={15}
            />
          </>
        )}
      </main>
    </div>
  );
}
