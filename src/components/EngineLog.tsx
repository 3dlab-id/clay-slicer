export function EngineLog({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <details className="engine-log">
      <summary>Engine log ({messages.length})</summary>
      <pre>{messages.join("\n")}</pre>
    </details>
  );
}
