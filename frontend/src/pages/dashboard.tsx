import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import toast from 'react-hot-toast';

const API = process.env.NEXT_PUBLIC_API_URL || '';

export default function Dashboard() {
  const router = useRouter();
  const [cliente, setCliente] = useState<any>(null);
  const [tvs, setTVs] = useState<any[]>([]);
  const [promocoes, setPromocoes] = useState<any[]>([]);
  const [tab, setTab] = useState<'tvs' | 'promocoes' | 'playlist'>('tvs');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }

    axios.get(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setCliente(r.data))
      .catch(() => { localStorage.clear(); router.push('/login'); });

    axios.get(`${API}/api/tvs`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setTVs(r.data));

    axios.get(`${API}/api/promocoes`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setPromocoes(r.data));
  }, []);

  const addTV = async () => {
    const token = localStorage.getItem('token');
    try {
      await axios.post(`${API}/api/tvs`, { nome: `TV ${tvs.length + 1}` }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { data } = await axios.get(`${API}/api/tvs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTVs(data);
      toast.success('TV adicionada!');
    } catch { toast.error('Erro ao adicionar TV'); }
  };

  const copyM3U = (tv: any) => {
    const url = `https://tv.adega.queroservico.com.br/tv${tv.numero}-${cliente.slug}.m3u`;
    navigator.clipboard.writeText(url);
    toast.success('URL M3U copiada!');
  };

  const logout = () => {
    localStorage.clear();
    router.push('/login');
  };

  if (!cliente) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Carregando...</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {cliente.logo && <img src={cliente.logo} alt="Logo" className="h-10 rounded" />}
          <div>
            <h1 className="text-xl font-bold">{cliente.nomeAdega}</h1>
            <p className="text-sm text-gray-400">{cliente.nome}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {cliente.plano && (
            <span className="bg-amber-600/20 text-amber-400 px-3 py-1 rounded-full text-sm">
              Plano {cliente.plano.nome}
            </span>
          )}
          <button onClick={logout} className="text-gray-400 hover:text-white text-sm">Sair</button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 flex gap-1">
        {[
          { id: 'tvs', label: '📺 TVs Conectadas' },
          { id: 'promocoes', label: '📢 Promoções' },
          { id: 'playlist', label: '🎬 Playlist' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition ${tab === t.id ? 'border-amber-500 text-amber-400' : 'border-transparent text-gray-400 hover:text-white'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="p-6">
        {tab === 'tvs' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">TVs Conectadas</h2>
              <button onClick={addTV} className="bg-amber-600 hover:bg-amber-500 px-4 py-2 rounded-lg text-sm font-medium transition">
                + Adicionar TV
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tvs.map(tv => (
                <div key={tv.id} className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">{tv.nome || `TV ${tv.numero}`}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs ${tv.ativa ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
                      {tv.ativa ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 font-mono mb-3 break-all">
                    tv{tv.numero}-{cliente.slug}.m3u
                  </p>
                  <button
                    onClick={() => copyM3U(tv)}
                    className="w-full bg-gray-700 hover:bg-gray-600 py-2 rounded-lg text-sm transition"
                  >
                    📋 Copiar URL M3U
                  </button>
                </div>
              ))}
              {tvs.length === 0 && (
                <p className="text-gray-500 col-span-3 text-center py-8">Nenhuma TV conectada. Adicione sua primeira TV!</p>
              )}
            </div>
          </div>
        )}

        {tab === 'promocoes' && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Promoções ({promocoes.length})</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {promocoes.map(p => (
                <div key={p.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <h3 className="font-semibold">{p.titulo}</h3>
                  {p.descricao && <p className="text-sm text-gray-400 mt-1">{p.descricao}</p>}
                  <div className="flex gap-2 mt-3">
                    <span className="text-xs bg-gray-700 px-2 py-1 rounded">{p.tipo}</span>
                    <span className="text-xs bg-gray-700 px-2 py-1 rounded">{p.duracao}s</span>
                    {p.agendada && <span className="text-xs bg-amber-900/50 text-amber-400 px-2 py-1 rounded">Agendada</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'playlist' && (
          <div className="text-center py-12 text-gray-500">
            <p className="text-3xl mb-2">🎬</p>
            <p>Gerencie sua playlist com vídeos e promoções</p>
            <p className="text-sm mt-1">Adicione vídeos e promoções para começar</p>
          </div>
        )}
      </main>
    </div>
  );
}
