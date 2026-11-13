export function BrandMark() {
  return <span className="ship-logo-mark" aria-hidden="true">
    <svg viewBox="0 0 48 48" fill="none">
      <path d="M24 7v22M22 11 12 26h10V11Zm4 5 11 10H26V16Z" fill="currentColor" opacity=".94"/>
      <path d="M8 29h32l-4.1 7.2a4 4 0 0 1-3.5 2H15.6a4 4 0 0 1-3.5-2L8 29Z" fill="currentColor"/>
      <path d="M7 42c2.3-1.8 4.7-1.8 7 0s4.7 1.8 7 0 4.7-1.8 7 0 4.7 1.8 7 0 4.7-1.8 7 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  </span>;
}

export function BrandLockup({ className = '' }: { className?: string }) {
  return <div className={`brand-lockup ${className}`.trim()}>
    <BrandMark />
    <strong>Hành trình vận tải</strong>
  </div>;
}
