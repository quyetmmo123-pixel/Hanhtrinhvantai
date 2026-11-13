'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, MapPinned, Ship } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import { LiveVessel, LiveVesselResponse } from '@/lib/maritime';
import { mapProvider } from '@/lib/map-provider';

const simulatedPositions = [
  { latitude: 13.42, longitude: 117.36, speedKnots: 16.8, course: 74, heading: 76 },
  { latitude: 5.92, longitude: 109.82, speedKnots: 13.2, course: 151, heading: 153 },
  { latitude: 7.84, longitude: 113.15, speedKnots: 14.6, course: 132, heading: 130 },
  { latitude: 17.65, longitude: 127.48, speedKnots: 17.1, course: 62, heading: 64 },
  { latitude: 2.74, longitude: 105.38, speedKnots: 12.9, course: 188, heading: 190 },
  { latitude: 10.21, longitude: 111.72, speedKnots: 15.4, course: 158, heading: 157 },
  { latitude: 19.83, longitude: 132.61, speedKnots: 16.2, course: 56, heading: 58 },
  { latitude: 4.16, longitude: 107.24, speedKnots: 11.7, course: 202, heading: 204 },
  { latitude: 15.08, longitude: 121.96, speedKnots: 15.9, course: 81, heading: 79 },
];

function date(value?: string | null) {
  return value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Chưa có';
}

export default function LiveVesselMapPage() {
  const [data, setData] = useState<LiveVesselResponse | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const simulationEnabled = true;

  const refresh = useCallback(async () => {
    try {
      const result = await api<LiveVesselResponse>('/tracking/live');
      setData(result);
      setError('');
      setSelectedId((current) => result.vessels.some((item) => item.voyage.id === current) ? current : result.vessels[0]?.voyage.id || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không tải được dữ liệu theo dõi.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const selected = useMemo(() => data?.vessels.find((item) => item.voyage.id === selectedId), [data, selectedId]);
  const simulatedPosition = useMemo(() => {
    if (!simulationEnabled || !selected || selected.position) return null;
    const vesselIndex = data?.vessels.findIndex((item) => item.voyage.id === selected.voyage.id) ?? 0;
    return { ...simulatedPositions[(vesselIndex + simulatedPositions.length) % simulatedPositions.length], speedKnots: simulatedPositions[(vesselIndex + simulatedPositions.length) % simulatedPositions.length].speedKnots, navigationStatus: 'UNDER WAY USING ENGINE', destination: selected.voyage.pod.name, eta: selected.scheduledEta, lastUpdate: new Date().toISOString(), provider: 'SIMULATION' };
  }, [data?.vessels, selected, simulationEnabled]);
  const position = selected?.position ?? simulatedPosition;
  const isSimulated = Boolean(simulatedPosition);
  const googleMapsUrl = position ? mapProvider.externalUrl(position) : undefined;
  const embedUrl = position ? mapProvider.embedUrl(position) : undefined;

  return <AppShell title="Live Vessel Map" subtitle="Theo dõi vị trí tàu đang chở container của công ty">
    {error && <div className="error-banner" role="alert">{error}</div>}

    <div className="live-map-layout">
      <section className="panel live-map-panel">
        <div className="panel-heading"><div><h3>Bản đồ tàu</h3><p>{selected ? `${selected.vessel.name} · ${selected.voyage.voyageNo}` : 'Chọn tàu đã có tọa độ AIS để xem vị trí'}</p></div><MapPinned size={18} /></div>
        {position && embedUrl ? <div className="live-map-frame"><iframe title={`${isSimulated ? 'Vị trí mô phỏng' : 'Vị trí AIS'} ${selected?.vessel.name}`} src={embedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /><div className={`map-coordinate-badge ${isSimulated ? 'is-simulated' : ''}`}><MapPinned size={14} />{isSimulated && <b>MÔ PHỎNG</b>} {position.latitude.toFixed(5)}, {position.longitude.toFixed(5)}</div></div> : <div className="live-map-empty"><div className="map-empty-grid"><MapPinned size={31} /></div><strong>{data?.connection === 'CONNECTED' ? 'CHƯA NHẬN ĐƯỢC BẢN TIN VỊ TRÍ' : 'AIS DATA NOT CONNECTED'}</strong><p>{data?.connection === 'CONNECTED' ? 'Provider đã kết nối nhưng chưa gửi bản tin AIS hợp lệ cho tàu đang theo dõi.' : 'Bật chế độ mô phỏng để xem tọa độ kiểm thử; dữ liệu AIS thật chỉ hiển thị khi provider được kết nối.'}</p></div>}
        {selected && <div className="map-selected-details">
          <div><span>TÀU / IMO</span><strong>{selected.vessel.name} · {selected.vessel.imo}</strong></div>
          <div><span>VOYAGE</span><strong>{selected.voyage.voyageNo}</strong></div>
          <div><span>TỐC ĐỘ</span><strong>{position?.speedKnots != null ? `${position.speedKnots} kn` : 'Chưa có'}</strong></div>
          <div><span>COURSE / HEADING</span><strong>{position?.course != null ? `${position.course}°` : 'Chưa có'} / {position?.heading != null ? `${position.heading}°` : '—'}</strong></div>
          <div><span>TRẠNG THÁI HÀNG HẢI</span><strong>{position?.navigationStatus || 'Chưa có'}</strong></div>
          <div><span>CẬP NHẬT VỊ TRÍ</span><strong>{isSimulated ? 'Thời điểm mô phỏng' : position ? date(position.lastUpdate) : 'Chưa nhận AIS'}</strong><small>{isSimulated ? 'Không phải thời điểm AIS' : position ? `Nguồn: ${position.provider}` : ''}</small></div>
          <div><span>CẢNG ĐÍCH</span><strong>{position?.destination || `${selected.voyage.pod.name} (${selected.voyage.pod.code})`}</strong><small>{position?.destination ? 'Theo AIS' : 'Theo lịch Voyage'}</small></div>
          <div><span>ETA</span><strong>{date(position?.eta || selected.scheduledEta)}</strong><small>{position?.eta ? 'Theo AIS' : 'Theo lịch Voyage'}</small></div>
          {googleMapsUrl && <a className="secondary-button" href={googleMapsUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {isSimulated ? 'Mở tọa độ mô phỏng trên Google Maps' : 'Mở tọa độ trong Google Maps'}</a>}
        </div>}
      </section>

      <section className="panel live-vessel-list">
        <div className="panel-heading"><div><h3>Tàu đang chở hàng</h3><p>{data?.vessels.length ?? 0} chuyến · chỉ tính container đã Loaded</p></div><Ship size={18} /></div>
        {loading && !data ? <div className="empty-table">Đang tải danh sách tàu…</div> : data?.vessels.length ? <div className="live-vessel-items">{data.vessels.map((item: LiveVessel) => <article key={item.voyage.id} className={`live-vessel-item ${selectedId === item.voyage.id ? 'selected' : ''}`}>
          <button className="live-vessel-select" onClick={() => setSelectedId(item.voyage.id)} aria-label={`Chọn tàu ${item.vessel.name}`}>
            <span className="vessel-list-icon"><Ship size={16} /></span><span className="live-vessel-title"><strong>{item.vessel.name}</strong><small>IMO {item.vessel.imo} · Voyage {item.voyage.voyageNo}</small></span><span className={`position-indicator ${item.position ? 'has-position' : simulationEnabled ? 'is-simulated' : ''}`} />
          </button>
          <div className="live-vessel-summary"><span><b>{item.loadedContainerCount}</b> container</span><span>{simulationEnabled && !item.position ? 'MÔ PHỎNG · ' : ''}{item.voyage.pod.code} · ETA {date(item.scheduledEta)}</span></div>
          <button className="view-vessel-position" onClick={() => setSelectedId(item.voyage.id)}><MapPinned size={14} /> XEM VỊ TRÍ TÀU</button>
          <div className="live-vessel-containers"><strong>Container trên tàu</strong>{item.containers.map((container) => <Link key={container.id} href={`/containers/${container.id}`}>{container.containerNo}<small>{container.shipmentNo}</small></Link>)}</div>
        </article>)}</div> : <div className="live-map-no-vessels"><Ship size={25} /><strong>Chưa có tàu rời cảng đang chở container</strong><p>Gán container vào Voyage, xác nhận trạng thái Loaded và cập nhật Voyage thành Departed để đưa tàu vào danh sách.</p></div>}
      </section>
    </div>
  </AppShell>;
}
