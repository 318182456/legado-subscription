import React, { useState, useEffect } from 'react';
import { RefreshCw, Search, Zap, ShieldCheck, Upload, BookOpen, CheckCircle2, AlertCircle, MoreVertical, Copy, Trash2, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import * as api from '../api';
import { StatCard } from '../components/StatCard';

interface SourceListViewProps {
  onImport: () => void;
  testingIds: Set<number>;
  testProgress: { current: number; total: number };
  isTestingAll: boolean;
  onTest: (ids: number[], onFinished?: () => void) => Promise<void>;
  onTestAll: (onFinished?: () => void) => Promise<void>;
}

export default function SourceListView({ 
  onImport, testingIds, testProgress, isTestingAll, onTest, onTestAll 
}: SourceListViewProps) {
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({ total: 0, available: 0, unavailable: 0 });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [activeMenu, setActiveMenu] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [cleaning, setCleaning] = useState(false);

  const handleCleanup = async () => {
    if (!confirm('确定要对系统书源进行去重与失效标记清理吗？\n此操作将对所有重复的及测试不可用的书源执行“禁用 + 归类标记”，不做任何物理删除，安全可靠。')) return;
    setCleaning(true);
    try {
      const res = await api.cleanupSources();
      alert(`标记清理成功！\n- 自动禁用并归类失效书源: ${res.markedInvalid} 个\n- 自动禁用并归类重复书源: ${res.markedDuplicates} 个`);
      fetchSources(query, 1, filter);
    } catch (e) {
      alert('标记清理失败: ' + String(e));
    } finally {
      setCleaning(false);
    }
  };

  const fetchSources = async (q = '', p = 1, f = 'all') => {
    setLoading(true);
    try {
      const data = await api.getSources(q, p, f);
      setSources(data.sources);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setStats(data.stats);
      setPage(p);
    } catch (e) {
      console.error('获取书源失败', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSources(query, 1, filter);
    }, 500);
    return () => clearTimeout(timer);
  }, [query, filter]);

  const handleLocalTest = (ids: number[]) => {
    onTest(ids, () => fetchSources(query, page, filter));
  };

  const handleLocalTestAll = () => {
    onTestAll(() => fetchSources(query, page, filter));
  };

  const toggleAll = () => {
    if (selectedIds.size === sources.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sources.map(s => s.id)));
    }
  };

  const toggleOne = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleToggleSource = async (id: number, enabled: boolean) => {
    try {
      await api.toggleSource(id, !enabled);
      setSources(prev => prev.map(s => s.id === id ? { ...s, enabled: !enabled ? 1 : 0 } : s));
    } catch (e) {
      alert('操作失败: ' + String(e));
    }
  };

  const handleDeleteSource = async (id: number) => {
    if (!confirm('确定要删除此书源吗？')) return;
    try {
      await api.deleteSource(id);
      setSources(prev => prev.filter(s => s.id !== id));
      setActiveMenu(null);
    } catch (e) {
      alert('删除失败: ' + String(e));
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    alert('已复制到剪贴板');
    setActiveMenu(null);
  };

  if (loading && page === 1) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
          <StatCard 
            icon={<BookOpen size={24} />} 
            label="总书源" 
            value={stats.total.toLocaleString()} 
            color="bg-primary/10 text-primary"
          />
          <StatCard 
            icon={<CheckCircle2 size={24} />} 
            label="正常书源" 
            value={stats.available.toLocaleString()} 
            color="bg-green-500/10 text-green-600"
          />
          <div className="relative">
            <StatCard 
              icon={<AlertCircle size={24} />} 
              label="失效书源" 
              value={stats.unavailable.toLocaleString()} 
              color="bg-error/10 text-error"
            />
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">书源管理</h2>
            <p className="text-sm text-secondary mt-1">管理并配置您的所有阅读源站点。</p>
          </div>
          <div className="flex w-full md:w-auto items-center gap-2">
            <select 
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-1.5 text-xs font-bold outline-none focus:border-primary transition-all cursor-pointer"
            >
              <option value="all">全部书源</option>
              <option value="available">仅看正常</option>
              <option value="unavailable">仅看不可用</option>
            </select>

            <div className="relative flex-1 md:w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" size={14} />
              <input 
                type="text" 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索..."
                className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg pl-9 pr-4 py-1.5 text-xs outline-none focus:border-primary transition-all"
              />
            </div>
          
          {selectedIds.size > 0 && (
            <button 
              onClick={() => handleLocalTest(Array.from(selectedIds))}
              className="bg-tertiary text-on-tertiary px-3 py-1.5 rounded-lg text-xs font-bold hover:opacity-90 flex items-center gap-1.5"
            >
              <Zap size={14} /> 测试选中 ({selectedIds.size})
            </button>
          )}

          <button 
            onClick={handleLocalTestAll}
            disabled={isTestingAll || (loading && testingIds.size > 0)}
            className={`border border-outline-variant bg-surface-container-low text-on-surface px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-surface-container-high flex items-center gap-1.5 disabled:opacity-50 relative overflow-hidden transition-all ${isTestingAll ? 'ring-1 ring-primary/30' : ''}`}
          >
            <ShieldCheck size={14} className={isTestingAll ? 'animate-pulse text-primary' : ''} /> 
            {isTestingAll ? `测试中 ${Math.round((testProgress.current / testProgress.total) * 100)}% (${testProgress.current}/${testProgress.total})` : '全部测试 (库)'}
            {isTestingAll && testProgress.total > 0 && (
              <div 
                className="absolute bottom-0 left-0 h-0.5 bg-primary transition-all duration-500 ease-out" 
                style={{ width: `${(testProgress.current / testProgress.total) * 100}%` }}
              />
            )}
          </button>

          <button 
            onClick={handleCleanup}
            disabled={cleaning || loading}
            className={`border border-outline-variant bg-surface-container-low text-on-surface px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-surface-container-high flex items-center gap-1.5 disabled:opacity-50 transition-all ${cleaning ? 'ring-1 ring-primary/30' : ''}`}
            title="一键标记禁用失效和重复的冗余书源，不做任何物理删除"
          >
            <Sparkles size={14} className={cleaning ? 'animate-spin text-primary animate-pulse' : 'text-primary'} />
            {cleaning ? '标记中...' : '标记去重'}
          </button>

          <button 
            onClick={async () => {
              if (confirm('确定要清空所有书源吗？此操作不可撤销！')) {
                try {
                  await api.deleteAllSources();
                  fetchSources(query, 1);
                } catch (e) {
                  alert('删除失败: ' + String(e));
                }
              }
            }}
            className="p-1.5 border border-error/30 rounded-lg bg-error/5 text-error hover:bg-error/10 transition-colors"
            title="清空所有书源"
          >
            <Trash2 size={16} />
          </button>

          <button 
            onClick={() => fetchSources(query, page, filter)}
            className="p-1.5 border border-outline-variant rounded-lg bg-surface-container-lowest hover:bg-surface-container-low transition-colors"
          >
            <RefreshCw size={16} className={loading && testingIds.size === 0 ? 'animate-spin' : ''} />
          </button>
          <button 
            onClick={onImport}
            className="bg-primary text-on-primary px-4 py-1.5 rounded-lg text-xs font-bold hover:opacity-90 transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Upload size={16} /> 导入书源
          </button>
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface text-secondary text-xs font-bold uppercase tracking-wider border-b border-outline-variant">
                <th className="py-2 px-4 w-10 text-center">
                  <input 
                    type="checkbox" 
                    checked={selectedIds.size === sources.length && sources.length > 0}
                    onChange={toggleAll}
                    className="rounded border-outline text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer" 
                  />
                </th>
                <th className="py-2 px-4">源名称</th>
                <th className="py-2 px-4">URL / 分组</th>
                <th className="py-2 px-4 text-center">状态 / 可用性</th>
                <th className="py-2 px-4 text-right w-24">操作</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-outline-variant/30">
              {sources.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-secondary">暂无数据</td>
                </tr>
              ) : (
                sources.map((source, idx) => (
                  <tr key={source.id} className={`hover:bg-surface-container-low/50 transition-colors group relative ${!source.enabled ? 'opacity-60' : ''}`}>
                    <td className="py-2 px-4 text-center">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.has(source.id)}
                        onChange={() => toggleOne(source.id)}
                        className="rounded border-outline text-primary focus:ring-primary h-3.5 w-3.5 cursor-pointer" 
                      />
                    </td>
                    <td className="py-2 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded bg-surface-container-high flex items-center justify-center text-primary font-bold text-xs shrink-0">
                          {Array.from(source.name || "?")[0]}
                        </div>
                        <span className="font-bold text-sm truncate">{source.name}</span>
                      </div>
                    </td>
                    <td className="py-2 px-4">
                      <div className="text-xs text-secondary truncate max-w-[200px] font-mono">{source.book_source_url}</div>
                      <div className="mt-0.5 flex gap-1">
                        {source.group_name && (
                          <span className="text-[11px] bg-secondary-container/30 text-secondary px-1.5 py-0.2 rounded">{source.group_name}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-4 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <button 
                          onClick={() => handleToggleSource(source.id, !!source.enabled)}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[11px] font-bold transition-colors ${
                            source.enabled ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-secondary/10 text-secondary hover:bg-secondary/20'
                          }`}
                        >
                          <span className={`w-1 h-1 rounded-full ${source.enabled ? 'bg-primary' : 'bg-secondary'}`} />
                          {source.enabled ? '已启用' : '已禁用'}
                        </button>
                        {testingIds.has(source.id) ? (
                          <span className="text-[11px] text-tertiary animate-pulse font-bold">测试中...</span>
                        ) : source.last_checked && (
                          <span className={`text-[11px] font-bold ${source.is_available ? 'text-green-500' : 'text-error'}`}>
                            {source.is_available ? '正常' : '不可用'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-4 text-right relative">
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
                            <button 
                              onClick={() => { onTest([source.id]); setActiveMenu(null); }}
                              className="w-full text-left px-4 py-2 text-xs hover:bg-surface-container-low transition-colors flex items-center gap-2"
                            >
                              <Zap size={14} /> 立即测试
                            </button>
                            <button 
                              onClick={() => handleCopyUrl(source.book_source_url)}
                              className="w-full text-left px-4 py-2 text-xs hover:bg-surface-container-low transition-colors flex items-center gap-2"
                            >
                              <Copy size={14} /> 复制 URL
                            </button>
                            <button 
                              onClick={() => handleDeleteSource(source.id)}
                              className="w-full text-left px-4 py-2 text-xs hover:bg-error-container/20 text-error transition-colors flex items-center gap-2 border-t border-outline-variant/30 mt-1"
                            >
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
        </div>
        
        {/* Pagination */}
        <div className="px-4 py-3 border-t border-outline-variant/30 flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface-container-lowest">
          <div className="text-xs text-secondary font-medium">
            共 <span className="text-on-surface font-bold">{total.toLocaleString()}</span> 条书源
            <span className="mx-2 opacity-30">|</span>
            第 <span className="text-on-surface font-bold">{page}</span> / {totalPages} 页
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={() => fetchSources(query, page - 1, filter)}
              disabled={page <= 1 || loading}
              className="p-1.5 rounded-lg border border-outline-variant hover:bg-surface-container-low disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="上一页"
            >
              <ChevronLeft size={16} />
            </button>
            
            <div className="flex items-center px-3 h-8 rounded-lg border border-outline-variant bg-surface-container-low text-xs font-bold min-w-[3rem] justify-center">
              {page}
            </div>
            
            <button
              onClick={() => fetchSources(query, page + 1, filter)}
              disabled={page >= totalPages || loading}
              className="p-1.5 rounded-lg border border-outline-variant hover:bg-surface-container-low disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="下一页"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
