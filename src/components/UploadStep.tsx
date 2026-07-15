import type { DragEvent } from "react";
import type { ModelAsset } from "../model-analysis";
import type { UploadedModel } from "../workflow";

export function UploadStep({
  model,
  error,
  loading,
  onFile,
}: {
  model: UploadedModel<ModelAsset> | null;
  error: string | null;
  loading: boolean;
  onFile(file: File): void;
}) {
  const acceptDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };
  const analysis = model?.asset.analysis;

  return (
    <section className="step-panel" aria-labelledby="upload-heading">
      <h2 id="upload-heading" tabIndex={-1}>Upload an STL Model</h2>
      <p>STL files are parsed locally in your browser and never uploaded.</p>
      <div
        className="drop-zone"
        aria-busy={loading}
        onDragOver={(event) => event.preventDefault()}
        onDrop={acceptDrop}
      >
        <label htmlFor="stl-file">Choose an STL file</label>
        <input
          id="stl-file"
          name="stlFile"
          type="file"
          accept=".stl,model/stl"
          autoComplete="off"
          disabled={loading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = "";
          }}
        />
        <span>or drag and drop it here</span>
      </div>
      <p className="status-region" role="status" aria-live="polite">
        {loading ? "Reading and analyzing STL…" : ""}
      </p>
      {error && <p role="alert" className="alert error">{error}</p>}
      {model && analysis && (
        <div className="model-summary">
          <h3>{model.file.name}</h3>
          <p>{(model.file.size / 1024).toFixed(1)} KB · {analysis.triangleCount.toLocaleString()} triangles</p>
          <p>
            {analysis.bounds.size.x.toFixed(2)} × {analysis.bounds.size.y.toFixed(2)} ×
            {" "}{analysis.bounds.size.z.toFixed(2)} mm
          </p>
          {analysis.isHuge && (
            <p className="alert warning">Large model: previewing and slicing may be slow.</p>
          )}
        </div>
      )}
    </section>
  );
}
