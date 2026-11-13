'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '@/lib/api';

export default function DeleteRecordButton({ kind, id, label, onDeleted }: { kind: string; id: string; label: string; onDeleted: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!window.confirm(`Xóa hồ sơ “${label}”? Nếu hồ sơ đã có lịch sử hoặc dữ liệu liên quan, hệ thống sẽ từ chối để bảo toàn dữ liệu.`)) return;
    setBusy(true); setError('');
    try { await api(`/records/${kind}/${id}`, { method: 'DELETE' }); onDeleted(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không thể xóa hồ sơ'); }
    finally { setBusy(false); }
  }
  return <span className="delete-record-wrap"><button type="button" className="danger-button" onClick={remove} disabled={busy}><Trash2 size={15}/>{busy ? 'Đang xóa…' : 'Xóa hồ sơ'}</button>{error&&<span className="delete-record-error" role="alert">{error}</span>}</span>;
}
