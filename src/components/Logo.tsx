export function Logo({ light = false, className = "" }: { light?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <rect x="1" y="1" width="30" height="30" rx="7" fill={light ? "#1d2a46" : "#141d33"} stroke="#c4933a" strokeWidth="1.5" />
        <path d="M21.5 11.2a6.5 6.5 0 1 0 0 9.6" fill="none" stroke="#dec174" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M12.5 23.5l9-9" stroke="#fbfaf7" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span className={`font-serif text-xl font-semibold tracking-tight ${light ? "text-white" : "text-navy-950"}`}>
        Cashless <span className="text-gold-500">Edit</span>
      </span>
    </span>
  );
}
