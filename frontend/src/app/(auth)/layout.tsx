export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{ background: 'linear-gradient(135deg, #2D2A6E 0%, #1E1A5F 40%, #0F0D3A 100%)' }}
    >
      {/* Radial accent glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 50% 30%, rgba(227, 30, 36, 0.12), transparent 60%)' }}
      />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
