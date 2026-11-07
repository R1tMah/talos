export function OptionChip({
  tool, fields, onClick, note,
}: {
  tool: string;
  fields: [string, string][];
  onClick: () => void;
  /** A short tag beside the name, e.g. "Last time". */
  note?: string;
}) {
  return (
    <button type="button" className={`chip${note ? " chip-suggested" : ""}`} onClick={onClick}>
      <span className="chip-tool">
        {tool}
        {note && <span className="chip-note">{note}</span>}
      </span>
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
