import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Tv,
  CreditCard,
  FileText,
  Activity,
  Mail,
  Phone,
  Calendar,
  Store,
  User,
  Check,
  X,
  RefreshCw,
  Eye,
  EyeOff,
  DollarSign,
  Loader2,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || '';

interface Cliente {
  id: string;
  nome: string;
  nomeAdega: string;
  email: string;
  telefone?: string;
  logo?: string;
  slug: string;
  ativo: boolean;
  plano?: any;
  planoId?: string;
  createdAt: string;
}

interface TV {
  id: string;
  nome?: string;
  numero: number;
  ativa: boolean;
  ultimoPing?: string;
  clienteId: string;
}

interface Fatura {
  id: string;
  valor: number;
  status: 'pendente' | 'pago' | 'vencido' | 'cancelado';
  referencia: string;
  dataVencimento: string;
  dataPagamento?: string;
  createdAt: string;
}

export default function ClienteDetalhe() {
  const router = useRouter();
  const { id } = router.query;

  const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [tvs, setTVs] = useState<TV[]>([]);
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'info' | 'tvs' | 'faturas'>('info');
  const [togglingStatus, setTogglingStatus] = useState(false);

  useEffect(() => {
    if (!token) {
      router.push('/admin/login');
      return;
    }
    if (id) {
      loadCliente();
      loadTVs();
      loadFaturas();
    }
  }, [id]);

  const loadCliente = async () => {
    try {
      const { data } = await axios.get(`${API}/api/admin/clientes/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCliente(data);
    } catch {
      toast.error('Erro ao carregar cliente');
      router.push('/admin');
    } finally {
      setLoading(false);
    }
  };

  const loadTVs = async () => {
    try {
      const { data } = await axios.get(`${API}/api/admin/clientes/${id}/tvs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTVs(data.data || data);
    } catch {
      toast.error('Erro ao carregar TVs');
    }
  };

  const loadFaturas = async () => {
    try {
      const { data } = await axios.get(`${API}/api/admin/clientes/${id}/faturas`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setFaturas(data.data || data);
    } catch {
      toast.error('Erro ao carregar faturas');
    }
  };

  const handleToggleStatus = async () => {
    if (!cliente) return;
    setTogglingStatus(true);
    try {
      await axios.patch(
        `${API}/api/admin/clientes/${cliente.id}`,
        { ativo: !cliente.ativo },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCliente({ ...cliente, ativo: !cliente.ativo });
      toast.success(cliente.ativo ? 'Cliente desativado' : 'Cliente ativado!');
    } catch {
      toast.error('Erro ao alterar status');
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleRegenerateSlug = async () => {
    try {
      const { data } = await axios.post(
        `${API}/api/admin/clientes/${id}/regenerate-slug`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCliente((prev) => (prev ? { ...prev, slug: data.slug } : null));
      toast.success('Slug regenerado!');
    } catch {
      toast.error('Erro ao regenerar slug');
    }
  };

  const handleToggleTV = async (tv: TV) => {
    try {
      await axios.patch(
        `${API}/api/admin/tvs/${tv.id}`,
        { ativa: !tv.ativa },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setTVs((prev) => prev.map((t) => (t.id === tv.id ? { ...t, ativa: !t.ativa } : t)));
      toast.success(tv.ativa ? 'TV desativada' : 'TV ativada!');
    } catch {
      toast.error('Erro ao alterar TV');
    }
  };

  const handleToggleFaturaStatus = async (fatura: Fatura) => {
    try {
      const novoStatus = fatura.status === 'pendente' ? 'pago' : 'pendente';
      await axios.patch(
        `${API}/api/admin/faturas/${fatura.id}`,
        { status: novoStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setFaturas((prev) =>
        prev.map((f) => (f.id === fatura.id ? { ...f, status: novoStatus, dataPagamento: novoStatus === 'pago' ? new Date().toISOString() : undefined } : f))
      );
      toast.success('Status da fatura atualizado!');
    } catch {
      toast.error('Erro ao alterar fatura');
    }
  };

  const formatDate = (date?: string) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('pt-BR');
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const faturaStatusColors: Record<string, string> = {
    pendente: 'bg-yellow-900/30 text-yellow-400',
    pago: 'bg-green-900/30 text-green-400',
    vencido: 'bg-red-900/30 text-red-400',
    cancelado: 'bg-gray-700 text-gray-500',
  };

  const faturaStatusLabels: Record<string, string> = {
    pendente: 'Pendente',
    pago: 'Pago',
    vencido: 'Vencido',
    cancelado: 'Cancelado',
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-amber-400" />
      </div>
    );
  }

  if (!cliente) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 p-4 flex flex-col">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-amber-400">🍷 Adega Admin</h1>
          <p className="text-xs text-gray-500 mt-1">Detalhes do Cliente</p>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {[
            { href: '/admin', label: '📊 Dashboard' },
            { href: '/admin/campanhas', label: '📢 Campanhas' },
            { href: '/admin/faturas', label: '💰 Faturas' },
            { href: '/admin/notificar', label: '🔔 Notificar' },
          ].map((item) => (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className="text-left px-3 py-2 rounded-lg text-sm transition text-gray-400 hover:text-white hover:bg-gray-800"
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
        {/* Back + Profile Header */}
        <button
          onClick={() => router.push('/admin')}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-white mb-4 transition"
        >
          <ArrowLeft size={16} />
          Voltar para clientes
        </button>

        {/* Client Header */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {cliente.logo ? (
                <img src={cliente.logo} alt="Logo" className="h-16 w-16 rounded-xl object-cover" />
              ) : (
                <div className="h-16 w-16 rounded-xl bg-gray-800 flex items-center justify-center text-2xl font-bold text-amber-400">
                  {cliente.nomeAdega?.charAt(0) || 'A'}
                </div>
              )}
              <div>
                <h2 className="text-2xl font-bold">{cliente.nomeAdega}</h2>
                <p className="text-sm text-gray-400">{cliente.nome}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <Mail size={12} />
                    {cliente.email}
                  </span>
                  {cliente.telefone && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Phone size={12} />
                      {cliente.telefone}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                cliente.ativo
                  ? 'bg-green-900/30 text-green-400'
                  : 'bg-red-900/30 text-red-400'
              }`}>
                {cliente.ativo ? 'Ativo' : 'Inativo'}
              </span>
              <button
                onClick={handleToggleStatus}
                disabled={togglingStatus}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg text-sm transition"
              >
                {cliente.ativo ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500">TVs</p>
              <p className="text-lg font-bold">{tvs.length}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500">Plano</p>
              <p className="text-lg font-bold text-amber-400">{cliente.plano?.nome || '—'}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500">Faturas</p>
              <p className="text-lg font-bold">{faturas.length}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500">Cliente desde</p>
              <p className="text-lg font-bold">{formatDate(cliente.createdAt)}</p>
            </div>
          </div>

          {/* Slug */}
          <div className="mt-4 flex items-center gap-3 text-sm">
            <span className="text-gray-500">Slug:</span>
            <code className="bg-gray-800 px-3 py-1 rounded text-amber-400 font-mono text-xs">
              {cliente.slug}
            </code>
            <button
              onClick={handleRegenerateSlug}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-amber-400"
            >
              <RefreshCw size={12} />
              Regenerar
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-900 rounded-lg p-1 mb-6">
          {[
            { id: 'info', icon: User, label: 'Informações' },
            { id: 'tvs', icon: Tv, label: `TVs (${tvs.length})` },
            { id: 'faturas', icon: DollarSign, label: `Faturas (${faturas.length})` },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition ${
                  tab === t.id
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <Icon size={16} />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab: Informações */}
        {tab === 'info' && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileText size={18} className="text-amber-400" />
              Informações da Conta
            </h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wider">Nome do Dono</dt>
                <dd className="text-white mt-1">{cliente.nome}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wider">Nome da Adega</dt>
                <dd className="text-white mt-1">{cliente.nomeAdega}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wider">Email</dt>
                <dd className="text-white mt-1">{cliente.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wider">Telefone</dt>
                <dd className="text-white mt-1">{cliente.telefone || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wider">Plano</dt>
                <dd className="text-amber-400 mt-1">{cliente.plano?.nome || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wider">Status</dt>
                <dd className="mt-1">
                  {cliente.ativo ? (
                    <span className="flex items-center gap-1 text-green-400">
                      <Check size={14} /> Ativo
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-400">
                      <X size={14} /> Inativo
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wider">Criado em</dt>
                <dd className="text-white mt-1">{new Date(cliente.createdAt).toLocaleString('pt-BR')}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wider">Slug</dt>
                <dd className="mt-1">
                  <code className="bg-gray-800 px-2 py-0.5 rounded text-amber-400 text-xs">
                    {cliente.slug}
                  </code>
                </dd>
              </div>
            </dl>
          </div>
        )}

        {/* Tab: TVs */}
        {tab === 'tvs' && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Tv size={18} className="text-amber-400" />
                TVs Conectadas ({tvs.length})
              </h3>
            </div>
            {tvs.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Tv size={32} className="mx-auto mb-2 opacity-30" />
                <p>Nenhuma TV conectada</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-800/50">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">#</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">Nome</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">Status</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">Último Ping</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-400 uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {tvs.map((tv) => (
                    <tr key={tv.id} className="hover:bg-gray-800/30 transition">
                      <td className="px-6 py-3 text-sm text-gray-500 font-mono">{tv.numero}</td>
                      <td className="px-6 py-3 text-sm">{tv.nome || `TV ${tv.numero}`}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          tv.ativa ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                        }`}>
                          {tv.ativa ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500">
                        {tv.ultimoPing ? new Date(tv.ultimoPing).toLocaleString('pt-BR') : 'Nunca'}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={() => handleToggleTV(tv)}
                          className={`p-1.5 rounded-lg transition ${
                            tv.ativa
                              ? 'text-green-400 hover:bg-green-900/20'
                              : 'text-gray-500 hover:bg-gray-700'
                          }`}
                          title={tv.ativa ? 'Desativar' : 'Ativar'}
                        >
                          {tv.ativa ? <Eye size={16} /> : <EyeOff size={16} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab: Faturas */}
        {tab === 'faturas' && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <DollarSign size={18} className="text-amber-400" />
                Faturas ({faturas.length})
              </h3>
              <p className="text-sm text-gray-400">
                Total:{' '}
                <span className="text-white font-medium">
                  {formatCurrency(
                    faturas.reduce((acc, f) => acc + Number(f.valor), 0)
                  )}
                </span>
              </p>
            </div>
            {faturas.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FileText size={32} className="mx-auto mb-2 opacity-30" />
                <p>Nenhuma fatura gerada</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-800/50">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">Ref.</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">Valor</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">Vencimento</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">Pagamento</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">Status</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-400 uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {faturas.map((f) => (
                    <tr key={f.id} className="hover:bg-gray-800/30 transition">
                      <td className="px-6 py-3 text-sm font-medium">{f.referencia}</td>
                      <td className="px-6 py-3 text-sm">{formatCurrency(Number(f.valor))}</td>
                      <td className="px-6 py-3 text-sm">{formatDate(f.dataVencimento)}</td>
                      <td className="px-6 py-3 text-sm text-gray-500">{formatDate(f.dataPagamento)}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${faturaStatusColors[f.status]}`}>
                          {faturaStatusLabels[f.status]}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        {(f.status === 'pendente' || f.status === 'vencido') && (
                          <button
                            onClick={() => handleToggleFaturaStatus(f)}
                            className="flex items-center gap-1 text-xs text-green-400 hover:bg-green-900/20 px-2 py-1 rounded-lg transition ml-auto"
                            title="Marcar como pago"
                          >
                            <Check size={14} />
                            Marcar Pago
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
