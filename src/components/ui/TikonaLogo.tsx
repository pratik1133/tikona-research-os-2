export default function TikonaLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 500 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Triangle and Circle mark */}
      <g stroke="#3b5b99" strokeWidth="6" fill="none">
        <circle cx="50" cy="50" r="30" />
        <path d="M50 15 L85 75 H15 Z" strokeLinejoin="round" />
      </g>
      {/* TIKONA CAPITAL Text */}
      <text
        x="100"
        y="65"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="46"
        fontWeight="bold"
        fill="#3b5b99"
        letterSpacing="2"
      >
        TIKONA CAPITAL
      </text>
    </svg>
  );
}
