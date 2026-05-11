/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import * as api from './api';
import { 
  LayoutDashboard, 
  ListRestart, 
  Sparkles, 
  Settings as SettingsIcon, 
  Plus, 
  Search, 
  Bell, 
  HelpCircle, 
  Copy, 
  MoreVertical, 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  EyeOff, 
  Key, 
  Fingerprint,
  Info,
  RefreshCw,
  Upload,
  Book,
  CheckCircle2,
  AlertCircle,
  LogOut,
  ShieldCheck,
  Globe,
  Trash2,
  Link as LinkIcon,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type Page = 'dashboard' | 'subscriptions' | 'sources' | 'rules' | 'settings';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(!!api.getToken());
  const [authChecking, setAuthChecking] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isMiaogongziModalOpen, setIsMiaogongziModalOpen] = useState(false);

  useEffect(() => {
    const handleUnauthorized = () => setIsLoggedIn(false);
    window.addEventListener('unauthorized', handleUnauthorized);
    return () => window.removeEventListener('unauthorized', handleUnauthorized);
  }, []);

  if (!isLoggedIn) {
    return <LoginView onLogin={() => setIsLoggedIn(true)} />;
  }

  const handleLogout = () => {
    api.clearToken();
    setIsLoggedIn(false);
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-[240px] bg-surface-container-lowest border-r border-outline-variant flex flex-col z-40">
        <div className="p-6 mb-4 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-on-primary">
              <Book size={20} />
            </div>
            <h1 className="text-xl font-semibold text-primary tracking-tight">Legado</h1>
          </div>
          <p className="text-xs text-secondary">书源管理系统</p>
        </div>

        <div className="px-3 mb-6">
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="w-full bg-primary text-on-primary px-4 py-2.5 rounded-lg font-medium hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <Plus size={18} />
            导入新订阅
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          <NavItem 
            active={currentPage === 'dashboard'} 
            onClick={() => setCurrentPage('dashboard')}
            icon={<LayoutDashboard size={20} />}
            label="控制台"
          />
          <NavItem 
            active={currentPage === 'subscriptions'} 
            onClick={() => setCurrentPage('subscriptions')}
            icon={<Globe size={20} />}
            label="订阅管理"
          />
          <NavItem 
            active={currentPage === 'sources'} 
            onClick={() => setCurrentPage('sources')}
            icon={<ListRestart size={20} />}
            label="书源管理"
          />
          <NavItem 
            active={currentPage === 'rules'} 
            onClick={() => setCurrentPage('rules')}
            icon={<Sparkles size={20} />}
            label="净化规则"
          />
          <NavItem 
            active={currentPage === 'settings'} 
            onClick={() => setCurrentPage('settings')}
            icon={<SettingsIcon size={20} />}
            label="设置"
          />
        </nav>

        <div className="mt-auto p-4 border-t border-outline-variant/50">
          <div className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-container-low transition-colors group">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-on-surface-variant">A</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-on-surface truncate">Admin</span>
                <span className="text-xs text-secondary truncate">系统管理员</span>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="p-1.5 text-secondary hover:text-error hover:bg-error-container/20 rounded-md transition-all opacity-0 group-hover:opacity-100"
              title="登出"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-[240px] flex flex-col min-h-screen">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-6 sticky top-0 bg-surface-container-lowest border-b border-outline-variant z-30">
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={18} />
            <input 
              type="text" 
              placeholder="搜索资源或配置..."
              className="w-full bg-surface border border-outline-variant rounded-lg pl-10 pr-4 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-secondary"
            />
          </div>

          <div className="flex items-center gap-2">
            <IconButton icon={<Bell size={20} />} />
            <IconButton icon={<HelpCircle size={20} />} />
            <div className="w-px h-6 bg-outline-variant mx-2" />
            <div className="w-8 h-8 rounded-full bg-tertiary-container flex items-center justify-center text-on-tertiary text-xs font-bold">
              U
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="p-8 max-w-[1440px] mx-auto w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPage}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {currentPage === 'dashboard' && <DashboardView onImport={() => setIsAddModalOpen(true)} />}
              {currentPage === 'subscriptions' && (
                <SubscriptionView 
                  onImport={() => setIsAddModalOpen(true)} 
                  onExplore={() => setIsMiaogongziModalOpen(true)} 
                />
              )}
              {currentPage === 'sources' && <SourceListView onImport={() => setIsAddModalOpen(true)} />}
              {currentPage === 'rules' && <RulesView onImport={() => setIsAddModalOpen(true)} />}
              {currentPage === 'settings' && <SettingsView />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <AddSubscriptionModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onAdded={() => {
          setIsAddModalOpen(false);
          window.dispatchEvent(new CustomEvent('refresh-data'));
        }}
      />

      <RemoteUrlPickerModal
        isOpen={isMiaogongziModalOpen}
        onClose={() => setIsMiaogongziModalOpen(false)}
        onAdded={() => {
          setIsMiaogongziModalOpen(false);
          window.dispatchEvent(new CustomEvent('refresh-data'));
        }}
      />
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm font-medium ${
        active 
          ? 'bg-surface-container text-primary border-l-2 border-primary rounded-l-none' 
          : 'text-secondary hover:bg-surface-container-low hover:text-primary'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function IconButton({ icon }: { icon: React.ReactNode }) {
  return (
    <button className="w-10 h-10 rounded-full flex items-center justify-center text-secondary hover:bg-surface-container-low hover:text-primary transition-colors">
      {icon}
    </button>
  );
}

function DashboardView({ onImport }: { onImport: () => void }) {
  const [stats, setStats] = useState<api.Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentSources, setRecentSources] = useState<any[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [s, sources] = await Promise.all([
        api.getStats(),
        api.getSources()
      ]);
      setStats(s);
      setRecentSources(sources.slice(0, 4));
    } catch (e) {
      console.error('获取统计数据失败', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="animate-spin text-primary" size={32} />
          <p className="text-secondary text-sm">加载统计信息中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">控制台摘要</h2>
          <p className="text-sm text-secondary mt-1">系统当前运行状态概览</p>
        </div>
        <button 
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-surface-container-lowest border border-outline-variant text-primary rounded-lg text-sm font-medium hover:bg-surface-container-low transition-colors"
        >
          <RefreshCw size={16} />
          刷新数据
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="flex flex-col gap-6">
          <StatCard icon={<Book size={24} />} label="已启用阅读源" value={stats?.sources?.total?.toLocaleString() || '0'} color="bg-surface-container text-primary" />
          <StatCard icon={<Sparkles size={24} />} label="净化规则数" value={stats?.rules?.total?.toLocaleString() || '0'} color="bg-tertiary-container/10 text-tertiary" />
          <StatCard icon={<RefreshCw size={24} />} label="启用订阅总数" value={stats?.subscriptions?.total?.toLocaleString() || '0'} color="bg-secondary-container text-on-surface" />
        </div>

        <div className="md:col-span-2 bg-primary text-on-primary rounded-xl p-8 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-6 text-2xl font-bold">
              <Copy size={28} />
              整合订阅链接
            </div>
            <p className="text-primary-container font-medium text-lg max-w-lg mb-8">
              使用此链接在您的阅读应用中直接导入所有已启用的书源和净化规则。链接会自动保持最新状态。
            </p>
          </div>
          <div className="relative z-10 grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-primary-container">整合书源地址 (Legado 导入)</label>
              <div className="flex gap-2">
                <input 
                  readOnly 
                  value={`${window.location.origin}/subscribe/sources`}
                  className="flex-1 bg-surface-container-lowest text-on-background border border-outline-variant rounded-lg px-4 py-2 text-sm outline-none"
                />
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/subscribe/sources`);
                    alert('复制成功');
                  }}
                  className="bg-surface-container-lowest text-primary px-4 py-2 rounded-lg text-sm font-semibold hover:bg-surface-container-low transition-colors shadow-sm shrink-0"
                >
                  <Copy size={16} />
                </button>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-semibold text-primary-container">整合索引地址 (仿苗公子订阅页面)</label>
              <div className="flex gap-2">
                <input 
                  readOnly 
                  value={`${window.location.origin}/subscribe/index`}
                  className="flex-1 bg-surface-container-lowest text-on-background border border-outline-variant rounded-lg px-4 py-2 text-sm outline-none"
                />
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/subscribe/index`);
                    alert('复制成功');
                  }}
                  className="bg-surface-container-lowest text-primary px-4 py-2 rounded-lg text-sm font-semibold hover:bg-surface-container-low transition-colors shadow-sm shrink-0"
                >
                  <Copy size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-5 border-b border-outline-variant flex justify-between items-center">
          <h3 className="font-semibold text-lg">最近同步书源</h3>
          <button className="text-sm font-medium text-primary hover:underline">查看全部</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface text-secondary text-xs font-medium uppercase tracking-wider border-b border-outline-variant">
                <th className="py-3 px-6">源名称</th>
                <th className="py-3 px-6">最后更新</th>
                <th className="py-3 px-6">状态</th>
                <th className="py-3 px-6 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {recentSources.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-secondary">暂无书源数据</td>
                </tr>
              ) : (
                recentSources.map((source, idx) => (
                  <tr key={idx} className="border-b border-outline-variant/30 hover:bg-surface-container-low transition-colors">
                    <td className="py-4 px-6 font-medium">{source.name}</td>
                    <td className="py-4 px-6 text-secondary">{new Date(source.updated_at).toLocaleString()}</td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        source.enabled ? 'bg-surface-container-high text-primary' : 'bg-secondary-container text-secondary'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${source.enabled ? 'bg-primary' : 'bg-secondary'}`} />
                        {source.enabled ? '已启用' : '已禁用'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button className="p-1 text-secondary hover:text-primary transition-colors"><MoreVertical size={18} /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, color, isSmallValue }: { icon: React.ReactNode; label: string; value: string; color: string; isSmallValue?: boolean }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 flex items-center gap-4 shadow-sm">
      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-secondary mb-1">{label}</p>
        <p className={`${isSmallValue ? 'text-lg' : 'text-2xl'} font-bold tracking-tight`}>{value}</p>
      </div>
    </div>
  );
}

function SourceListView({ onImport }: { onImport: () => void }) {
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [query, setQuery] = useState('');
  const [activeMenu, setActiveMenu] = useState<number | null>(null);

  const fetchSources = async (q = '', p = 1, append = false) => {
    if (p === 1) setLoading(true);
    else setLoadingMore(true);
    
    try {
      const data = await api.getSources(q, p);
      if (append) {
        setSources(prev => [...prev, ...data]);
      } else {
        setSources(data);
      }
      setHasMore(data.length === 50);
      setPage(p);
    } catch (e) {
      console.error('获取书源失败', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchSources();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSources(query, 1);
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  const loadMore = () => {
    if (!loading && !loadingMore && hasMore) {
      fetchSources(query, page + 1, true);
    }
  };

  if (loading && page === 1) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">书源管理</h2>
          <p className="text-sm text-secondary mt-1">管理并配置您的所有阅读源站点。</p>
        </div>
        <div className="flex w-full md:w-auto items-center gap-3">
          <div className="relative flex-1 md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={18} />
            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索书源名称或 URL..."
              className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg pl-10 pr-4 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-outline"
            />
          </div>
          <button 
            onClick={() => fetchSources(query, 1)}
            className="p-2 border border-outline-variant rounded-lg bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low transition-colors shadow-sm"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <button 
            onClick={onImport}
            className="bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-all flex items-center gap-2 shadow-sm shrink-0"
          >
            <Upload size={18} />
            导入阅读源
          </button>
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface text-secondary text-xs font-semibold uppercase tracking-wider border-b border-outline-variant">
                <th className="py-3 px-6 w-12"><input type="checkbox" className="rounded-sm border-outline text-primary focus:ring-primary h-4 w-4" /></th>
                <th className="py-3 px-6">源名称</th>
                <th className="py-3 px-6">URL / 分组</th>
                <th className="py-3 px-6">状态</th>
                <th className="py-3 px-6 text-right w-24">操作</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-outline-variant/30">
              {sources.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-secondary">暂无数据</td>
                </tr>
              ) : (
                sources.map((source, idx) => (
                  <tr key={idx} className="hover:bg-surface-container-low/50 transition-colors group relative">
                    <td className="py-4 px-6"><input type="checkbox" className="rounded-sm border-outline text-primary focus:ring-primary h-4 w-4" /></td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-surface-container-high flex items-center justify-center text-primary font-bold text-sm">
                          {source.name.charAt(0)}
                        </div>
                        <span className="font-semibold">{source.name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="text-secondary truncate max-w-xs">{source.book_source_url}</div>
                      <div className="mt-1 flex gap-1">
                        {source.group_name && (
                          <span className="text-[10px] bg-secondary-container/30 text-secondary px-1.5 py-0.5 rounded">{source.group_name}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        source.enabled ? 'bg-surface-container-high text-primary' : 'bg-secondary-container text-secondary'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${source.enabled ? 'bg-primary' : 'bg-secondary'}`} />
                        {source.enabled ? '已启用' : '已禁用'}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right relative">
                      <button 
                        onClick={() => setActiveMenu(activeMenu === idx ? null : idx)}
                        className="p-1 text-secondary hover:text-primary transition-colors"
                      >
                        <MoreVertical size={18} />
                      </button>
                      
                      {activeMenu === idx && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setActiveMenu(null)} />
                          <div className="absolute right-6 top-10 w-32 bg-surface-container-lowest border border-outline-variant rounded-lg shadow-xl z-20 py-1 overflow-hidden text-left">
                            <button className="w-full text-left px-4 py-2 text-xs hover:bg-surface-container-low transition-colors flex items-center gap-2">
                              <Eye size={14} /> 查看详情
                            </button>
                            <button className="w-full text-left px-4 py-2 text-xs hover:bg-surface-container-low transition-colors flex items-center gap-2">
                              <Copy size={14} /> 复制 URL
                            </button>
                            <button className="w-full text-left px-4 py-2 text-xs hover:bg-error-container/20 text-error transition-colors flex items-center gap-2 border-t border-outline-variant/30 mt-1">
                              <Trash2 size={14} /> 删除
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          
          {hasMore && (
            <div className="p-4 flex justify-center border-t border-outline-variant/30">
              <button 
                onClick={loadMore}
                disabled={loadingMore}
                className="text-xs font-bold text-primary hover:underline flex items-center gap-2"
              >
                {loadingMore ? <RefreshCw className="animate-spin" size={14} /> : null}
                加载更多书源...
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RulesView({ onImport }: { onImport: () => void }) {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [query, setQuery] = useState('');
  const [activeMenu, setActiveMenu] = useState<number | null>(null);

  const fetchRules = async (q = '', p = 1, append = false) => {
    if (p === 1) setLoading(true);
    else setLoadingMore(true);
    
    try {
      const data = await api.getRules(q, p);
      if (append) {
        setRules(prev => [...prev, ...data]);
      } else {
        setRules(data);
      }
      setHasMore(data.length === 50);
      setPage(p);
    } catch (e) {
      console.error('获取规则失败', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRules(query, 1);
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  const loadMore = () => {
    if (!loading && !loadingMore && hasMore) {
      fetchRules(query, page + 1, true);
    }
  };

  if (loading && page === 1) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">净化规则管理</h2>
          <p className="text-sm text-secondary mt-1">管理并配置全局文本过滤与替换规则，提升阅读体验。</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={16} />
            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索规则名称..."
              className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg pl-9 pr-4 py-1.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
            />
          </div>
          <button 
            onClick={onImport}
            className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-2 bg-surface-container-lowest border border-outline-variant text-on-surface rounded-lg hover:bg-surface-container-low transition-colors text-sm font-medium shadow-sm"
          >
            <Upload size={16} /> 导入规则订阅
          </button>
          <button className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg hover:opacity-90 transition-all text-sm font-medium shadow-sm">
            <Plus size={16} /> 手动添加
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SummaryIconCard icon={<Sparkles size={24} />} label="总规则数量" value={rules.length?.toLocaleString() || '0'} />
        <SummaryIconCard icon={<CheckCircle2 size={24} />} label="已启用规则" value={rules.filter(r => r.enabled).length?.toLocaleString() || '0'} />
        <SummaryIconCard icon={<RefreshCw size={24} />} label="最近更新" value="刚刚" />
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col">
        <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center bg-surface-bright">
          <h3 className="font-semibold text-on-surface text-sm">规则列表</h3>
          <div className="flex items-center gap-2">
            <button className="p-1.5 text-secondary hover:text-primary transition-colors hover:bg-surface-container-low rounded"><Plus size={18} /></button>
            <button 
              onClick={fetchRules}
              className="p-1.5 text-secondary hover:text-primary transition-colors hover:bg-surface-container-low rounded"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button className="p-1.5 text-secondary hover:text-primary transition-colors hover:bg-surface-container-low rounded"><Search size={18} /></button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-low text-on-surface-variant text-xs font-semibold border-b border-outline-variant">
                <th className="py-3 px-6 w-12 text-center"><input type="checkbox" className="rounded-sm border-outline-variant text-primary focus:ring-primary/20 h-4 w-4" /></th>
                <th className="py-3 px-6 w-1/4">规则名称</th>
                <th className="py-3 px-6 w-1/3">匹配模式 (Regex)</th>
                <th className="py-3 px-6">替换内容</th>
                <th className="py-3 px-6 text-center w-20">状态</th>
                <th className="py-3 px-6 text-center w-24">操作</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-outline-variant/30">
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-secondary">暂无数据</td>
                </tr>
              ) : (
                rules.map((rule, idx) => (
                  <tr key={idx} className={`hover:bg-surface-container-low transition-colors group ${!rule.enabled ? 'opacity-60 bg-surface-bright/50' : ''}`}>
                    <td className="py-4 px-6 text-center"><input type="checkbox" className="rounded-sm border-outline-variant text-primary focus:ring-primary/20 h-4 w-4" /></td>
                    <td className="py-4 px-6 font-semibold break-words min-w-[120px]">{rule.name}</td>
                    <td className="py-4 px-6">
                      <div className="max-h-24 overflow-y-auto scrollbar-hide">
                        <code className="px-1.5 py-0.5 bg-surface-container text-secondary font-mono text-[11px] rounded border border-outline-variant/40 break-all block leading-relaxed">
                          {rule.pattern}
                        </code>
                      </div>
                    </td>
                    <td className="py-4 px-6 italic text-secondary break-all">{rule.replacement || '(删除)'}</td>
                    <td className="py-4 px-6 text-center">
                      <button 
                        onClick={() => {/* TODO: Toggle rule status if needed */}}
                        className={`mx-auto relative inline-flex h-4 w-8 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${rule.enabled ? 'bg-primary' : 'bg-secondary-container'}`}
                      >
                        <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out mt-0.5 ml-0.5 ${rule.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                      </button>
                    </td>
                    <td className="py-4 px-6 text-center relative">
                      <button 
                        onClick={() => setActiveMenu(activeMenu === idx ? null : idx)}
                        className="p-1.5 text-secondary hover:text-primary transition-colors hover:bg-surface-container-low rounded"
                      >
                        <MoreVertical size={18} />
                      </button>
                      
                      {activeMenu === idx && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setActiveMenu(null)} />
                          <div className="absolute right-6 top-10 w-32 bg-surface-container-lowest border border-outline-variant rounded-lg shadow-xl z-20 py-1 overflow-hidden text-left">
                            <button className="w-full text-left px-4 py-2 text-xs hover:bg-surface-container-low transition-colors flex items-center gap-2">
                              <Info size={14} /> 详情
                            </button>
                            <button className="w-full text-left px-4 py-2 text-xs hover:bg-error-container/20 text-error transition-colors flex items-center gap-2 border-t border-outline-variant/30 mt-1">
                              <Trash2 size={14} /> 删除
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          
          {hasMore && (
            <div className="p-4 flex justify-center border-t border-outline-variant/30">
              <button 
                onClick={loadMore}
                disabled={loadingMore}
                className="text-xs font-bold text-primary hover:underline flex items-center gap-2"
              >
                {loadingMore ? <RefreshCw className="animate-spin" size={14} /> : null}
                加载更多规则...
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SubscriptionView({ onImport, onExplore }: { onImport: () => void; onExplore: () => void }) {
  const [subs, setSubs] = useState<api.Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<number | null>(null);

  const fetchSubs = async () => {
    setLoading(true);
    try {
      const data = await api.getSubscriptions();
      setSubs(data);
    } catch (e) {
      console.error('获取订阅失败', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubs();
    const handleRefresh = () => fetchSubs();
    window.addEventListener('refresh-data', handleRefresh);
    return () => window.removeEventListener('refresh-data', handleRefresh);
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此订阅吗？其下的所有内容也将被移除。')) return;
    try {
      await api.deleteSubscription(id);
      fetchSubs();
    } catch (e) {
      alert('删除失败');
    }
  };

  const handleToggle = async (id: number, current: boolean) => {
    try {
      await api.toggleSubscription(id, !current);
      fetchSubs();
    } catch (e) {
      alert('切换状态失败');
    }
  };

  const handleSync = async (id: number) => {
    setSyncing(id);
    try {
      await api.syncOne(id);
      alert('同步成功');
      fetchSubs();
    } catch (e) {
      alert('同步失败: ' + String(e));
    } finally {
      setSyncing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">订阅管理</h2>
          <p className="text-sm text-secondary mt-1">管理您的 URL 订阅源，支持书源和净化规则。</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={onExplore}
            className="flex items-center gap-2 px-4 py-2 bg-tertiary-container/20 text-tertiary rounded-lg hover:bg-tertiary-container/30 transition-all text-sm font-medium shadow-sm"
          >
            <Sparkles size={18} /> 外部网页解析
          </button>
          <button 
            onClick={onImport}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg hover:opacity-90 transition-all text-sm font-medium shadow-sm"
          >
            <Plus size={18} /> 添加订阅
          </button>
          <button 
            onClick={fetchSubs}
            className="p-2 border border-outline-variant rounded-lg bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low transition-colors shadow-sm"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {subs.length === 0 ? (
          <div className="bg-surface-container-lowest border border-outline-variant border-dashed rounded-xl p-12 text-center">
            <Globe className="mx-auto text-secondary mb-4" size={48} />
            <p className="text-secondary">尚未添加任何订阅 URL</p>
          </div>
        ) : (
          subs.map((sub) => (
            <div key={sub.id} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 shadow-sm flex items-center justify-between group">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                  sub.type === 'source' ? 'bg-primary-container/20 text-primary' : 'bg-tertiary-container/20 text-tertiary'
                }`}>
                  {sub.type === 'source' ? <ListRestart size={24} /> : <Sparkles size={24} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold truncate">{sub.name || '未命名订阅'}</h4>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                      sub.type === 'source' ? 'bg-primary text-on-primary' : 'bg-tertiary text-on-tertiary'
                    }`}>
                      {sub.type === 'source' ? '书源' : '规则'}
                    </span>
                  </div>
                  <p className="text-xs text-secondary truncate font-mono mt-1">{sub.url}</p>
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-secondary font-medium">
                    <span className="flex items-center gap-1"><Book size={12} /> {sub.item_count} 条项目</span>
                    <span className="flex items-center gap-1"><RefreshCw size={12} /> {sub.last_synced ? new Date(sub.last_synced).toLocaleString() : '从未同步'}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 ml-6">
                <button 
                  onClick={() => handleToggle(sub.id, !!sub.enabled)}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${sub.enabled ? 'bg-primary' : 'bg-secondary-container'}`}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out mt-0.5 ml-0.5 ${sub.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
                
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button 
                    onClick={() => handleSync(sub.id)}
                    disabled={syncing === sub.id}
                    title="立即同步"
                    className="p-2 text-secondary hover:text-primary hover:bg-surface-container rounded-lg transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={18} className={syncing === sub.id ? 'animate-spin' : ''} />
                  </button>
                  <button 
                    onClick={() => handleDelete(sub.id)}
                    title="删除"
                    className="p-2 text-secondary hover:text-error hover:bg-error-container/20 rounded-lg transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AddSubscriptionModal({ isOpen, onClose, onAdded }: { isOpen: boolean; onClose: () => void; onAdded: () => void }) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'source' | 'rule'>('source');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setLoading(true);
    try {
      await api.addSubscription({ name, url, type });
      setUrl('');
      setName('');
      onAdded();
    } catch (e) {
      alert('添加失败: ' + String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-background/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between bg-surface-bright">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Plus size={20} className="text-primary" />
            导入新订阅 (URL)
          </h3>
          <button onClick={onClose} className="p-1 text-secondary hover:text-on-surface transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-secondary uppercase tracking-wider ml-1">订阅类型</label>
              <div className="flex gap-2">
                <button 
                  type="button"
                  onClick={() => setType('source')}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold border transition-all flex items-center justify-center gap-2 ${
                    type === 'source' ? 'bg-primary/10 border-primary text-primary' : 'bg-surface border-outline-variant text-secondary'
                  }`}
                >
                  <ListRestart size={16} /> 书源
                </button>
                <button 
                  type="button"
                  onClick={() => setType('rule')}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold border transition-all flex items-center justify-center gap-2 ${
                    type === 'rule' ? 'bg-tertiary/10 border-tertiary text-tertiary' : 'bg-surface border-outline-variant text-secondary'
                  }`}
                >
                  <Sparkles size={16} /> 规则
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-secondary uppercase tracking-wider ml-1">订阅名称 (可选)</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：我的聚合书源"
                className="w-full bg-surface border border-outline-variant rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-secondary uppercase tracking-wider ml-1">订阅链接 (URL)</label>
              <div className="relative">
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={18} />
                <input 
                  type="url" 
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/sources.json"
                  className="w-full bg-surface border border-outline-variant rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-secondary hover:bg-surface-container transition-colors"
            >
              取消
            </button>
            <button 
              type="submit"
              disabled={loading || !url}
              className="flex-[2] bg-primary text-on-primary px-4 py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <RefreshCw className="animate-spin" size={18} /> : <Plus size={18} />}
              添加订阅
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function RemoteUrlPickerModal({ isOpen, onClose, onAdded }: { isOpen: boolean; onClose: () => void; onAdded: () => void }) {
  const [url, setUrl] = useState('');
  const [list, setList] = useState<{ name: string; url: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const handleParse = async () => {
    if (!url) return;
    setLoading(true);
    try {
      const data = await api.parseLinks(url);
      setList(data);
    } catch (e) {
      alert('解析失败: ' + String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      handleParse();
    }
  }, [isOpen]);

  const handleAdd = async (item: { name: string; url: string }) => {
    setAdding(item.url);
    try {
      await api.addSubscription({ name: item.name, url: item.url, type: 'source' });
      alert('添加成功: ' + item.name);
      onAdded();
    } catch (e) {
      alert('添加失败: ' + String(e));
    } finally {
      setAdding(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-background/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]"
      >
        <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between bg-surface-bright shrink-0">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Sparkles size={20} className="text-tertiary" />
            外部网页解析 (提取导入链接)
          </h3>
          <button onClick={onClose} className="p-1 text-secondary hover:text-on-surface transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 border-b border-outline-variant bg-surface shrink-0 space-y-4">
          <div className="flex gap-2">
            <input 
              type="url" 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="输入网页 URL (如: https://yuedu.miaogongzi.net/gx.html)"
              className="flex-1 bg-surface-container-lowest border border-outline-variant rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
            <button 
              onClick={handleParse}
              disabled={loading}
              className="bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <RefreshCw className="animate-spin" size={16} /> : <Search size={16} />}
              解析
            </button>
          </div>
          <p className="text-[10px] text-secondary">将自动提取页面中 yuedu:// 或 legado:// 协议的导入链接</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="py-12 text-center">
              <RefreshCw className="animate-spin mx-auto text-primary mb-4" size={32} />
              <p className="text-secondary">正在获取并解析页面内容...</p>
            </div>
          ) : list.length === 0 ? (
            <div className="py-12 text-center">
              <Info className="mx-auto text-secondary mb-4" size={32} />
              <p className="text-secondary">未找到任何有效的导入链接，请尝试输入其他 URL</p>
            </div>
          ) : (
            list.map((item, idx) => {
              const displayName = item.name === '未知来源' 
                ? (item.url.split('/').pop()?.replace('.json', '') || '未知来源')
                : item.name;
              return (
                <div key={idx} className="flex items-center justify-between p-4 rounded-xl border border-outline-variant hover:bg-surface-container-low transition-colors group">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold truncate text-sm">{displayName}</h4>
                    <p className="text-[10px] text-secondary truncate mt-1 font-mono">{item.url}</p>
                  </div>
                  <button 
                    onClick={() => handleAdd({ ...item, name: displayName })}
                    disabled={!!adding}
                    className="ml-4 px-3 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-bold hover:opacity-90 transition-all shadow-sm disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                  >
                    {adding === item.url ? <RefreshCw className="animate-spin" size={14} /> : <Plus size={14} />}
                    添加
                  </button>
                </div>
              );
            })
          )}
        </div>
      </motion.div>
    </div>
  );
}

function SummaryIconCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 flex items-center gap-4 shadow-sm">
      <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-primary">
        {icon}
      </div>
      <div>
        <div className="text-xs text-secondary">{label}</div>
        <div className="text-xl font-bold text-on-background mt-0.5">{value}</div>
      </div>
    </div>
  );
}

function SettingsView() {
  const [passkeys, setPasskeys] = useState<api.PasskeyItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPasskeys = async () => {
    try {
      const list = await api.getPasskeyList();
      setPasskeys(list);
    } catch (e) {
      console.error('获取 Passkey 失败', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPasskeys();
  }, []);

  const handleRegister = async () => {
    try {
      const name = await api.registerPasskey();
      alert(`注册成功: ${name}`);
      fetchPasskeys();
    } catch (e) {
      alert(`注册失败: ${String(e)}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此 Passkey 吗？')) return;
    try {
      await api.deletePasskey(id);
      fetchPasskeys();
    } catch (e) {
      alert(`删除失败: ${String(e)}`);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-on-background">设置</h2>
        <p className="text-sm text-secondary mt-1">管理系统偏好、认证方式和同步配置。</p>
      </div>

      <div className="flex flex-col gap-6 max-w-4xl">
        <section className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
          <div className="px-8 py-5 border-b border-outline-variant bg-surface-bright flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-lg text-on-surface">Passkey 身份认证</h3>
              <p className="text-xs text-secondary mt-1">使用生物识别或硬件密钥安全登录，无需输入密码。</p>
            </div>
            <Fingerprint className="text-primary" size={24} />
          </div>
          <div className="p-8 space-y-6">
            {loading ? (
              <div className="text-center py-4 text-secondary">加载中...</div>
            ) : (
              <div className="space-y-4">
                {passkeys.length === 0 ? (
                  <div className="bg-surface-container-low p-4 rounded-lg text-center border border-dashed border-outline-variant">
                    <p className="text-sm text-secondary">尚未注册任何 Passkey</p>
                  </div>
                ) : (
                  <div className="divide-y divide-outline-variant">
                    {passkeys.map((pk) => (
                      <div key={pk.id} className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <ShieldCheck className="text-primary" size={20} />
                          <div>
                            <p className="text-sm font-medium">{pk.name}</p>
                            <p className="text-xs text-secondary">注册于 {new Date(pk.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleDelete(pk.id)}
                          className="text-xs text-error hover:underline"
                        >
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button 
                  onClick={handleRegister}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-on-primary py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-all shadow-sm"
                >
                  <Plus size={18} />
                  注册新 Passkey
                </button>
              </div>
            )}
          </div>
          <div className="px-8 py-4 bg-surface border-t border-outline-variant">
            <div className="text-xs text-secondary flex items-start gap-2">
              <Info className="mt-0.5 shrink-0" size={16} />
              建议在常用的设备上注册 Passkey，以获得更便捷的登录体验。
            </div>
          </div>
        </section>

        <section className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
          <div className="px-8 py-5 border-b border-outline-variant bg-surface-bright">
            <h3 className="font-semibold text-lg text-on-surface">系统同步</h3>
          </div>
          <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">手动触发全局同步</p>
                <p className="text-xs text-secondary">立即从所有上游订阅源更新数据</p>
              </div>
              <button 
                onClick={() => api.syncAll().then(() => alert('同步成功')).catch(e => alert(e))}
                className="bg-surface-container-high px-4 py-2 rounded-lg text-sm font-medium hover:bg-surface-container-highest transition-colors flex items-center gap-2"
              >
                <RefreshCw size={16} />
                立即同步
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function FormatOption({ label, active }: { label: string; active?: boolean }) {
  return (
    <button className={`px-6 py-1.5 rounded-lg text-sm font-semibold transition-all min-w-[80px] ${
      active ? 'bg-primary-container text-on-primary-container shadow-sm' : 'text-secondary hover:text-on-surface'
    }`}>
      {label}
    </button>
  );
}

function LoginView({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);

  useEffect(() => {
    api.getPasskeyStatus().then(count => setHasPasskey(count > 0)).catch(() => {});
  }, []);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.login(password);
      onLogin();
    } catch (e) {
      alert('登录失败: ' + String(e));
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setLoading(true);
    try {
      await api.loginWithPasskey();
      onLogin();
    } catch (e) {
      alert('Passkey 验证失败: ' + String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-xl overflow-hidden"
      >
        <div className="p-8 text-center border-b border-outline-variant bg-surface-bright">
          <div className="w-16 h-16 bg-primary rounded-2xl mx-auto flex items-center justify-center text-on-primary mb-4 shadow-lg">
            <Book size={32} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Legado Subscription</h1>
          <p className="text-sm text-secondary mt-1">书源订阅管理系统</p>
        </div>

        <div className="p-8 space-y-6">
          {hasPasskey && (
            <button 
              onClick={handlePasskeyLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-surface-container-high hover:bg-surface-container-highest py-3 rounded-xl font-semibold transition-all border border-outline-variant shadow-sm disabled:opacity-50"
            >
              <Fingerprint size={20} className="text-primary" />
              使用 Passkey 登录
            </button>
          )}

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-outline-variant"></span></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-surface-container-lowest px-2 text-secondary font-medium">或使用密码</span></div>
          </div>

          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-secondary uppercase tracking-wider ml-1">管理员密码</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" size={18} />
                <input 
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入登录密码..."
                  className="w-full bg-surface border border-outline-variant rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  required
                />
              </div>
            </div>
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-on-primary py-3 rounded-xl font-bold hover:opacity-90 transition-all shadow-md disabled:opacity-50"
            >
              {loading ? '处理中...' : '登录系统'}
            </button>
          </form>
        </div>
        
        <div className="px-8 py-4 bg-surface text-center border-t border-outline-variant">
          <p className="text-xs text-secondary flex items-center justify-center gap-1">
            <ShieldCheck size={14} /> 强加密保护 · 安全物理存储
          </p>
        </div>
      </motion.div>
    </div>
  );
}
