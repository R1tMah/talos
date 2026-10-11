export function Skel({ h = 16, w = "100%", r }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skel" style={{ height: h, width: w, borderRadius: r }} />;
}

export function PageSkeleton() {
  return (
    <div className="screen" aria-busy="true" aria-label="Loading">
      <div style={{ height: 52, display: "flex", alignItems: "center" }}>
        <Skel h={26} w={140} />
      </div>
      <Skel h={76} r={16} />
      <div className="grid-2">
        <Skel h={140} r={16} />
        <Skel h={140} r={16} />
        <Skel h={140} r={16} />
        <Skel h={140} r={16} />
      </div>
      <Skel h={200} r={16} />
    </div>
  );
}
