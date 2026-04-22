export default function Home() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Hero Section */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6 relative">
        <div className="text-center max-w-4xl">
          <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold text-primary mb-6 tracking-tight font-headline">
            知识的<span className="text-primary-container">小行星</span>
          </h1>
          <p className="text-xl md:text-2xl text-on-surface-variant font-headline italic mb-4">
            知识的沉淀与共鸣
          </p>
          <p className="text-base text-on-surface-variant/60 font-body tracking-wide">
            Deposits and resonance of knowledge
          </p>
        </div>
      </section>
    </div>
  );
}
