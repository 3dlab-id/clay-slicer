import type { GcodeStats } from "../domain";

export function StatsPanel({ stats }: { stats: GcodeStats }) {
  return (
    <section aria-label="G-code estimates">
      <h3>G-code estimates</h3>
      <dl className="stats-grid">
        <div><dt>Lines</dt><dd>{stats.lineCount.toLocaleString()}</dd></div>
        <div><dt>Layers</dt><dd>{stats.layerCount.toLocaleString()}</dd></div>
        <div><dt>Motion time</dt><dd>{stats.estTimeMin.toFixed(1)} min estimated</dd></div>
        <div><dt>Extrusion distance</dt><dd>{stats.estFilamentMm.toFixed(1)} mm estimated</dd></div>
      </dl>
    </section>
  );
}
