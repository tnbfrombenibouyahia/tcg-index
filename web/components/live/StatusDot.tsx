export function StatusDot({
  color,
  pulsing = false,
  size = 8,
}: {
  color: string;
  pulsing?: boolean;
  size?: number;
}) {
  return (
    <span
      className={pulsing ? "pulse-dot" : undefined}
      style={{
        width: size,
        height: size,
        borderRadius: "9999px",
        background: color,
        flexShrink: 0,
      }}
    />
  );
}
