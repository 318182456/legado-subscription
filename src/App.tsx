import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  LayoutDashboard, 
  ListRestart, 
  Settings, 
  ChevronRight, 
  Menu, 
  LogOut, 
  Sparkles, 
  ShieldCheck, 
  Package 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as api from './api';

// Components
import { NavItem } from './components/NavItem';
import { IconButton } from './components/IconButton';

// Modals
import { AddSubscriptionModal } from './components/modals/AddSubscriptionModal';
import { AddRuleModal } from './components/modals/AddRuleModal';
import { WebDiscoveryModal } from './components/modals/WebDiscoveryModal';

// Views
import LoginView from './views/LoginView';
import DashboardView from './views/DashboardView';
import SubscriptionView from './views/SubscriptionView';
import SourceListView from './views/SourceListView';
import RulesView from './views/RulesView';
import AssetsView from './views/AssetsView';
import SettingsView from './views/SettingsView';

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddRuleModalOpen, setIsAddRuleModalOpen] = useState(false);
  const [isDiscoveryModalOpen, setIsDiscoveryModalOpen] = useState(false);

  // Global Testing State (Shared for consistency)
  const [testingIds, setTestingIds] = useState<Set<number>>(new Set());
  const [testProgress, setTestProgress] = useState({ current: 0, total: 0 });
  const [isTestingAll, setIsTestingAll] = useState(false);

  useEffect(() => {
    const token = api.getToken();
    if (token) setIsLoggedIn(true);
    setCheckingAuth(false);

    // 监听 401 认证失效事件
    const handleUnauthorized = () => {
      setIsLoggedIn(false);
      setActiveTab('dashboard'); // 重置到默认页
    };

    window.addEventListener('unauthorized', handleUnauthorized);
    return () => window.removeEventListener('unauthorized', handleUnauthorized);
  }, []);

  const handleLogout = () => {
    api.clearToken();
    setIsLoggedIn(false);
  };

  // Test Logic (Shared)
  const handleTest = useCallback(async (ids: number[], onFinished?: () => void) => {
    const nextTesting = new Set(testingIds);
    ids.forEach(id => nextTesting.add(id));
    setTestingIds(nextTesting);

    try {
      await api.testSources(ids);
      onFinished?.();
    } catch (e) {
      alert('测试失败: ' + String(e));
    } finally {
      setTestingIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
    }
  }, [testingIds]);

  const handleTestAll = useCallback(async (onFinished?: () => void) => {
    if (isTestingAll) return;
    setIsTestingAll(true);
    try {
      const allIds = await api.getAllSourceIds();
      setTestProgress({ current: 0, total: allIds.length });
      
      const batchSize = 10;
      for (let i = 0; i < allIds.length; i += batchSize) {
        const batch = allIds.slice(i, i + batchSize);
        await api.testSources(batch);
        setTestProgress(prev => ({ ...prev, current: Math.min(prev.total, i + batch.length) }));
      }
      onFinished?.();
    } catch (e) {
      alert('批量测试失败: ' + String(e));
    } finally {
      setIsTestingAll(false);
      setTestProgress({ current: 0, total: 0 });
    }
  }, [isTestingAll]);

  const renderActiveView = useMemo(() => {
    switch (activeTab) {
      case 'dashboard': return <DashboardView onImport={() => setIsAddModalOpen(true)} />;
      case 'subscriptions': return (
        <SubscriptionView 
          onImport={() => setIsAddModalOpen(true)} 
          onExplore={() => setIsDiscoveryModalOpen(true)} 
        />
      );
      case 'sources': return (
        <SourceListView 
          onImport={() => setIsAddModalOpen(true)}
          testingIds={testingIds}
          testProgress={testProgress}
          isTestingAll={isTestingAll}
          onTest={handleTest}
          onTestAll={handleTestAll}
        />
      );
      case 'rules': return <RulesView onAdd={() => setIsAddRuleModalOpen(true)} />;
      case 'assets': return <AssetsView />;
      case 'settings': return <SettingsView />;
      default: return <DashboardView onImport={() => setIsAddModalOpen(true)} />;
    }
  }, [activeTab, testingIds, testProgress, isTestingAll, handleTest, handleTestAll]);

  if (checkingAuth) return null;

  if (!isLoggedIn) {
    return <LoginView onLogin={() => setIsLoggedIn(true)} />;
  }

  return (
    <div className="flex h-screen bg-background text-on-background overflow-hidden font-sans antialiased">
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 260 : 80 }}
        className="bg-surface-container-low border-r border-outline-variant flex flex-col relative z-30 shrink-0"
      >
        <div className="h-16 flex items-center px-6 border-b border-outline-variant/30 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden whitespace-nowrap">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
              <Sparkles className="text-on-primary" size={18} />
            </div>
            {isSidebarOpen && <span className="font-bold tracking-tight text-lg">Legado Hub</span>}
          </div>
        </div>

        <nav className="flex-1 py-6 px-3 space-y-1.5 overflow-y-auto custom-scrollbar">
          <NavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={20} />} label={isSidebarOpen ? "控制台" : ""} />
          <NavItem active={activeTab === 'subscriptions'} onClick={() => setActiveTab('subscriptions')} icon={<ListRestart size={20} />} label={isSidebarOpen ? "订阅管理" : ""} />
          <NavItem active={activeTab === 'sources'} onClick={() => setActiveTab('sources')} icon={<ShieldCheck size={20} />} label={isSidebarOpen ? "书源管理" : ""} />
          <NavItem active={activeTab === 'rules'} onClick={() => setActiveTab('rules')} icon={<Sparkles size={20} />} label={isSidebarOpen ? "净化规则" : ""} />
          <div className="my-4 border-t border-outline-variant/30" />
          <NavItem active={activeTab === 'assets'} onClick={() => setActiveTab('assets')} icon={<Package size={20} />} label={isSidebarOpen ? "资源管理 (R2)" : ""} />
          <NavItem active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings size={20} />} label={isSidebarOpen ? "系统设置" : ""} />
        </nav>

        <div className="p-4 border-t border-outline-variant/30 shrink-0">
          <button 
            onClick={handleLogout}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-bold text-error hover:bg-error-container/20 group overflow-hidden`}
          >
            <LogOut size={20} className="group-hover:rotate-12 transition-transform" />
            {isSidebarOpen && <span>退出系统</span>}
          </button>
        </div>

        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute -right-3 top-20 bg-surface-container-highest border border-outline-variant text-primary rounded-full p-1 shadow-md hover:scale-110 transition-all z-40"
        >
          <ChevronRight size={14} className={`transition-transform duration-300 ${isSidebarOpen ? 'rotate-180' : ''}`} />
        </button>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-background relative overflow-hidden">
        <header className="h-16 border-b border-outline-variant/30 flex items-center justify-between px-8 bg-surface-container-low/30 backdrop-blur-md shrink-0 z-20">
          <div className="flex items-center gap-4">
            {!isSidebarOpen && (
              <IconButton icon={<Menu size={20} />} onClick={() => setIsSidebarOpen(true)} />
            )}
            <h1 className="font-bold text-lg text-on-surface capitalize">{activeTab.replace('-', ' ')}</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container border border-outline-variant rounded-full">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[11px] font-bold text-secondary uppercase tracking-widest">Server Online</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar scroll-smooth">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="max-w-7xl mx-auto"
          >
            {renderActiveView}
          </motion.div>
        </div>
      </main>

      {/* Modals */}
      <AddSubscriptionModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onAdded={() => {
          setIsAddModalOpen(false);
          window.dispatchEvent(new CustomEvent('refresh-data'));
        }}
      />

      <AddRuleModal
        isOpen={isAddRuleModalOpen}
        onClose={() => setIsAddRuleModalOpen(false)}
        onAdded={() => {
          setIsAddRuleModalOpen(false);
          window.dispatchEvent(new CustomEvent('refresh-data'));
        }}
      />

      <WebDiscoveryModal
        isOpen={isDiscoveryModalOpen}
        onClose={() => setIsDiscoveryModalOpen(false)}
        onAdded={() => {
          setIsDiscoveryModalOpen(false);
          window.dispatchEvent(new CustomEvent('refresh-data'));
        }}
      />
    </div>
  );
}
