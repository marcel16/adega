import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Plus, Edit, Trash2, Calendar, Clock, Eye, EyeOff, Copy } from 'lucide-react';
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import Pagination from '@/components/Pagination';

const API = process.env.NEXT_PUBLIC_API_URL || '';

interface Promocao {
  id: string;
  titulo: string;
  descricao?: string;
  tipo: 'texto' | 'imagem' | 'banner' | 'overlay';
  conteudo?: string;
  duracao: number;
  ativa: boolean;
  agendada: boolean;
  dataInicio?: string;
  dataFim?: string;
  createdAt: string;
}

interface PromocaoForm {
  titulo: string;
  descricao: string;
  tipo: 'texto' | 'imagem' | 'banner' | 'overlay';
  conteudo: string;
  duracao: number;
  agendada: boolean;
  dataInicio: string;
  dataFim: string;
}

const emptyForm: PromocaoForm = {
  titulo: '',
  descricao: '',
  tipo: 'texto',
  conteudo: '',
  duracao: 10,
  agendada: false,
  dataInicio: '',
  dataFim: '',
};

export default function Promocoes() {
  const router = useRouter();
  const [promocoes, setPromocoes] = useState<Promocao[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Promocao | null>(null);
  const [form, setForm] = useState<PromocaoForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    loadPromocoes();
  }, [page]);

  const loadPromocoes = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/api/promocoes`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { page, limit: 10 },
      });
      setPromocoes(data.data || data);
      setTotalPages(data.totalPages || Math.ceil((data.total || data.length) / 10));
      setTotal(data.total || (data.data || data).length);
    } catch (err: any) {
      toast.error('Erro ao carregar promoções');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (promocao: Promocao) => {
    setEditing(promocao);
    setForm({
      titulo: promocao.titulo,
      descricao: promocao.descricao || '',
      tipo: promocao.tipo,
      conteudo: promocao.conteudo || '',
      duracao: promocao.duracao,
      agendada: promocao.agendada,
      dataInicio: promocao.dataInicio ? promocao.dataInicio.slice(0, 16) : '',
      dataFim: promocao.dataFim ? promocao.dataFim.slice(0, 16) : '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await axios.put(`${API}/api/promocoes/${editing.id}`, form, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Promoção atualizada!');
      } else {
        await axios.post(`${API}/api/promocoes`, form, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success('Promoção criada!');
      }
      setModalOpen(false);
      loadPromocoes();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao salvar promoção');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta promoção?')) return;
    try {
      await axios.delete(`${API}/api/promocoes/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Promoção excluída!');
      loadPromocoes();
    } catch {
      toast.error('Erro ao excluir promoção');
    }
  };

  const handleToggleActive = async (promocao: Promocao) => {
    try {
      await axios.patch(
        `${API}/api/promocoes/${promocao.id}`,
        { ativa: !promocao.ativa },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(promocao.ativa ? 'Promoção desativada' : 'Promoção ativada!');
      loadPromocoes();
    } catch {
      toast.error('Erro ao alterar status');
    }
  };

  const handleDuplicate = async (promocao: Promocao) => {
    try {
      await axios.post(
        `${API}/api/promocoes`,
        {
          titulo: `${promocao.titulo} (cópia)`,
          descricao: promocao.descricao,
          tipo: promocao.tipo,
          conteudo: promocao.conteudo,
          duracao: promocao.duracao,
          agendada: false,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Promoção duplicada!');
      loadPromocoes();
    } catch {
      toast.error('Erro ao duplicar promoção');
    }
  };

  const tipoLabels: Record<string, string> = {
    texto: '📝 Texto',
    imagem: '🖼️ Imagem',
    banner: '📢 Banner',
    overlay: '🔲 Overlay',
  };

  const tipoColors: Record<string, string> = {
    texto: 'bg-blue-900/30 text-blue-400',
    imagem: 'bg-purple-900/30 text-purple-400',
    banner: 'bg-green-900/30 text-green-400',
    overlay: 'bg-pink-900/30 text-pink-400',
  };

  return (
    <Layout title="Promoções">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <p className="text-sm text-gray-400">
            {total} promoção(ões) · {promocoes.filter((p) => p.ativa).length} ativas
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 px-4 py-2.5 rounded-lg text-sm font-medium transition"
        >
          <Plus size={18} />
          Nova Promoção
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12 text-gray-500">
          <div className="animate-spin w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full mx-auto mb-3" />
          Carregando...
        </div>
      )}

      {/* Empty State */}
      {!loading && promocoes.length === 0 && (
        <div className="text-center py-16 bg-gray-800/50 rounded-2xl border border-dashed border-gray-700">
          <p className="text-4xl mb-3">📢</p>
          <h3 className="text-lg font-medium mb-1">Nenhuma promoção criada</h3>
          <p className="text-sm text-gray-500 mb-4">Crie promoções para exibir nas TVs</p>
          <button
            onClick={openCreate}
            className="bg-amber-600 hover:bg-amber-500 px-4 py-2 rounded-lg text-sm font-medium transition"
          >
            Criar Primeira Promoção
          </button>
        </div>
      )}

      {/* Grid */}
      {!loading && promocoes.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {promocoes.map((p) => (
              <div
                key={p.id}
                className={`bg-gray-800 rounded-xl border transition ${
                  p.ativa ? 'border-gray-700' : 'border-gray-700/50 opacity-60'
                }`}
              >
                {/* Card Header */}
                <div className="p-4 border-b border-gray-700/50">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-white truncate">{p.titulo}</h3>
                    <button
                      onClick={() => handleToggleActive(p)}
                      className={`p-1.5 rounded-lg transition ${
                        p.ativa
                          ? 'text-green-400 hover:bg-green-900/30'
                          : 'text-gray-500 hover:bg-gray-700'
                      }`}
                      title={p.ativa ? 'Desativar' : 'Ativar'}
                    >
                      {p.ativa ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                  </div>
                  {p.descricao && (
                    <p className="text-sm text-gray-400 mt-1 line-clamp-2">{p.descricao}</p>
                  )}
                </div>

                {/* Card Body */}
                <div className="p-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${tipoColors[p.tipo] || 'bg-gray-700 text-gray-300'}`}>
                      {tipoLabels[p.tipo] || p.tipo}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-300 flex items-center gap-1">
                      <Clock size={12} />
                      {p.duracao}s
                    </span>
                    {p.agendada && (
                      <span className="px-2 py-0.5 rounded text-xs bg-amber-900/30 text-amber-400 flex items-center gap-1">
                        <Calendar size={12} />
                        Agendada
                      </span>
                    )}
                  </div>

                  {p.agendada && p.dataInicio && (
                    <div className="text-xs text-gray-500 space-y-0.5">
                      <p>Início: {new Date(p.dataInicio).toLocaleString('pt-BR')}</p>
                      {p.dataFim && <p>Fim: {new Date(p.dataFim).toLocaleString('pt-BR')}</p>}
                    </div>
                  )}

                  {/* Conteúdo preview */}
                  {p.conteudo && (
                    <div className="bg-gray-900 rounded-lg p-2 text-xs text-gray-500 max-h-16 overflow-hidden">
                      {p.tipo === 'imagem' || p.tipo === 'banner' ? (
                        <img src={p.conteudo} alt="Preview" className="h-12 rounded object-cover" />
                      ) : (
                        <span>{p.conteudo}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="px-4 py-3 border-t border-gray-700/50 flex items-center gap-1">
                  <button
                    onClick={() => openEdit(p)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-700 transition"
                  >
                    <Edit size={14} />
                    Editar
                  </button>
                  <button
                    onClick={() => handleDuplicate(p)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-700 transition"
                  >
                    <Copy size={14} />
                    Duplicar
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-red-400 hover:bg-red-900/20 transition"
                  >
                    <Trash2 size={14} />
                    Excluir
                  </button>
                </div>
              </div>
            ))}
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

      {/* Modal: Create / Edit */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar Promoção' : 'Nova Promoção'}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Título *</label>
            <input
              type="text"
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
              placeholder="Ex: Happy Hour de Vinhos"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Descrição</label>
            <textarea
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400 resize-none"
              placeholder="Detalhes da promoção..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Tipo</label>
              <select
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value as any })}
                className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
              >
                <option value="texto">Texto</option>
                <option value="imagem">Imagem</option>
                <option value="banner">Banner</option>
                <option value="overlay">Overlay</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Duração (segundos)
              </label>
              <input
                type="number"
                value={form.duracao}
                onChange={(e) => setForm({ ...form, duracao: Number(e.target.value) })}
                className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
                min={1}
                max={300}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Conteúdo (URL da imagem para tipos imagem/banner)
            </label>
            <input
              type="text"
              value={form.conteudo}
              onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
              className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
              placeholder={form.tipo === 'texto' ? 'Texto da promoção...' : 'https://...'}
            />
          </div>

          {/* Agendamento */}
          <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600/50">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.agendada}
                onChange={(e) => setForm({ ...form, agendada: e.target.checked })}
                className="rounded bg-gray-600 border-gray-500 text-amber-500 focus:ring-amber-500"
              />
              <span className="text-sm font-medium text-gray-300">Agendar exibição</span>
            </label>

            {form.agendada && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Data/Hora Início</label>
                  <input
                    type="datetime-local"
                    value={form.dataInicio}
                    onChange={(e) => setForm({ ...form, dataInicio: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Data/Hora Fim</label>
                  <input
                    type="datetime-local"
                    value={form.dataFim}
                    onChange={(e) => setForm({ ...form, dataFim: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
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
              className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800 rounded-lg text-sm font-medium transition"
            >
              {saving ? 'Salvando...' : editing ? 'Atualizar' : 'Criar'}
            </button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}
