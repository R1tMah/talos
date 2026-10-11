export function OptionChip({
  tool, fields, onClick,
}: {
  tool: string;
  fields: [string, string][];
  onClick: () => void;
}) {
  return (
    <button type="button" className="chip" onClick={onClick}>
      <span className="chip-tool">{tool}</span>
      <span className="chip-fields">
        {fields.map(([k, v]) => (
          <span key={k}>
            <b>{k}</b> {v}
          </span>
        ))}
      </span>
    </button>
  );
}

export function PlainChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="chip chip-plain" onClick={onClick}>
      {label}
    </button>
  );
}
