import React, { useState, useEffect } from 'react';
import { Fingerprint, ShieldCheck, Plus, RefreshCw, Info, Package } from 'lucide-react';
import * as api from '../api';

const formatDate = (dateInput: string | number | Date) => {
  if (!dateInput) return '-';
  try {
    const date = new Date(dateInput);
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date).replace(/\//g, '-');
  } catch (e) {
    return String(dateInput);
  }
};

export default function SettingsView() {
  const [passkeys, setPasskeys] = useState<api.PasskeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingAll, setSyncingAll] = useState(false);
  const [versionInfo, setVersionInfo] = useState<any>(null);
  const [isUpdating, setIsUpdating] = useState(false);

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

  const fetchVersion = async () => {
    try {
      const info = await api.getSystemVersion();
      setVersionInfo(info);
    } catch (e) {
      console.error('获取系统版本失败', e);
    }
  };

  useEffect(() => {
    fetchPasskeys();
    fetchVersion();
  }, []);

  const handleUpdate = async () => {
    if (!confirm('确定要更新到最新代码版本并自动重启吗？')) return;
    setIsUpdating(true);
    try {
      await api.performUpdate();
      alert('更新指令已发送，系统正在重启，请于数秒后刷新页面。');
    } catch (e) {
      alert('更新失败: ' + String(e));
      setIsUpdating(false);
    }
  };

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

  const handleSyncAll = async () => {
    if (syncingAll) return;
    setSyncingAll(true);
    try {
      await api.syncAll();
      alert('同步成功');
    } catch (e) {
      alert(`同步失败: ${String(e)}`);
    } finally {
      setSyncingAll(false);
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
                            <p className="text-xs text-secondary">注册于 {formatDate(pk.created_at)}</p>
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
          <div className="px-8 py-5 border-b border-outline-variant bg-surface-bright flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-lg text-on-surface">系统版本与更新</h3>
              <p className="text-xs text-secondary mt-1">管理系统版本并获取最新功能。</p>
            </div>
            <Package className="text-primary" size={24} />
          </div>
          <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">当前版本：v{versionInfo?.current || '1.0.0'}</p>
                <p className="text-xs text-secondary mt-1">
                  {versionInfo?.hasUpdate 
                    ? `发现新版本 v${versionInfo.latest}，建议立即升级。` 
                    : '已是最新版本。若有新提交，也可通过右侧按钮强制拉取主线最新代码进行升级。'}
                </p>
              </div>
              <button 
                onClick={handleUpdate}
                disabled={isUpdating}
                className="bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-all shadow-sm flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw size={16} className={isUpdating ? 'animate-spin' : ''} />
                {isUpdating ? '正在更新...' : versionInfo?.hasUpdate ? '立即升级' : '强制在线更新'}
              </button>
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
                onClick={handleSyncAll}
                disabled={syncingAll}
                className="bg-surface-container-high px-4 py-2 rounded-lg text-sm font-medium hover:bg-surface-container-highest transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw size={16} className={syncingAll ? 'animate-spin' : ''} />
                {syncingAll ? '同步中...' : '立即同步'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
