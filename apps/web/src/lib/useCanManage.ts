'use client';
import { useEffect, useState } from 'react';
import { api, CurrentUser } from './api';

export function useCanManage() {
  const [canManage, setCanManage] = useState(false);
  useEffect(() => { api<CurrentUser>('/auth/me').then(user => setCanManage(user.permissions.includes('shipments.manage'))).catch(() => {}); }, []);
  return canManage;
}
