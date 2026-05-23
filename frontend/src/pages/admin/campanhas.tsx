import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Calendar,
  Users,
  Store,
  Search,
  Loader2,
  Save,
} from 'lucide-react';
import Modal from '@/components/Modal';
import Pagination from '@/components/Pagination';

const API = process.env.NEXT_PUBLIC_API_URL || '';

interface Campanha {
  id: string;
  titulo: string;
  descricao: string;
  tipo: 'promocao' | 'midia' | 'banner';
  conteudo: string;
  ativa: boolean;
  dataInicio: string;
  dataFim: string;
  clienteIds: string[];
  clientes?: any[];
  createdAt: string;
}

interface CampanhaForm {
  titulo: string;
  descricao: string;
  tipo: 'promocao' | 'midia' | 'banner';
  conteudo: string;
  dataInicio: string;
  dataFim: string;
  clienteIds: string[];
}

const emptyForm: CampanhaForm = {
  titulo: '',
  descricao: '',
  tipo: 'promocao',
  conteudo: '',
  dataInicio: '',
  dataFim: '',
  clienteIds: [],
};

export default function AdminCampanhas() {
  const router = useRouter();
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Campanha | null>(null);
  const [form, setForm] = useState<CampanhaForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;

  useEffect(() => {
    if (!token) {
      router.push('/admin/login');
      return;
    }
    loadCampanhas();
    loadClientes();
  }, [page]);

  const loadCampanhas = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 10 };
      if (search) params.search = search;

      const { data } = await axios.get(`${API}/api/admin/campanhas`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      setCampanhas(data.data || data);
      setTotalPages(data.totalPages || Math.ceil((data.total || (data.data || data).length) / 10));
      setTotal(data.total || (data.data || data).length);
    } catch {
      toast.error('Erro ao carregar campanhas');
    } finally {
      setLoading(false);
    }
  };

  const loadClientes = async () => {
    try {
      const { data } = await axios.get(`${API}/api/admin/clientes`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 1000 },
      });
      setClientes(data.data || data);
    } catch {}
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (campanha: Campanha) => {
    setEditing(campanha);
    setForm({
      titulo: campanha.titulo,
      descricao: campanha.descricao,
      tipo: campanha.tipo,
      conteudo: campanha.conteudo,
      dataInicio: campanha.dataInicio ? campanha.dataInicio.slice(0, 16) : '',
      dataFim: campanha.dataFim ? campanha.dataFim.slice(0, 16) : '',
      clienteIds: campanha.clienteIds || [],
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titulo.trim()) {
      toast.error('Informe o título');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await axios.put(`${API}/api/admin/campanhas/${editing.id}`, form, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Campanha atualizada!');
      } else {
        await axios.post(`${API}/api/admin/campanhas`, form, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Campanha criada!');
      }
      setModalOpen(false);
      loadCampanhas();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao salvar campanha');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta campanha?')) return;
    try {
      await axios.delete(`${API}/api/admin/campanhas/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Campanha excluída!');
      loadCampanhas();
    } catch {
      toast.error('Erro ao excluir campanha');
    }
  };

  const handleToggle = async (campanha: Campanha) => {
    try {
      await axios.patch(
        `${API}/api/admin/campanhas/${campanha.id}`,
        { ativa: !campanha.ativa },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(campanha.ativa ? 'Campanha desativada' : 'Campanha ativada!');
      loadCampanhas();
    } catch {
      toast.error('Erro ao alterar status');
    }
  };

  const toggleCliente = (clienteId: string) => {
    setForm((prev) => {
      const ids = new Set(prev.clienteIds);
      if (ids.has(clienteId)) ids.delete(clienteId);
      else ids.add(clienteId);
      return { ...prev, clienteIds: Array.from(ids) };
    });
  };

  const selectAllClientes = () => {
    if (form.clienteIds.length === clientes.length) {
      setForm({ ...form, clienteIds: [] });
    } else {
      setForm({ ...form, clienteIds: clientes.map((c) => c.id) });
    }
  };

  const tipoOptions = [
    { value: 'promocao', label: 'Promoção' },
    { value: 'midia', label: 'Mídia' },
    { value: 'banner', label: 'Banner' },
  ];

  const getStatusBadge = (campanha: Campanha) => {
    const now = new Date();
    const inicio = new Date(campanha.dataInicio);
    const fim = new Date(campanha.dataFim);

    if (!campanha.ativa) {
      return { label: 'Inativa', color: 'bg-gray-700 text-gray-400' };
    }
    if (campanha.dataInicio && now < inicio) {
      return { label: 'Agendada', color: 'bg-blue-900/30 text-blue-400' };
    }
    if (campanha.dataFim && now > fim) {
      return { label: 'Expirada', color: 'bg-red-900/30 text-red-400' };
    }
    return { label: 'Ativa', color: 'bg-green-900/30 text-green-400' };
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 p-4 flex flex-col">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-amber-400">🍷 Adega Admin</h1>
          <p className="text-xs text-gray-500 mt-1">Campanhas</p>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {[
            { href: '/admin', label: '📊 Dashboard' },
            { href: '/admin/campanhas', label: '📢 Campanhas', active: true },
            { href: '/admin/faturas', label: '💰 Faturas' },
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
            <h2 className="text-2xl font-bold">Campanhas</h2>
            <p className="text-sm text-gray-400 mt-1">{total} campanha(s)</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadCampanhas()}
                placeholder="Buscar..."
                className="pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400 w-48"
              />
            </div>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              <Plus size={18} />
              Nova Campanha
            </button>
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
        {!loading && campanhas.length === 0 && (
          <div className="text-center py-16 bg-gray-900/50 rounded-2xl border border-dashed border-gray-800">
            <p className="text-4xl mb-3">📢</p>
            <h3 className="text-lg font-medium mb-1">Nenhuma campanha</h3>
            <p className="text-sm text-gray-500 mb-4">Crie campanhas para distribuir aos clientes</p>
            <button
              onClick={openCreate}
              className="bg-amber-600 hover:bg-amber-500 px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              Criar Primeira Campanha
            </button>
          </div>
        )}

        {/* Table */}
        {!loading && campanhas.length > 0 && (
          <>
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-800/50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Campanha
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Tipo
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Período
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Clientes
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
                  {campanhas.map((c) => {
                    const status = getStatusBadge(c);
                    return (
                      <tr key={c.id} className="hover:bg-gray-800/30 transition">
                        <td className="px-4 py-4">
                          <p className="font-medium text-white">{c.titulo}</p>
                          {c.descricao && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{c.descricao}</p>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            c.tipo === 'promocao' ? 'bg-amber-900/30 text-amber-400' :
                            c.tipo === 'midia' ? 'bg-purple-900/30 text-purple-400' :
                            'bg-blue-900/30 text-blue-400'
                          }`}>
                            {c.tipo === 'promocao' ? 'Promoção' : c.tipo === 'midia' ? 'Mídia' : 'Banner'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-400">
                          {c.dataInicio ? (
                            <>
                              <p>{new Date(c.dataInicio).toLocaleDateString('pt-BR')}</p>
                              {c.dataFim && <p className="text-xs">até {new Date(c.dataFim).toLocaleDateString('pt-BR')}</p>}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span className="flex items-center gap-1 text-sm text-gray-400">
                            <Users size={14} />
                            {c.clienteIds?.length || 'Todos'}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`px-2 py-0.5 rounded text-xs ${status.color}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleToggle(c)}
                              className={`p-1.5 rounded-lg transition ${
                                c.ativa
                                  ? 'text-green-400 hover:bg-green-900/20'
                                  : 'text-gray-500 hover:bg-gray-700'
                              }`}
                              title={c.ativa ? 'Desativar' : 'Ativar'}
                            >
                              {c.ativa ? <Eye size={16} /> : <EyeOff size={16} />}
                            </button>
                            <button
                              onClick={() => openEdit(c)}
                              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition"
                              title="Editar"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(c.id)}
                              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition"
                              title="Excluir"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
              total={total}
              perPage={10}
            />
          </>
        )}
      </main>

      {/* Modal: Create / Edit */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar Campanha' : 'Nova Campanha'}
        size="xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Título *</label>
              <input
                type="text"
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
                placeholder="Ex: Promoção de Verão"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Tipo</label>
              <select
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value as any })}
                className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
              >
                <option value="promocao">Promoção</option>
                <option value="midia">Mídia</option>
                <option value="banner">Banner</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Descrição</label>
            <textarea
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400 resize-none"
              placeholder="Detalhes da campanha..."
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Conteúdo</label>
            <input
              type="text"
              value={form.conteudo}
              onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
              className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
              placeholder="URL, texto ou caminho da mídia"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Data Início</label>
              <input
                type="datetime-local"
                value={form.dataInicio}
                onChange={(e) => setForm({ ...form, dataInicio: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Data Fim</label>
              <input
                type="datetime-local"
                value={form.dataFim}
                onChange={(e) => setForm({ ...form, dataFim: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Clientes selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Clientes ({form.clienteIds.length} selecionados)
            </label>
            <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600/50 max-h-48 overflow-y-auto">
              <label className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-600/30 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.clienteIds.length === clientes.length && clientes.length > 0}
                  onChange={selectAllClientes}
                  className="rounded bg-gray-600 border-gray-500 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-sm text-gray-400 font-medium">
                  {form.clienteIds.length === clientes.length ? 'Desmarcar todos' : 'Selecionar todos'}
                </span>
              </label>
              {clientes.map((cl) => (
                <label
                  key={cl.id}
                  className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-gray-700/50 rounded px-1 transition"
                >
                  <input
                    type="checkbox"
                    checked={form.clienteIds.includes(cl.id)}
                    onChange={() => toggleCliente(cl.id)}
                    className="rounded bg-gray-600 border-gray-500 text-amber-500 focus:ring-amber-500"
                  />
                  <Store size={14} className="text-gray-500" />
                  <span className="text-sm text-gray-300">
                    {cl.nomeAdega}
                    <span className="text-xs text-gray-600 ml-1">({cl.nome})</span>
                  </span>
                </label>
              ))}
              {clientes.length === 0 && (
                <p className="text-xs text-gray-600 py-2 text-center">Nenhum cliente cadastrado</p>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save size={16} />
                  {editing ? 'Atualizar' : 'Criar'}
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
