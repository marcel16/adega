import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Save,
  User,
  Store,
  Image,
  Type,
  Upload,
  Loader2,
} from 'lucide-react';
import Layout from '@/components/Layout';
import FileUpload from '@/components/FileUpload';

const API = process.env.NEXT_PUBLIC_API_URL || '';

interface PerfilForm {
  nome: string;
  nomeAdega: string;
  email: string;
  telefone?: string;
  logo: string;
  marcaDagua: string;
  posicaoLogo: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  posicaoMarcaDagua: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  opacidadeMarcaDagua: number;
  tamanhoLogo: number;
}

export default function Perfil() {
  const router = useRouter();
  const [form, setForm] = useState<PerfilForm>({
    nome: '',
    nomeAdega: '',
    email: '',
    telefone: '',
    logo: '',
    marcaDagua: '',
    posicaoLogo: 'top-left',
    posicaoMarcaDagua: 'bottom-right',
    opacidadeMarcaDagua: 50,
    tamanhoLogo: 100,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [marcaDaguaFile, setMarcaDaguaFile] = useState<File | null>(null);
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [trocandoSenha, setTrocandoSenha] = useState(false);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    loadPerfil();
  }, []);

  const loadPerfil = async () => {
    try {
      const { data } = await axios.get(`${API}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setForm({
        nome: data.nome || '',
        nomeAdega: data.nomeAdega || '',
        email: data.email || '',
        telefone: data.telefone || '',
        logo: data.logo || '',
        marcaDagua: data.marcaDagua || '',
        posicaoLogo: data.posicaoLogo || 'top-left',
        posicaoMarcaDagua: data.posicaoMarcaDagua || 'bottom-right',
        opacidadeMarcaDagua: data.opacidadeMarcaDagua || 50,
        tamanhoLogo: data.tamanhoLogo || 100,
      });
    } catch (err: any) {
      toast.error('Erro ao carregar perfil');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Upload logo if changed
      if (logoFile) {
        const logoFormData = new FormData();
        logoFormData.append('file', logoFile);
        logoFormData.append('tipo', 'logo');
        const logoRes = await axios.post(`${API}/api/upload/perfil`, logoFormData, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        });
        form.logo = logoRes.data.url;
      }

      // Upload marca d'agua if changed
      if (marcaDaguaFile) {
        const mdFormData = new FormData();
        mdFormData.append('file', marcaDaguaFile);
        mdFormData.append('tipo', 'marcaDagua');
        const mdRes = await axios.post(`${API}/api/upload/perfil`, mdFormData, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        });
        form.marcaDagua = mdRes.data.url;
      }

      await axios.put(`${API}/api/auth/perfil`, form, {
        headers: { Authorization: `Bearer ${token}` },
      });

      localStorage.setItem(
        'cliente',
        JSON.stringify({
          ...JSON.parse(localStorage.getItem('cliente') || '{}'),
          ...form,
        })
      );

      toast.success('Perfil atualizado!');
      setLogoFile(null);
      setMarcaDaguaFile(null);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao salvar perfil');
    } finally {
      setSaving(false);
    }
  };

  const handleTrocarSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!senhaAtual || !novaSenha) {
      toast.error('Preencha todos os campos');
      return;
    }
    setTrocandoSenha(true);
    try {
      await axios.put(
        `${API}/api/auth/senha`,
        { senhaAtual, novaSenha },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Senha alterada com sucesso!');
      setSenhaAtual('');
      setNovaSenha('');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao alterar senha');
    } finally {
      setTrocandoSenha(false);
    }
  };

  const posicoes: { value: string; label: string }[] = [
    { value: 'top-left', label: 'Superior Esquerdo' },
    { value: 'top-right', label: 'Superior Direito' },
    { value: 'bottom-left', label: 'Inferior Esquerdo' },
    { value: 'bottom-right', label: 'Inferior Direito' },
  ];

  if (loading) {
    return (
      <Layout title="Perfil">
        <div className="text-center py-12 text-gray-500">
          <Loader2 size={24} className="animate-spin mx-auto mb-3" />
          Carregando...
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Perfil">
      <div className="max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <p className="text-sm text-gray-400">
            Edite as informações e a aparência da sua adega nas TVs
          </p>
        </div>

        <form onSubmit={handleSave}>
          {/* Seção: Dados da Conta */}
          <section className="bg-gray-800 rounded-2xl border border-gray-700 p-6 mb-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-6">
              <User size={20} className="text-amber-400" />
              Dados da Conta
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Nome</label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Nome da Adega
                </label>
                <input
                  type="text"
                  value={form.nomeAdega}
                  onChange={(e) => setForm({ ...form, nomeAdega: e.target.value })}
                  className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Telefone</label>
                <input
                  type="tel"
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
                  placeholder="(11) 99999-9999"
                />
              </div>
            </div>
          </section>

          {/* Seção: Logo e Marca D'água */}
          <section className="bg-gray-800 rounded-2xl border border-gray-700 p-6 mb-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-6">
              <Image size={20} className="text-amber-400" />
              Logo e Marca D'água
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Logo */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Logo</label>
                {form.logo && !logoFile && (
                  <div className="mb-3">
                    <img
                      src={form.logo}
                      alt="Logo atual"
                      className="h-16 object-contain rounded-lg bg-gray-900 p-2"
                    />
                  </div>
                )}
                <FileUpload
                  accept="image/*"
                  maxSizeMB={5}
                  value={logoFile}
                  onChange={(f) => setLogoFile(f as File | null)}
                  label="Arraste ou clique para alterar o logo"
                  currentUrl={!logoFile ? form.logo : undefined}
                />
              </div>

              {/* Marca D'água */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Marca D'água</label>
                {form.marcaDagua && !marcaDaguaFile && (
                  <div className="mb-3">
                    <img
                      src={form.marcaDagua}
                      alt="Marca d'água atual"
                      className="h-16 object-contain rounded-lg bg-gray-900 p-2 opacity-50"
                    />
                  </div>
                )}
                <FileUpload
                  accept="image/*"
                  maxSizeMB={5}
                  value={marcaDaguaFile}
                  onChange={(f) => setMarcaDaguaFile(f as File | null)}
                  label="Arraste ou clique para alterar a marca d'água"
                  currentUrl={!marcaDaguaFile ? form.marcaDagua : undefined}
                />
              </div>
            </div>
          </section>

          {/* Seção: Posicionamento */}
          <section className="bg-gray-800 rounded-2xl border border-gray-700 p-6 mb-6">
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-6">
              <Type size={20} className="text-amber-400" />
              Posicionamento na TV
            </h3>

            {/* Screen Preview */}
            <div className="relative w-full aspect-video bg-gray-950 rounded-xl border border-gray-700 mb-8 overflow-hidden">
              {/* Overlay grid */}
              <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
                {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((pos) => (
                  <div
                    key={pos}
                    className={`relative border border-gray-800/30 flex items-center justify-center ${
                      form.posicaoLogo === pos
                        ? 'bg-amber-400/5 ring-1 ring-amber-400/20'
                        : ''
                    } ${
                      form.posicaoMarcaDagua === pos
                        ? 'bg-amber-400/5 ring-1 ring-blue-400/20'
                        : ''
                    }`}
                  >
                    {/* Logo indicator */}
                    {form.posicaoLogo === pos && (
                      <div
                        className="absolute bg-amber-400/20 border border-amber-400/50 rounded px-2 py-1 text-[10px] text-amber-400"
                        style={{
                          [pos.includes('top') ? 'top' : 'bottom']: '8px',
                          [pos.includes('left') ? 'left' : 'right']: '8px',
                        }}
                      >
                        🍷 Logo
                      </div>
                    )}

                    {/* Marca d'água indicator */}
                    {form.posicaoMarcaDagua === pos && (
                      <div
                        className="absolute bg-blue-400/20 border border-blue-400/50 rounded px-2 py-1 text-[10px] text-blue-400"
                        style={{
                          [pos.includes('top') ? 'top' : 'bottom']: '8px',
                          [pos.includes('left') ? 'left' : 'right']: '8px',
                        }}
                      >
                        💧 Marca
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Center label */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-xs text-gray-700 font-mono">TV Preview</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Posição do Logo
                </label>
                <select
                  value={form.posicaoLogo}
                  onChange={(e) => setForm({ ...form, posicaoLogo: e.target.value as any })}
                  className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
                >
                  {posicoes.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Posição da Marca D'água
                </label>
                <select
                  value={form.posicaoMarcaDagua}
                  onChange={(e) =>
                    setForm({ ...form, posicaoMarcaDagua: e.target.value as any })
                  }
                  className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
                >
                  {posicoes.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Opacidade da Marca D'água ({form.opacidadeMarcaDagua}%)
                </label>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={form.opacidadeMarcaDagua}
                  onChange={(e) =>
                    setForm({ ...form, opacidadeMarcaDagua: Number(e.target.value) })
                  }
                  className="w-full accent-amber-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Tamanho do Logo ({form.tamanhoLogo}px)
                </label>
                <input
                  type="range"
                  min={40}
                  max={300}
                  value={form.tamanhoLogo}
                  onChange={(e) => setForm({ ...form, tamanhoLogo: Number(e.target.value) })}
                  className="w-full accent-amber-400"
                />
              </div>
            </div>
          </section>

          {/* Save Button */}
          <div className="flex justify-end mb-12">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800 px-6 py-3 rounded-lg text-sm font-medium transition"
            >
              {saving ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save size={18} />
                  Salvar Alterações
                </>
              )}
            </button>
          </div>
        </form>

        {/* Seção: Trocar Senha */}
        <section className="bg-gray-800 rounded-2xl border border-gray-700 p-6 mb-6">
          <h3 className="text-lg font-semibold flex items-center gap-2 mb-6">
            🔒 Trocar Senha
          </h3>

          <form onSubmit={handleTrocarSenha} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Senha Atual
              </label>
              <input
                type="password"
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Nova Senha
              </label>
              <input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-400"
                minLength={6}
                required
              />
            </div>
            <button
              type="submit"
              disabled={trocandoSenha}
              className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 px-4 py-2.5 rounded-lg text-sm transition"
            >
              {trocandoSenha ? 'Alterando...' : 'Alterar Senha'}
            </button>
          </form>
        </section>
      </div>
    </Layout>
  );
}
