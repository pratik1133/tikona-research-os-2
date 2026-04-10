export default function TikonaLogo({ className }: { className?: string }) {
  return (
    <img
      src="/tikona-logo.png"
      alt="Tikona Capital"
      className={className}
      style={{ objectFit: 'contain' }}
    />
  );
}
